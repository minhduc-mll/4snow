-- Compare gameplay membership by normalized spelling. A revised definition can
-- change the build hash without adding or removing an answer spelling.
create function private.vtv_release_changes(p_current jsonb, p_next jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_object_agg(level, jsonb_build_object('guesses',guesses,'answers',answers))
  from unnest(array['3','5','7','9']) as levels(level)
  cross join lateral (
    with prev as (select value from jsonb_array_elements_text(p_current->'levels'->level->'guesses')),
         next as (select value from jsonb_array_elements_text(p_next->'levels'->level->'guesses'))
    select jsonb_build_object(
      'added',(select count(*) from (select value from next except select value from prev) as added),
      'removed',(select count(*) from (select value from prev except select value from next) as removed)
    ) as guesses
  ) as guess_diff
  cross join lateral (
    with prev as (select value->>'normalized' as spelling from jsonb_array_elements(p_current->'levels'->level->'answers')),
         next as (select value->>'normalized' as spelling from jsonb_array_elements(p_next->'levels'->level->'answers'))
    select jsonb_build_object(
      'added',(select count(*) from (select spelling from next except select spelling from prev) as added),
      'removed',(select count(*) from (select spelling from prev except select spelling from next) as removed)
    ) as answers
  ) as answer_diff;
$$;

create or replace function public.vtv_publication_preview(p_request_id uuid,p_idempotency_key uuid,p_request_hash text,p_expected_draft_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare draft private.vtv_draft%rowtype; existing private.vtv_requests%rowtype; document jsonb; report jsonb; build_id uuid:=gen_random_uuid(); release_id uuid:=gen_random_uuid(); samples jsonb; event_id uuid; hash text; current_release_id uuid; current_payload jsonb;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' or p_expected_draft_revision is null or p_expected_draft_revision<0 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vtv-publication-preview:'||p_idempotency_key::text,0));
  select * into existing from private.vtv_requests where operation='publication-preview' and idempotency_key=p_idempotency_key;
  if found then if existing.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return existing.result; end if;
  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision<>p_expected_draft_revision then raise exception 'REVISION_CONFLICT'; end if;
  document:=private.vtv_build_document(release_id); hash:=private.vtv_payload_hash(document->'payload');
  select jsonb_object_agg(key,(select coalesce(jsonb_agg(value),'[]'::jsonb) from (select value from jsonb_array_elements(value->'answers') limit 3) sample)) into samples from jsonb_each(document->'payload'->'levels');
  select r.id, r.public_payload into current_release_id, current_payload
    from public.vtv_current_release c join public.vtv_releases r on r.id=c.release_id where c.id=1;
  report:=jsonb_build_object(
    'buildId',build_id,
    'contentHash',hash,
    'valid',jsonb_array_length(document->'errors')=0,
    'errors',(select coalesce(jsonb_agg(value),'[]'::jsonb) from
      (select value from jsonb_array_elements(document->'errors') limit 100) e),
    'errorCount',jsonb_array_length(document->'errors'),
    'coverage',document->'coverage',
    'draftRevision',draft.revision::text,
    'expectedCurrentReleaseId',current_release_id,
    'payloadBytes',octet_length(private.vtv_canonical(document->'payload')),
    'changes',private.vtv_release_changes(current_payload,document->'payload'),
    'configuration',jsonb_build_object('configurationId',draft.configuration_id,
      'attemptLimit',draft.attempt_limit,'normalizerVersion',draft.normalizer_version),
    'attributionCount',jsonb_array_length(document->'payload'->'attributions'),
    'sourceCount',(select count(distinct value->>'sourceId') from jsonb_array_elements(document->'inputReferences')),
    'sources',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',source.id,'name',source.metadata->>'name','revision',source.resource_revision)
      order by source.metadata->>'name',source.id),'[]'::jsonb)
      from (
        select s.id,s.metadata,s.resource_revision
        from private.vtv_sources s
        join (select distinct value->>'sourceId' as id from jsonb_array_elements(document->'inputReferences')) refs
          on s.id=refs.id::uuid
        order by s.metadata->>'name',s.id limit 100
      ) source),
    'playerSamples',samples,
    'sampleAttributions',(select coalesce(jsonb_agg(a),'[]'::jsonb)
      from jsonb_array_elements(document->'payload'->'attributions') a
      where exists(select 1 from jsonb_each(samples) s cross join lateral
        jsonb_array_elements(s.value) x where x->'attributionIds' @> jsonb_build_array(a->>'id')))
  );
  insert into private.vtv_release_builds(id,release_id,expected_draft_revision,payload,payload_sha256,validation_report,input_references) values(build_id,release_id,draft.revision,document->'payload',hash,report,jsonb_build_object('entries',document->'inputReferences','configuration',report->'configuration'));
  insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration) values('publication-preview',p_request_id,'admin',draft.revision,draft.revision,jsonb_build_object('expectedDraftRevision',draft.revision::text),report,report->'configuration') returning id into event_id;
  insert into private.vtv_requests(operation,idempotency_key,request_hash,result,event_id) values('publication-preview',p_idempotency_key,p_request_hash,report,event_id);
  return report;
end; $$;

-- Only the authenticated Edge workflow can retrieve a private playable build.
-- No public release/pointer writes are made by this read.
create function public.vtv_preview_game(p_build_id uuid,p_content_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare build private.vtv_release_builds%rowtype;
begin
  if p_build_id is null or p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT';
  end if;
  select * into build from private.vtv_release_builds where id=p_build_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if build.payload_sha256<>p_content_hash then raise exception 'REVISION_CONFLICT'; end if;
  if build.validation_report->>'valid' is distinct from 'true' then raise exception 'RELEASE_INCOMPLETE'; end if;
  return jsonb_build_object('id',build.release_id,'configuration_id',build.payload->'configurationId',
    'schema_version',build.payload->'schemaVersion','normalizer_version',build.payload->'normalizerVersion',
    'attempt_limit',build.payload->'attemptLimit','published_at',build.created_at,
    'public_payload',build.payload,'payload_sha256',build.payload_sha256);
end; $$;

-- The immutable build fixes the submitted hash and baseline before the original
-- publish transaction does its locked revision, payload and receipt checks.
create function public.vtv_publish_confirmed(
  p_request_id uuid,p_idempotency_key uuid,p_request_hash text,p_build_id uuid,
  p_expected_draft_revision bigint,p_expected_current_release_id uuid,p_content_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare build private.vtv_release_builds%rowtype;
begin
  if p_build_id is null or p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_INPUT';
  end if;
  select * into build from private.vtv_release_builds where id=p_build_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if build.payload_sha256<>p_content_hash or
     build.validation_report->>'expectedCurrentReleaseId' is distinct from p_expected_current_release_id::text then
    raise exception 'REVISION_CONFLICT';
  end if;
  return public.vtv_publish(p_request_id,p_idempotency_key,p_request_hash,p_build_id,
    p_expected_draft_revision,p_expected_current_release_id);
end; $$;

revoke all on function public.vtv_preview_game(uuid,text),
  public.vtv_publish_confirmed(uuid,uuid,text,uuid,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.vtv_preview_game(uuid,text),
  public.vtv_publish_confirmed(uuid,uuid,text,uuid,bigint,uuid,text) to service_role;
