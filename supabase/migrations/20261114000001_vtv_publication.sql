create table private.vtv_release_builds (
  id uuid primary key default gen_random_uuid(), release_id uuid not null unique,
  expected_draft_revision bigint not null, payload jsonb not null,
  payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
  validation_report jsonb not null, input_references jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.vtv_release_builds enable row level security;
revoke all on private.vtv_release_builds from public,anon,authenticated;

create table public.vtv_releases (
  id uuid primary key, schema_version integer not null check(schema_version=1),
  normalizer_version text not null check(normalizer_version='vi-nfc-v2'),
  configuration_id uuid not null, attempt_limit integer not null check(attempt_limit between 1 and 12),
  published_at timestamptz not null default now(), public_payload jsonb not null,
  payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$')
);
create table public.vtv_current_release (
  id integer primary key check(id=1), release_id uuid not null references public.vtv_releases(id),
  pointer_revision bigint not null check(pointer_revision>0), updated_at timestamptz not null default now()
);
alter table public.vtv_releases enable row level security;
alter table public.vtv_current_release enable row level security;
revoke all on public.vtv_releases,public.vtv_current_release from public,anon,authenticated;
grant select on public.vtv_releases,public.vtv_current_release to anon,authenticated;
create policy vtv_published_read on public.vtv_releases for select to anon,authenticated using(true);
create policy vtv_pointer_read on public.vtv_current_release for select to anon,authenticated using(true);

create function private.vtv_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE'; end; $$;
create trigger vtv_release_immutable before update or delete on public.vtv_releases for each row execute function private.vtv_immutable();
create trigger vtv_build_immutable before update or delete on private.vtv_release_builds for each row execute function private.vtv_immutable();

-- Same canonical JSON contract as scripts/vua-tieng-viet/contract.ts. Payload
-- numbers are bounded integers; keys sort by code point, arrays retain order.
create function private.vtv_canonical(p_value jsonb) returns text language sql immutable set search_path='' as $$
  select case jsonb_typeof(p_value)
    when 'object' then '{'||coalesce((select string_agg(to_jsonb(key)::text||':'||private.vtv_canonical(value),',' order by key collate "C") from jsonb_each(p_value)),'')||'}'
    when 'array' then '['||coalesce((select string_agg(private.vtv_canonical(value),',' order by ordinality) from jsonb_array_elements(p_value) with ordinality),'')||']'
    else p_value::text end;
$$;
create function private.vtv_payload_hash(p_payload jsonb) returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(private.vtv_canonical(p_payload),'UTF8')),'hex');
$$;
create function private.vtv_spelling(p_original text) returns text language sql immutable set search_path='' as $$
  select replace(upper(normalize(p_original,NFC)),' ','');
$$;
-- Source links use DNS hosts. Reject ambiguous/encoded authorities, credentials,
-- IP literals and invalid ports rather than publishing a URL browsers reject.
create function private.vtv_https(p_url text) returns boolean language plpgsql immutable set search_path='' as $$
declare authority text; host text; port text;
begin
  if p_url is null or p_url !~ '^https://[^/@[:space:]?#]+([/?#][^[:space:]]*)?$' or p_url ~ '[\\[:cntrl:]]' then return false; end if;
  authority:=substring(p_url from '^https://([^/?#]+)');
  host:=split_part(authority,':',1);
  if char_length(host)>253 or host ~* '(^|\.)xn--' or host !~ '^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.?$' then return false; end if;
  if position(':' in authority)>0 then
    port:=split_part(authority,':',2);
    if authority<>host||':'||port or port !~ '^[0-9]{1,5}$' or port::integer>65535 then return false; end if;
  end if;
  return true;
exception when others then return false;
end;
$$;
create function private.vtv_valid_attribution(p_value jsonb) returns boolean language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(p_value)='object'
    and (select count(*)=15 from jsonb_object_keys(p_value))
    and p_value ?& array['id','sourceName','sourceEntryId','sourceSenseId','entryUrl','artifactUrl','artifactSha256','resourceRevision','artifactRevision','licenseName','licenseVersion','licenseUrl','attributionText','historyUrl','modificationsNotice']
    and not exists(select 1 from unnest(array['id','sourceName','sourceEntryId','resourceRevision','artifactRevision','licenseName','attributionText','modificationsNotice']) k where jsonb_typeof(p_value->k) is distinct from 'string' or btrim(p_value->>k)='')
    and p_value->>'artifactSha256' ~ '^[0-9a-f]{64}$'
    and private.vtv_https(p_value->>'entryUrl') and private.vtv_https(p_value->>'artifactUrl') and private.vtv_https(p_value->>'licenseUrl')
    and (p_value->'historyUrl'='null'::jsonb or private.vtv_https(p_value->>'historyUrl'))
    and jsonb_typeof(p_value->'licenseVersion') in ('string','null')
    and jsonb_typeof(p_value->'sourceSenseId') in ('string','null'),false);
$$;

-- Defense in depth at both preview and commit. This validates the constructed
-- public contract, independently of private eligibility and rights checks.
create function private.vtv_release_errors(p_payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare errors jsonb := '[]'; n integer; data jsonb; item jsonb; attr jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_payload))<>7
    or not(p_payload ?& array['schemaVersion','normalizerVersion','releaseId','configurationId','attemptLimit','levels','attributions'])
    or p_payload->>'schemaVersion'<>'1' or p_payload->>'normalizerVersion'<>'vi-nfc-v2'
    or (p_payload->>'attemptLimit')::integer not between 1 and 12
    or jsonb_typeof(p_payload->'levels') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_payload->'levels'))<>4
    or not(p_payload->'levels' ?& array['3','5','7','9'])
    or jsonb_typeof(p_payload->'attributions') is distinct from 'array' then return '[{"code":"INVALID_PAYLOAD"}]'; end if;
  if octet_length(private.vtv_canonical(p_payload))>2097152 then errors:=errors||'[{"code":"PAYLOAD_TOO_LARGE"}]'; end if;
  for attr in select value from jsonb_array_elements(p_payload->'attributions') loop
    if not private.vtv_valid_attribution(attr) then errors:=errors||jsonb_build_array(jsonb_build_object('code','INVALID_ATTRIBUTION','id',attr->>'id')); end if;
  end loop;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_payload->'attributions')) then errors:=errors||'[{"code":"INVALID_ATTRIBUTION"}]'; end if;
  foreach n in array array[3,5,7,9] loop
    data:=p_payload->'levels'->n::text;
    if jsonb_typeof(data->'guesses') is distinct from 'array' or jsonb_typeof(data->'answers') is distinct from 'array' or (select count(*) from jsonb_object_keys(data))<>2 then return '[{"code":"INVALID_PAYLOAD"}]'; end if;
    if jsonb_array_length(data->'guesses')=0 or jsonb_array_length(data->'answers')=0 then errors:=errors||jsonb_build_array(jsonb_build_object('code','MISSING_LEVEL','level',n)); end if;
    if jsonb_array_length(data->'guesses')>20000 or jsonb_array_length(data->'answers')>2000 then errors:=errors||jsonb_build_array(jsonb_build_object('code','LEVEL_LIMIT','level',n)); end if;
    if (select count(*)<>count(distinct value) from jsonb_array_elements(data->'guesses')) or (select count(*)<>count(distinct value->>'normalized') from jsonb_array_elements(data->'answers')) then errors:=errors||jsonb_build_array(jsonb_build_object('code','DUPLICATE_MEMBERSHIP','level',n)); end if;
    if exists(select 1 from jsonb_array_elements_text(data->'guesses') g where char_length(g)<>n or g<>private.vtv_spelling(g) or g !~ '^[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]+$') then errors:=errors||jsonb_build_array(jsonb_build_object('code','INVALID_SPELLING','level',n)); end if;
    for item in select value from jsonb_array_elements(data->'answers') loop
      if (select count(*) from jsonb_object_keys(item))<>6 or not(item ?& array['id','original','normalized','level','definitionVi','attributionIds']) or item->>'normalized' is distinct from private.vtv_spelling(item->>'original') or (item->>'level')::integer<>n or btrim(coalesce(item->>'definitionVi',''))='' or char_length(item->>'definitionVi')>2000
        or not(data->'guesses' @> jsonb_build_array(item->>'normalized'))
        or jsonb_typeof(item->'attributionIds') is distinct from 'array' or jsonb_array_length(item->'attributionIds')=0
        or exists(select 1 from jsonb_array_elements_text(item->'attributionIds') a where not exists(select 1 from jsonb_array_elements(p_payload->'attributions') x where x->>'id'=a))
        then errors:=errors||jsonb_build_array(jsonb_build_object('code','INVALID_ANSWER','id',item->>'id')); end if;
    end loop;
  end loop;
  return errors;
exception when others then return '[{"code":"INVALID_PAYLOAD"}]';
end; $$;

create function private.vtv_build_document(p_release_id uuid) returns jsonb language plpgsql set search_path='' as $$
declare payload jsonb; errors jsonb := '[]'; refs jsonb; levels jsonb := '{}'; n integer; item record; attrs jsonb; guesses jsonb; answers jsonb; coverage jsonb := '{}';
begin
  for item in select c.*, rr.decision from private.vtv_current_candidates c
    left join lateral (select decision from private.vtv_rights_reviews where source_id=c.source_id order by draft_revision desc limit 1) rr on true
    where c.review='approved' loop
    if item.accepted_guess is distinct from true or (item.answer_eligible and item.eligible is distinct from true) then errors:=errors||jsonb_build_array(jsonb_build_object('code','INVALID_ELIGIBILITY','id',item.entry_id)); end if;
    if item.decision is distinct from 'cleared' then errors:=errors||jsonb_build_array(jsonb_build_object('code','RIGHTS_UNRESOLVED','id',item.source_id)); end if;
    if item.normalized<>private.vtv_spelling(item.original) or char_length(item.normalized)<>item.level then errors:=errors||jsonb_build_array(jsonb_build_object('code','INVALID_SPELLING','id',item.entry_id)); end if;
  end loop;
  for item in select * from private.vtv_answer_projection where unresolved loop errors:=errors||jsonb_build_array(jsonb_build_object('code','UNRESOLVED_COLLISION','normalized',item.normalized)); end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'sourceName',s.metadata->>'name','sourceEntryId',e.source_entry_id,'sourceSenseId',e.source_sense_id,'entryUrl',e.entry_url,'artifactUrl',s.metadata->>'artifactUrl','artifactSha256',s.artifact_sha256,'resourceRevision',s.resource_revision,'artifactRevision',i.artifact_revision,'licenseName',s.metadata->'rights'->>'licenseName','licenseVersion',s.metadata->'rights'->>'licenseVersion','licenseUrl',s.metadata->'rights'->>'licenseUrl','attributionText',s.metadata->'rights'->>'attributionText','historyUrl',s.metadata->'rights'->>'historyUrl','modificationsNotice',s.metadata->'rights'->>'modificationsNotice') order by e.id),'[]'::jsonb)
    into attrs from private.vtv_current_candidates c join private.vtv_entries e on e.id=c.entry_id join private.vtv_sources s on s.id=e.source_id join private.vtv_imports i on i.id=e.import_id where c.accepted_guess;
  foreach n in array array[3,5,7,9] loop
    select coalesce(jsonb_agg(normalized order by normalized collate "C"),'[]'::jsonb) into guesses from (select distinct normalized from private.vtv_current_candidates where level=n and accepted_guess) g;
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'original',c.original,'normalized',c.normalized,'level',c.level,'definitionVi',c.definition_vi,'attributionIds',jsonb_build_array(c.entry_id)) order by c.normalized collate "C"),'[]'::jsonb) into answers
      from private.vtv_answer_projection p join private.vtv_current_candidates c on c.id=p.answer_revision_id where p.level=n and not p.unresolved;
    levels:=levels||jsonb_build_object(n::text,jsonb_build_object('guesses',guesses,'answers',answers));
    coverage:=coverage||jsonb_build_object(n::text,jsonb_build_object('guesses',jsonb_array_length(guesses),'answers',jsonb_array_length(answers)));
  end loop;
  select jsonb_build_object('schemaVersion',1,'normalizerVersion',normalizer_version,'releaseId',p_release_id,'configurationId',configuration_id,'attemptLimit',attempt_limit,'levels',levels,'attributions',attrs) into payload from private.vtv_draft where id=1;
  errors:=errors||private.vtv_release_errors(payload);
  select coalesce(jsonb_agg(jsonb_build_object('entryId',e.id,'revisionId',c.id,'sourceId',e.source_id,'importId',e.import_id,'rightsReviewId',rr.id) order by e.id),'[]'::jsonb) into refs
    from private.vtv_current_candidates c join private.vtv_entries e on e.id=c.entry_id
    left join lateral (select id from private.vtv_rights_reviews where source_id=e.source_id order by draft_revision desc limit 1) rr on true where c.review='approved';
  return jsonb_build_object('payload',payload,'errors',errors,'coverage',coverage,'inputReferences',refs);
end; $$;

create function public.vtv_publication_preview(p_request_id uuid,p_idempotency_key uuid,p_request_hash text,p_expected_draft_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare draft private.vtv_draft%rowtype; existing private.vtv_requests%rowtype; document jsonb; report jsonb; build_id uuid:=gen_random_uuid(); release_id uuid:=gen_random_uuid(); samples jsonb; event_id uuid; hash text;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' or p_expected_draft_revision is null or p_expected_draft_revision<0 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vtv-publication-preview:'||p_idempotency_key::text,0));
  select * into existing from private.vtv_requests where operation='publication-preview' and idempotency_key=p_idempotency_key;
  if found then if existing.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return existing.result; end if;
  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision<>p_expected_draft_revision then raise exception 'REVISION_CONFLICT'; end if;
  document:=private.vtv_build_document(release_id); hash:=private.vtv_payload_hash(document->'payload');
  select jsonb_object_agg(key,(select coalesce(jsonb_agg(value),'[]'::jsonb) from (select value from jsonb_array_elements(value->'answers') limit 3) sample)) into samples from jsonb_each(document->'payload'->'levels');
  report:=jsonb_build_object('buildId',build_id,'contentHash',hash,'valid',jsonb_array_length(document->'errors')=0,'errors',(select coalesce(jsonb_agg(value),'[]'::jsonb) from (select value from jsonb_array_elements(document->'errors') limit 100) e),'errorCount',jsonb_array_length(document->'errors'),'coverage',document->'coverage','draftRevision',draft.revision::text,'expectedCurrentReleaseId',(select c.release_id from public.vtv_current_release c where c.id=1),'configuration',jsonb_build_object('configurationId',draft.configuration_id,'attemptLimit',draft.attempt_limit,'normalizerVersion',draft.normalizer_version),'attributionCount',jsonb_array_length(document->'payload'->'attributions'),'sourceCount',(select count(distinct value->>'sourceId') from jsonb_array_elements(document->'inputReferences')),'playerSamples',samples,'sampleAttributions',(select coalesce(jsonb_agg(a),'[]'::jsonb) from jsonb_array_elements(document->'payload'->'attributions') a where exists(select 1 from jsonb_each(samples) s cross join lateral jsonb_array_elements(s.value) x where x->'attributionIds' @> jsonb_build_array(a->>'id'))));
  insert into private.vtv_release_builds(id,release_id,expected_draft_revision,payload,payload_sha256,validation_report,input_references) values(build_id,release_id,draft.revision,document->'payload',hash,report,jsonb_build_object('entries',document->'inputReferences','configuration',report->'configuration'));
  insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration) values('publication-preview',p_request_id,'admin',draft.revision,draft.revision,jsonb_build_object('expectedDraftRevision',draft.revision::text),report,report->'configuration') returning id into event_id;
  insert into private.vtv_requests(operation,idempotency_key,request_hash,result,event_id) values('publication-preview',p_idempotency_key,p_request_hash,report,event_id);
  return report;
end; $$;

create function public.vtv_publish(p_request_id uuid,p_idempotency_key uuid,p_request_hash text,p_build_id uuid,p_expected_draft_revision bigint,p_expected_current_release_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing private.vtv_requests%rowtype; draft private.vtv_draft%rowtype; build private.vtv_release_builds%rowtype; pointer public.vtv_current_release%rowtype; result jsonb; event_id uuid; published timestamptz:=now(); document jsonb;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' or p_build_id is null or p_expected_draft_revision is null or p_expected_draft_revision<0 then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vtv-publish:'||p_idempotency_key::text,0));
  select * into existing from private.vtv_requests where operation='publish' and idempotency_key=p_idempotency_key;
  if found then if existing.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return existing.result; end if;
  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision<>p_expected_draft_revision then raise exception 'REVISION_CONFLICT'; end if;
  select * into pointer from public.vtv_current_release where id=1 for update;
  if pointer.release_id is distinct from p_expected_current_release_id then raise exception 'REVISION_CONFLICT'; end if;
  select * into build from private.vtv_release_builds where id=p_build_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if build.expected_draft_revision<>draft.revision then raise exception 'REVISION_CONFLICT'; end if;
  if build.validation_report->>'valid' is distinct from 'true' or private.vtv_release_errors(build.payload)<>'[]'::jsonb then raise exception 'RELEASE_INCOMPLETE'; end if;
  if private.vtv_payload_hash(build.payload)<>build.payload_sha256 then raise exception 'RELEASE_INCOMPLETE'; end if;
  -- Rebuild at the locked current draft; compare the complete immutable inputs
  -- and payload, so no stale rights/eligibility/provenance can slip through.
  document:=private.vtv_build_document(build.release_id);
  if document->'errors'<>'[]'::jsonb or document->'payload'<>build.payload or document->'inputReferences'<>build.input_references->'entries' then raise exception 'REVISION_CONFLICT'; end if;
  insert into public.vtv_releases(id,schema_version,normalizer_version,configuration_id,attempt_limit,published_at,public_payload,payload_sha256) values(build.release_id,1,draft.normalizer_version,draft.configuration_id,draft.attempt_limit,published,build.payload,build.payload_sha256);
  insert into public.vtv_current_release(id,release_id,pointer_revision,updated_at) values(1,build.release_id,1,published)
    on conflict(id) do update set release_id=excluded.release_id,pointer_revision=public.vtv_current_release.pointer_revision+1,updated_at=excluded.updated_at returning * into pointer;
  update private.vtv_draft set revision=revision+1,updated_at=published where id=1;
  result:=jsonb_build_object('releaseId',build.release_id,'configurationId',draft.configuration_id,'payloadHash',build.payload_sha256,'publishedAt',published,'pointerRevision',pointer.pointer_revision::text);
  insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration) values('publish',p_request_id,'admin',draft.revision,draft.revision+1,jsonb_build_object('buildId',p_build_id,'expectedDraftRevision',draft.revision::text,'expectedCurrentReleaseId',p_expected_current_release_id),result,build.input_references->'configuration') returning id into event_id;
  insert into private.vtv_requests(operation,idempotency_key,request_hash,result,event_id) values('publish',p_idempotency_key,p_request_hash,result,event_id);
  return result;
end; $$;

create table private.vtv_publication_rate_limit(role_key text primary key,window_start timestamptz not null,request_count integer not null);
alter table private.vtv_publication_rate_limit enable row level security;
revoke all on private.vtv_publication_rate_limit from public,anon,authenticated;
create function public.vtv_consume_publication_limit() returns integer language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); current_row private.vtv_publication_rate_limit%rowtype;
begin
  insert into private.vtv_publication_rate_limit values('admin',v_now,1) on conflict(role_key) do update set
    window_start=case when private.vtv_publication_rate_limit.window_start<=v_now-interval '1 minute' then v_now else private.vtv_publication_rate_limit.window_start end,
    request_count=case when private.vtv_publication_rate_limit.window_start<=v_now-interval '1 minute' then 1 else private.vtv_publication_rate_limit.request_count+1 end returning * into current_row;
  if current_row.request_count<=5 then return 0; end if;
  return greatest(1,ceil(extract(epoch from current_row.window_start+interval '1 minute'-v_now))::integer);
end; $$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.vtv_publication_preview(uuid,uuid,text,bigint),public.vtv_publish(uuid,uuid,text,uuid,bigint,uuid),public.vtv_consume_publication_limit() from public,anon,authenticated;
grant execute on function public.vtv_publication_preview(uuid,uuid,text,bigint),public.vtv_publish(uuid,uuid,text,uuid,bigint,uuid),public.vtv_consume_publication_limit() to service_role;
