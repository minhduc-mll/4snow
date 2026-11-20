-- Manual entries use a dedicated, finalized provenance record per submission. Bulk
-- imports retain their existing validation and lineage rules.
alter table private.vtv_sources drop constraint vtv_sources_kind_check;
alter table private.vtv_sources add constraint vtv_sources_kind_check
  check (kind in ('kaikki', 'underthesea-resource', 'internal-editorial'));
alter table private.vtv_entry_revisions drop constraint vtv_entry_revisions_review_check;
alter table private.vtv_entry_revisions add constraint vtv_entry_revisions_review_check
  check (review in ('pending', 'approved', 'rejected', 'withdrawn'));
create index vtv_sources_created_id_idx on private.vtv_sources(created_at, id);

create function public.vtv_candidate_sources(p_after_time timestamptz, p_after_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if (p_after_time is null) <> (p_after_id is null) then raise exception 'INVALID_INPUT'; end if;
  with selected as (
    select s.id, s.created_at, s.kind, s.metadata->>'name' as name, s.resource_revision,
      coalesce(rr.decision, 'unresolved') as decision
    from private.vtv_sources s
    left join lateral (select decision from private.vtv_rights_reviews
      where source_id=s.id order by draft_revision desc limit 1) rr on true
    where (p_after_time is null or (s.created_at,s.id) > (p_after_time,p_after_id))
      and (s.kind <> 'internal-editorial' or rr.decision='cleared')
      and rr.decision is distinct from 'rejected'
    order by s.created_at,s.id limit 51
  ), numbered as (select *, row_number() over (order by created_at,id) rn from selected)
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'resourceRevision',resource_revision,'rightsDecision',decision) order by created_at,id)
      filter (where rn<=50),'[]'::jsonb),
    'nextPosition', case when count(*)>50 then (jsonb_agg(jsonb_build_object('createdAt',created_at,'id',id)) filter (where rn=50))->0 else null end
  ) into result from numbered;
  return result;
end; $$;
revoke all on function public.vtv_candidate_sources(timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.vtv_candidate_sources(timestamptz,uuid) to service_role;

create function public.vtv_create_candidate(
  p_request_id uuid, p_idempotency_key uuid, p_request_hash text,
  p_input jsonb, p_normalized text, p_level integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  existing private.vtv_requests%rowtype;
  draft private.vtv_draft%rowtype;
  source private.vtv_sources%rowtype;
  decision text;
  entry_id uuid := gen_random_uuid();
  revision_id uuid := gen_random_uuid();
  provenance_id uuid := gen_random_uuid();
  entry_url text;
  source_entry text;
  source_sense text := p_input->>'sourceSenseId';
  original text := p_input->>'original';
  definition text := p_input->>'definitionVi';
  expected_draft bigint;
  event_id uuid;
  result jsonb;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_input) is distinct from 'object' or p_level is null or p_level not in (3,5,7,9)
    or char_length(original) is null or char_length(original) not between 1 and 120
    or char_length(p_normalized) is distinct from p_level or p_normalized is distinct from private.vtv_spelling(original)
    or p_normalized !~ '^[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]+$'
    or (definition is not null and (btrim(definition)='' or char_length(definition)>2000))
    or jsonb_typeof(p_input->'allowAlternateMeaning') is distinct from 'boolean'
    then raise exception 'INVALID_INPUT'; end if;

  perform pg_advisory_xact_lock(hashtextextended('vtv-create-candidate:' || p_idempotency_key::text,0));
  select * into existing from private.vtv_requests where operation='create-candidate' and idempotency_key=p_idempotency_key;
  if found then
    if existing.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.result;
  end if;
  expected_draft := (p_input->>'expectedDraftRevision')::bigint;
  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision is distinct from expected_draft then raise exception 'REVISION_CONFLICT'; end if;
  select * into source from private.vtv_sources where id=(p_input->>'sourceId')::uuid;
  if not found then raise exception 'NOT_FOUND'; end if;
  select rr.decision into decision from private.vtv_rights_reviews rr where rr.source_id=source.id order by rr.draft_revision desc limit 1;
  if decision='rejected' or (source.kind='internal-editorial' and decision is distinct from 'cleared') then raise exception 'INVALID_INPUT'; end if;
  entry_url := p_input->>'entryUrl';
  source_entry := p_input->>'sourceEntryId';

  if source.kind='internal-editorial' then
    entry_url := coalesce(entry_url,source.metadata->>'artifactUrl');
    source_entry := coalesce(source_entry,entry_id::text);
  end if;

  if private.vtv_https(entry_url) is distinct from true or char_length(entry_url)>2048
    or char_length(btrim(source_entry)) is null or char_length(btrim(source_entry)) not between 1 and 300
    or (source_sense is not null and char_length(btrim(source_sense)) not between 1 and 300)
    or (source_sense is not null and char_length(source_sense)>300)
    or char_length(source_entry)>300
    then raise exception 'INVALID_INPUT'; end if;

  if not (p_input->>'allowAlternateMeaning')::boolean and exists (
    select 1 from private.vtv_current_candidates c where c.normalized=p_normalized and c.level=p_level
  ) then raise exception 'SPELLING_EXISTS'; end if;

  insert into private.vtv_imports(id,artifact_id,artifact_revision,expected_chunks,status,total_entries,finalized_at)
    values (provenance_id,entry_id,'manual-' || entry_id::text,1,'finalized',1,now());
  insert into private.vtv_entries(id,source_id,external_id,source_entry_id,source_sense_id,entry_url,source_payload,import_id,current_revision_id)
    values (entry_id,source.id,'manual:' || entry_id::text,source_entry,source_sense,entry_url,
      jsonb_build_object('origin','manual','language','vi','original',original,'definitionVi',definition),provenance_id,revision_id);
  insert into private.vtv_entry_revisions(id,entry_id,revision_number,original,normalized,level,definition_vi,review,actor_role)
    values (revision_id,entry_id,1,original,p_normalized,p_level,definition,'pending','admin');
  update private.vtv_draft set revision=revision+1,updated_at=now() where id=1 returning * into draft;
  result := jsonb_build_object('entryId',entry_id,'revisionId',revision_id,'revisionNumber',1,'review','pending','draftRevision',draft.revision::text);
  insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration)
    values ('create-candidate',p_request_id,'admin',expected_draft,draft.revision,p_input,result,
      jsonb_build_object('configurationId',draft.configuration_id,'attemptLimit',draft.attempt_limit,
        'normalizerVersion',draft.normalizer_version,'sourceId',source.id,'provenanceId',provenance_id))
    returning id into event_id;
  insert into private.vtv_requests(operation,idempotency_key,request_hash,result,event_id)
    values ('create-candidate',p_idempotency_key,p_request_hash,result,event_id);
  return result;
end; $$;
revoke all on function public.vtv_create_candidate(uuid,uuid,text,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.vtv_create_candidate(uuid,uuid,text,jsonb,text,integer) to service_role;

create or replace function public.vtv_review_candidate(
  p_request_id uuid, p_idempotency_key uuid, p_request_hash text,
  p_input jsonb, p_normalized text, p_level integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing private.vtv_requests%rowtype;
  draft private.vtv_draft%rowtype;
  entry private.vtv_entries%rowtype;
  current_revision private.vtv_entry_revisions%rowtype;
  new_id uuid := gen_random_uuid();
  next_review text;
  next_answer boolean;
  result jsonb;
  event_id uuid;
  expected_draft bigint;
  checks jsonb;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' or pg_catalog.jsonb_typeof(p_input) <> 'object' or p_level not in (3,5,7,9) or pg_catalog.char_length(p_normalized) <> p_level then raise exception 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vtv-review:' || p_idempotency_key::text, 0));
  select * into existing from private.vtv_requests where operation = 'review' and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.result;
  end if;
  expected_draft := (p_input->>'expectedDraftRevision')::bigint;
  select * into draft from private.vtv_draft where id = 1 for update;
  if draft.revision <> expected_draft then raise exception 'REVISION_CONFLICT'; end if;
  select e.* into entry from private.vtv_entries e join private.vtv_imports imp on imp.id = e.import_id and imp.status = 'finalized' where e.id = (p_input->>'entryId')::uuid for update of e;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into current_revision from private.vtv_entry_revisions where id = entry.current_revision_id and entry_id = entry.id;
  if current_revision.revision_number <> (p_input->>'expectedEntryRevision')::integer then raise exception 'REVISION_CONFLICT'; end if;
  checks := p_input->'exclusionChecks';
  next_review := p_input->>'review';
  next_answer := (p_input->>'answerEligible')::boolean;
  if next_review not in ('pending','approved','rejected','withdrawn') or (p_input->>'category') not in ('common','regional','technical','less-common','excluded') or pg_catalog.jsonb_typeof(checks) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  if current_revision.review = 'withdrawn' or next_review = 'withdrawn' then
    if (current_revision.review = 'withdrawn' and next_review <> 'pending')
      or current_revision.original is distinct from p_input->>'original'
      or current_revision.definition_vi is distinct from p_input->>'definitionVi'
      or next_answer then raise exception 'INVALID_INPUT'; end if;
  elsif current_revision.original is distinct from p_input->>'original' or current_revision.definition_vi is distinct from p_input->>'definitionVi' then
    next_review := 'pending';
    next_answer := false;
  end if;
  if next_review = 'approved' and (checks->>'names' is distinct from 'true' or checks->>'abbreviations' is distinct from 'true' or checks->>'offensive' is distinct from 'true' or checks->>'malformed' is distinct from 'true' or checks->>'unverified' is distinct from 'true' or p_input->>'category' = 'excluded' or pg_catalog.btrim(p_input->>'rationale') = '') then raise exception 'INVALID_INPUT'; end if;
  if next_answer and (next_review <> 'approved' or p_input->>'category' <> 'common' or pg_catalog.btrim(coalesce(p_input->>'definitionVi','')) = '' or pg_catalog.btrim(p_input->>'rationale') = '') then raise exception 'INVALID_INPUT'; end if;
  insert into private.vtv_entry_revisions(id, entry_id, revision_number, previous_revision_id, original, normalized, level, definition_vi, review, answer_eligible, category, rationale, exclusion_checks, actor_role)
  values (new_id, entry.id, current_revision.revision_number + 1, current_revision.id, p_input->>'original', p_normalized, p_level, p_input->>'definitionVi', next_review, next_answer, p_input->>'category', p_input->>'rationale', checks, 'admin');
  -- Explicitly removing answer eligibility clears only this entry's selection.
  if next_review = 'withdrawn' or (next_review = 'approved' and current_revision.answer_eligible and not next_answer) then
    delete from private.vtv_answer_selections where normalized=current_revision.normalized
      and entry_revision_id in (select id from private.vtv_entry_revisions where entry_id=entry.id);
  end if;
  update private.vtv_entries set current_revision_id = new_id where id = entry.id;
  update private.vtv_draft set revision = revision + 1, updated_at = pg_catalog.now() where id = 1 returning * into draft;
  result := pg_catalog.jsonb_build_object('entryId', entry.id, 'revisionId', new_id, 'revisionNumber', current_revision.revision_number + 1, 'review', next_review, 'answerEligible', next_answer, 'draftRevision', draft.revision::text);
  insert into private.vtv_editorial_events(operation, request_id, actor_role, previous_draft_revision, next_draft_revision, input, output, configuration)
  values (case when next_review='withdrawn' then 'withdraw-candidate' when current_revision.review='withdrawn' then 'restore-candidate' else 'review' end, p_request_id, 'admin', expected_draft, draft.revision, p_input, result, pg_catalog.jsonb_build_object('configurationId', draft.configuration_id, 'attemptLimit', draft.attempt_limit, 'normalizerVersion', draft.normalizer_version, 'previousRevisionId', current_revision.id, 'nextRevisionId', new_id)) returning id into event_id;
  insert into private.vtv_requests(operation, idempotency_key, request_hash, result, event_id) values ('review', p_idempotency_key, p_request_hash, result, event_id);
  return result;
end; $$;

create or replace function public.vtv_list_candidates(p_filters jsonb, p_after_time timestamptz, p_after_id uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if pg_catalog.jsonb_typeof(p_filters) <> 'object' or p_limit not between 1 and 100 or ((p_after_time is null) <> (p_after_id is null)) then raise exception 'INVALID_INPUT'; end if;
  with selected as (
    select e.id, e.created_at, e.source_id, e.external_id, e.entry_url, r.original, r.normalized, r.level, r.definition_vi, r.review, r.answer_eligible, r.revision_number,
      exists(select 1 from private.vtv_entries e2 join private.vtv_imports i2 on i2.id=e2.import_id and i2.status='finalized' join private.vtv_entry_revisions r2 on r2.id=e2.current_revision_id where e2.id<>e.id and r2.normalized=r.normalized) as collision
    from private.vtv_entries e
    join private.vtv_imports imp on imp.id=e.import_id and imp.status='finalized'
    join private.vtv_entry_revisions r on r.id=e.current_revision_id and r.entry_id=e.id
    where (p_after_time is null or (e.created_at,e.id) > (p_after_time,p_after_id))
      and (coalesce(p_filters->>'spelling','') = '' or strpos(r.normalized,p_filters->>'spelling') > 0)
      and ((p_filters->>'sourceId') is null or e.source_id=(p_filters->>'sourceId')::uuid)
      and ((p_filters->>'level') is null or r.level=(p_filters->>'level')::integer)
      and ((p_filters->>'review') is null or r.review=p_filters->>'review')
      and ((p_filters->>'hasDefinition') is null or (r.definition_vi is not null)=(p_filters->>'hasDefinition')::boolean)
      and (not coalesce((p_filters->>'collisionsOnly')::boolean,false) or exists(select 1 from private.vtv_entries e2 join private.vtv_imports i2 on i2.id=e2.import_id and i2.status='finalized' join private.vtv_entry_revisions r2 on r2.id=e2.current_revision_id where e2.id<>e.id and r2.normalized=r.normalized))
    order by e.created_at,e.id limit p_limit+1
  ), numbered as (select *, row_number() over (order by created_at,id) rn from selected)
  select pg_catalog.jsonb_build_object(
    'items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'createdAt',created_at,'sourceId',source_id,'externalId',external_id,'entryUrl',entry_url,'original',original,'normalized',normalized,'level',level,'definitionVi',definition_vi,'review',review,'answerEligible',answer_eligible,'revisionNumber',revision_number,'collision',collision) order by created_at,id) filter (where rn<=p_limit),'[]'::jsonb),
    'nextPosition', case when count(*)>p_limit then (pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('createdAt',created_at,'id',id) order by created_at,id) filter (where rn=p_limit))->0 else null end,
    'draftRevision',(select revision::text from private.vtv_draft where id=1)
  ) into result from numbered;
  return result;
end; $$;
create function private.vtv_preview_changes(p_previous jsonb, p_next jsonb, p_previous_entries jsonb)
returns jsonb language sql stable set search_path='' as $$
  with levels as (
    select level::text as level, coalesce(p_previous->(level::text),'{"guesses":[],"answers":[]}'::jsonb) as previous,
      p_next->(level::text) as upcoming
    from (values (3),(5),(7),(9)) as playable(level)
  ), old_guesses as (
    select level, value as normalized from levels cross join lateral jsonb_array_elements_text(previous->'guesses')
  ), new_guesses as (
    select level, value as normalized from levels cross join lateral jsonb_array_elements_text(upcoming->'guesses')
  ), old_answers as (
    select level, value->>'normalized' as normalized, value as answer
    from levels cross join lateral jsonb_array_elements(previous->'answers')
  ), new_answers as (
    select level, value->>'normalized' as normalized, value as answer
    from levels cross join lateral jsonb_array_elements(upcoming->'answers')
  ), withdrawn_spellings as (
    select distinct old_revision.level::text as level, old_revision.normalized
    from jsonb_array_elements(coalesce(p_previous_entries, '[]'::jsonb)) published_entry
    join private.vtv_entries e on e.id=(published_entry->>'entryId')::uuid
    join private.vtv_entry_revisions r on r.id=e.current_revision_id and r.review='withdrawn'
    join private.vtv_entry_revisions old_revision on old_revision.id=(published_entry->>'revisionId')::uuid
  ), changes as (
    select coalesce(old.level,new.level) as level, coalesce(old.normalized,new.normalized) as normalized,
      case when old.normalized is null then 'guessAdded' when new.normalized is null then 'guessRemoved' else 'guessRetained' end as kind
    from old_guesses old full join new_guesses new using (level,normalized)
    left join withdrawn_spellings w on w.level=old.level and w.normalized=old.normalized
    where old.normalized is null or new.normalized is null or w.normalized is not null
    union all
    select coalesce(old.level,new.level), coalesce(old.normalized,new.normalized),
      case when old.answer is null then 'answerAdded' when new.answer is null then 'answerRemoved' else 'answerChanged' end
    from old_answers old full join new_answers new using (level,normalized)
    where old.answer - 'id' is distinct from new.answer - 'id'
  ), numbered as (
    select *, row_number() over(partition by kind order by level::integer, normalized collate "C") as seq from changes
  ), samples as (
    select kind, jsonb_build_object('total',count(*),'items',
      jsonb_agg(jsonb_build_object('level',level::integer,'normalized',normalized) order by seq) filter (where seq<=30)) as summary
    from numbered group by kind
  )
  select jsonb_build_object(
    'previousCoverage',(select jsonb_object_agg(level,jsonb_build_object('guesses',jsonb_array_length(previous->'guesses'),
      'answers',jsonb_array_length(previous->'answers'))) from levels),
    'groups',coalesce((select jsonb_object_agg(kind,summary) from samples),'{}'::jsonb)
  );
$$;
revoke all on function private.vtv_preview_changes(jsonb,jsonb,jsonb) from public, anon, authenticated;

create or replace function public.vtv_publication_preview(p_request_id uuid,p_idempotency_key uuid,p_request_hash text,p_expected_draft_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare draft private.vtv_draft%rowtype; existing private.vtv_requests%rowtype; document jsonb; report jsonb; build_id uuid:=gen_random_uuid(); release_id uuid:=gen_random_uuid(); samples jsonb; event_id uuid; hash text; current_release_id uuid; current_payload jsonb; current_entries jsonb;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' or p_expected_draft_revision is null or p_expected_draft_revision<0 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vtv-publication-preview:'||p_idempotency_key::text,0));
  select * into existing from private.vtv_requests where operation='publication-preview' and idempotency_key=p_idempotency_key;
  if found then if existing.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return existing.result; end if;
  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision<>p_expected_draft_revision then raise exception 'REVISION_CONFLICT'; end if;
  document:=private.vtv_build_document(release_id); hash:=private.vtv_payload_hash(document->'payload');
  select jsonb_object_agg(key,(select coalesce(jsonb_agg(value),'[]'::jsonb) from (select value from jsonb_array_elements(value->'answers') limit 3) sample)) into samples from jsonb_each(document->'payload'->'levels');
  select r.id, r.public_payload, b.input_references->'entries' into current_release_id, current_payload, current_entries
    from public.vtv_current_release c join public.vtv_releases r on r.id=c.release_id
    left join private.vtv_release_builds b on b.release_id=r.id where c.id=1;
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
    'spellingChanges',private.vtv_preview_changes(current_payload->'levels',document->'payload'->'levels',current_entries),
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

create or replace function public.vtv_bulk_create(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  selection_id uuid := gen_random_uuid();
  revision bigint;
  filters jsonb := p_input->'filters';
  requested jsonb := p_input->'targets';
  frozen jsonb;
  target_count integer;
  histogram jsonb;
begin
  if jsonb_typeof(filters) is distinct from 'object' or jsonb_typeof(requested) not in ('array','null') then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(requested)='array' and jsonb_array_length(requested) not between 1 and 500 then raise exception 'INVALID_INPUT'; end if;
  -- All existing dictionary writers serialize on the singleton draft row.
  select d.revision into revision from private.vtv_draft d where id=1 for update;
  if revision is distinct from (p_input->>'expectedDraftRevision')::bigint then raise exception 'REVISION_CONFLICT'; end if;

  with requested_rows as (
    select (r->>'entryId')::uuid as entry_id,(r->>'expectedEntryRevision')::integer as revision_number
    from jsonb_array_elements(case when jsonb_typeof(requested)='array' then requested else '[]'::jsonb end) r
  ), candidates as (
    select c.entry_id,c.id,c.revision_number,c.level,rights.id as rights_id,rights.decision,
      c.review in ('rejected','withdrawn') or c.category='excluded' as excluded,
      c.normalized=private.vtv_spelling(c.original)
        and c.normalized ~ '^[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]+$' as valid_spelling,
      nullif(btrim(c.definition_vi),'') is null as missing_meaning,
      lower(coalesce(c.definition_vi,'')) ~ '(^|[^[:alpha:]])(hiếm|cổ|địa phương)([^[:alpha:]]|$)' as meaning_warning,
      exists(select 1 from private.vtv_entries e2 join private.vtv_imports i2 on i2.id=e2.import_id and i2.status='finalized'
        join private.vtv_entry_revisions r2 on r2.id=e2.current_revision_id where r2.normalized=c.normalized and e2.id<>c.entry_id) as collision,
      exists(select 1 from private.vtv_answer_selections s where s.normalized=c.normalized) as has_answer_selection
    from private.vtv_current_candidates c
    left join requested_rows r on r.entry_id=c.entry_id and r.revision_number=c.revision_number
    left join lateral (select id,decision from private.vtv_rights_reviews rr where rr.source_id=c.source_id order by rr.draft_revision desc limit 1) rights on true
    where (requested='null'::jsonb or r.entry_id is not null)
      and (requested<>'null'::jsonb or (
        (coalesce(filters->>'spelling','')='' or strpos(c.normalized,filters->>'spelling')>0)
        and (filters->>'sourceId' is null or c.source_id=(filters->>'sourceId')::uuid)
        and (filters->>'level' is null or c.level=(filters->>'level')::integer)
        and (filters->>'review' is null or c.review=filters->>'review')
        and (filters->>'hasDefinition' is null or (c.definition_vi is not null)=(filters->>'hasDefinition')::boolean)
      ))
    order by c.entry_id
  ), bounded as (
    select * from candidates where requested<>'null'::jsonb or not coalesce((filters->>'collisionsOnly')::boolean,false) or collision limit 20001
  )
  select count(*)::integer, jsonb_build_object('3',count(*) filter(where level=3),'5',count(*) filter(where level=5),'7',count(*) filter(where level=7),'9',count(*) filter(where level=9)),
    jsonb_agg(jsonb_build_object('entry_id',entry_id,'entry_revision_id',id,'entry_revision',revision_number,'rights_review_id',rights_id,
      'blocker',case when decision is distinct from 'cleared' then 'source-rights' when valid_spelling is distinct from true then 'invalid-spelling' when excluded then 'excluded' when has_answer_selection then 'answer-collision' end,
      'answer_blocker',case when missing_meaning then 'missing-meaning' when meaning_warning then 'meaning-warning' when collision then 'answer-collision' end,
      'meaning_warning',meaning_warning) order by entry_id)
  into target_count,histogram,frozen from bounded;

  if jsonb_typeof(requested)='array' and jsonb_array_length(requested)<>target_count then raise exception 'REVISION_CONFLICT'; end if;
  if target_count not between 1 and 20000 then raise exception 'INVALID_INPUT'; end if;

  insert into private.vtv_bulk_selections(id,filters,selection_hash,original_draft_revision,draft_revision,item_count,distribution)
    values(selection_id,filters,encode(sha256(convert_to(jsonb_build_object('filters',filters,'draftRevision',revision,'targets',frozen)::text,'UTF8')),'hex'),revision,revision,target_count,histogram);
  insert into private.vtv_bulk_targets(selection_id,position,entry_id,entry_revision_id,entry_revision,rights_review_id,blocker,answer_blocker,meaning_warning)
    select selection_id,(f.ordinality-1)::integer,row.entry_id,row.entry_revision_id,row.entry_revision,row.rights_review_id,row.blocker,row.answer_blocker,row.meaning_warning
    from jsonb_array_elements(frozen) with ordinality f(value,ordinality)
    cross join lateral jsonb_to_record(f.value) as row(entry_id uuid,entry_revision_id uuid,entry_revision integer,rights_review_id uuid,blocker text,answer_blocker text,meaning_warning boolean);

  return public.vtv_bulk_page(jsonb_build_object('selectionId',selection_id,'offset',0));
end; $$;


create or replace function public.vtv_review_rights(p_request_id uuid, p_idempotency_key uuid, p_request_hash text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing private.vtv_requests%rowtype; draft private.vtv_draft%rowtype; previous_id uuid; new_id uuid := gen_random_uuid(); event_id uuid; result jsonb; v_source_id uuid; expected bigint;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' or pg_catalog.jsonb_typeof(p_input) <> 'object' or p_input->>'decision' not in ('cleared','unresolved','rejected') or pg_catalog.char_length(coalesce(p_input->>'evidence','')) not between 1 and 4000 or pg_catalog.btrim(p_input->>'evidence') = '' or pg_catalog.char_length(coalesce(p_input->>'obligations','')) not between 1 and 4000 or pg_catalog.btrim(p_input->>'obligations') = '' then raise exception 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vtv-rights:' || p_idempotency_key::text,0));
  select * into existing from private.vtv_requests where operation='rights-review' and idempotency_key=p_idempotency_key;
  if found then
    if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.result;
  end if;
  v_source_id := (p_input->>'sourceId')::uuid; expected := (p_input->>'expectedDraftRevision')::bigint;
  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision <> expected then raise exception 'REVISION_CONFLICT'; end if;
  if not exists(select 1 from private.vtv_sources where id=v_source_id and kind='internal-editorial')
    and not exists(select 1 from private.vtv_entries e join private.vtv_imports i on i.id=e.import_id and i.status='finalized' where e.source_id=v_source_id)
    then raise exception 'NOT_FOUND'; end if;
  select id into previous_id from private.vtv_rights_reviews r where r.source_id=v_source_id order by r.draft_revision desc limit 1;
  update private.vtv_draft set revision=revision+1, updated_at=pg_catalog.now() where id=1 returning * into draft;
  insert into private.vtv_rights_reviews(id,source_id,previous_review_id,decision,evidence,obligations,draft_revision,actor_role) values(new_id,v_source_id,previous_id,p_input->>'decision',p_input->>'evidence',p_input->>'obligations',draft.revision,'admin');
  result := pg_catalog.jsonb_build_object('rightsReviewId',new_id,'draftRevision',draft.revision::text);
  insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration) values('rights-review',p_request_id,'admin',expected,draft.revision,p_input,result,pg_catalog.jsonb_build_object('configurationId',draft.configuration_id,'attemptLimit',draft.attempt_limit,'normalizerVersion',draft.normalizer_version,'previousReviewId',previous_id)) returning id into event_id;
  insert into private.vtv_requests(operation,idempotency_key,request_hash,result,event_id) values('rights-review',p_idempotency_key,p_request_hash,result,event_id);
  return result;
end; $$;
