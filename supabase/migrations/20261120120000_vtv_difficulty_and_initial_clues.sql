-- Preserve existing releases and allow explicitly reviewed answers in each category.
alter table private.vtv_draft
  add column initial_absent_count integer not null default 0 check (initial_absent_count between 0 and 17);

alter table private.vtv_entry_revisions drop constraint vtv_revision_category_check;
alter table private.vtv_entry_revisions add constraint vtv_revision_category_check
  check (category is null or category in ('common','regional','technical','less-common','rare','excluded'));

create or replace view private.vtv_current_candidates as
select e.id as entry_id, e.created_at, e.source_id, e.source_entry_id, e.source_sense_id, e.entry_url,
  r.id, r.revision_number, r.original, r.normalized, r.level, r.definition_vi,
  r.review, r.answer_eligible, r.category, r.rationale, r.exclusion_checks, s.metadata as source,
  (r.review='approved' and r.category <> 'excluded'
    and r.exclusion_checks @> '{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}'::jsonb) as accepted_guess,
  (r.review='approved' and r.answer_eligible and r.category <> 'excluded'
    and btrim(coalesce(r.definition_vi,'')) <> '' and btrim(coalesce(r.rationale,'')) <> ''
    and r.exclusion_checks @> '{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}'::jsonb) as eligible
from private.vtv_entries e
join private.vtv_imports i on i.id=e.import_id and i.status='finalized'
join private.vtv_entry_revisions r on r.id=e.current_revision_id and r.entry_id=e.id
join private.vtv_sources s on s.id=e.source_id;

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
  if next_review not in ('pending','approved','rejected','withdrawn') or (p_input->>'category') not in ('common','regional','technical','less-common','rare','excluded') or pg_catalog.jsonb_typeof(checks) <> 'object' then raise exception 'INVALID_INPUT'; end if;
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
  if next_answer and (next_review <> 'approved' or p_input->>'category' = 'excluded' or pg_catalog.btrim(coalesce(p_input->>'definitionVi','')) = '' or pg_catalog.btrim(p_input->>'rationale') = '') then raise exception 'INVALID_INPUT'; end if;
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

create or replace function public.vtv_bulk_apply(p_input jsonb,p_request_id uuid,p_idempotency_key uuid,p_request_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  selection private.vtv_bulk_selections%rowtype;
  existing private.vtv_bulk_batches%rowtype;
  draft private.vtv_draft%rowtype;
  item record;
  batch_id uuid := (p_input->>'batchId')::uuid;
  start_at integer := (p_input->>'offset')::integer;
  end_at integer;
  expected_targets jsonb;
  current_rights uuid;
  status text;
  reason text;
  new_revision uuid;
  new_number integer;
  item_result jsonb;
  results jsonb := '[]'::jsonb;
  receipt jsonb;
  answer boolean := (p_input->>'answerEligible')::boolean;
  batch_decision jsonb := jsonb_build_object('category',p_input->>'category','answerEligible',answer,'rationale',p_input->>'rationale','exclusionChecks',p_input->'exclusionChecks');
  checks jsonb := p_input->'exclusionChecks';
begin
  if p_request_id is null or p_idempotency_key is null or batch_id is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or answer is null or coalesce(p_input->>'category','') not in ('common','regional','technical','less-common','rare')
     or char_length(btrim(coalesce(p_input->>'rationale',''))) not between 1 and 2000
     or jsonb_typeof(checks) is distinct from 'object' or checks is distinct from '{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}'::jsonb
  then raise exception 'INVALID_INPUT'; end if;

  perform pg_advisory_xact_lock(hashtextextended('vtv-bulk:'||p_idempotency_key::text,0));
  select * into existing from private.vtv_bulk_batches where idempotency_key=p_idempotency_key;
  if found then
    if existing.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.receipt;
  end if;
  select * into selection from private.vtv_bulk_selections where id=(p_input->>'selectionId')::uuid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if selection.selection_hash is distinct from p_input->>'selectionHash' then raise exception 'INVALID_INPUT'; end if;
  if start_at is distinct from selection.checkpoint or start_at>=selection.item_count
    or (selection.decision is not null and selection.decision<>batch_decision) then raise exception 'REVISION_CONFLICT'; end if;

  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision<>selection.draft_revision or draft.revision is distinct from (p_input->>'expectedDraftRevision')::bigint then raise exception 'REVISION_CONFLICT'; end if;
  end_at := least(selection.item_count,start_at+100);

  select jsonb_agg(jsonb_build_object('entryId',t.entry_id,'expectedEntryRevision',t.entry_revision) order by t.position)
    into expected_targets from private.vtv_bulk_targets t where t.selection_id=selection.id and t.position>=start_at and t.position<end_at;
  if expected_targets is distinct from p_input->'targets' then raise exception 'INVALID_INPUT'; end if;

  for item in select t.*, e.current_revision_id,e.source_id,r.original,r.normalized,r.level,r.definition_vi,r.review,r.answer_eligible,r.category,r.rationale,r.exclusion_checks
    from private.vtv_bulk_targets t join private.vtv_entries e on e.id=t.entry_id join private.vtv_entry_revisions r on r.id=t.entry_revision_id
    where t.selection_id=selection.id and t.position>=start_at and t.position<end_at order by t.position
  loop
    status := 'applied';
    reason := null;
    new_revision := item.entry_revision_id;
    new_number := item.entry_revision;
    select rr.id into current_rights from private.vtv_rights_reviews rr where rr.source_id=item.source_id order by rr.draft_revision desc limit 1;
    if item.current_revision_id<>item.entry_revision_id or current_rights is distinct from item.rights_review_id then
      status := 'conflict'; reason := 'entry-revision';
    elsif item.blocker is not null or (answer and item.answer_blocker is not null) or (p_input->>'category'='common' and item.meaning_warning) then
      status := 'invalid';
      reason := coalesce(item.blocker,case when answer then item.answer_blocker end,'meaning-warning');
    elsif item.review='approved' and item.answer_eligible=answer and item.category=p_input->>'category' and item.rationale=p_input->>'rationale' and item.exclusion_checks=checks then
      status := 'unchanged';
    else
      new_revision := gen_random_uuid();
      new_number := item.entry_revision+1;
      insert into private.vtv_entry_revisions(id,entry_id,revision_number,previous_revision_id,original,normalized,level,definition_vi,review,answer_eligible,category,rationale,exclusion_checks,actor_role,bulk_batch_id)
        values(new_revision,item.entry_id,new_number,item.entry_revision_id,item.original,item.normalized,item.level,item.definition_vi,'approved',answer,p_input->>'category',p_input->>'rationale',checks,'admin',batch_id);
      update private.vtv_entries set current_revision_id=new_revision where id=item.entry_id;
    end if;

    item_result := jsonb_build_object('entryId',item.entry_id,'status',status,'reason',reason);
    results := results||jsonb_build_array(item_result);
    insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration)
      values('bulk-review',p_request_id,'admin',draft.revision,draft.revision+1,
        batch_decision||jsonb_build_object('selectionId',selection.id,'batchId',batch_id,'entryId',item.entry_id,'expectedEntryRevision',item.entry_revision,'selectionHash',selection.selection_hash),
        item_result||jsonb_build_object('previousRevisionId',item.entry_revision_id,'nextRevisionId',new_revision,'revisionNumber',new_number),
        jsonb_build_object('configurationId',draft.configuration_id,'attemptLimit',draft.attempt_limit,'normalizerVersion',draft.normalizer_version));
  end loop;

  update private.vtv_draft set revision=revision+1,updated_at=now() where id=1 returning * into draft;
  update private.vtv_bulk_selections set checkpoint=end_at,draft_revision=draft.revision,decision=batch_decision,
    applied=applied+(select count(*) from jsonb_array_elements(results) x where x->>'status'='applied'),
    unchanged=unchanged+(select count(*) from jsonb_array_elements(results) x where x->>'status'='unchanged'),
    invalid=invalid+(select count(*) from jsonb_array_elements(results) x where x->>'status'='invalid'),
    conflicts=conflicts+(select count(*) from jsonb_array_elements(results) x where x->>'status'='conflict')
    where id=selection.id;
  receipt := jsonb_build_object('batchId',batch_id,'draftRevision',draft.revision::text,'checkpoint',end_at,'items',results);
  insert into private.vtv_bulk_batches(id,selection_id,position,idempotency_key,request_hash,receipt)
    values(batch_id,selection.id,start_at,p_idempotency_key,p_request_hash,receipt);
  return receipt;
end; $$;

create or replace function public.vtv_configure(p_request_id uuid,p_idempotency_key uuid,p_request_hash text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  existing private.vtv_requests%rowtype;
  draft private.vtv_draft%rowtype;
  expected bigint;
  attempts numeric;
  initial_absent numeric;
  new_configuration_id uuid:=gen_random_uuid();
  configuration jsonb;
  result jsonb;
  event_id uuid;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_input is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  if (select count(*) from jsonb_object_keys(p_input))<>(case when p_input ? 'initialAbsentCount' then 3 else 2 end) or not(p_input ?& array['expectedDraftRevision','attemptLimit'])
    or jsonb_typeof(p_input->'expectedDraftRevision') is distinct from 'string'
    or (p_input->>'expectedDraftRevision') !~ '^(0|[1-9][0-9]{0,18})$'
    or jsonb_typeof(p_input->'attemptLimit') is distinct from 'number' then raise exception 'INVALID_INPUT'; end if;
  if (p_input->>'expectedDraftRevision')::numeric>9223372036854775807 then raise exception 'INVALID_INPUT'; end if;
  attempts:=(p_input->>'attemptLimit')::numeric;
  if attempts<1 or attempts>12 or trunc(attempts)<>attempts then raise exception 'INVALID_INPUT'; end if;
  if p_input ? 'initialAbsentCount' then
    if jsonb_typeof(p_input->'initialAbsentCount') is distinct from 'number' then raise exception 'INVALID_INPUT'; end if;
    initial_absent:=(p_input->>'initialAbsentCount')::numeric;
    if initial_absent not between 0 and 17 or trunc(initial_absent)<>initial_absent then raise exception 'INVALID_INPUT'; end if;
  end if;
  expected:=(p_input->>'expectedDraftRevision')::bigint;
  perform pg_advisory_xact_lock(hashtextextended('vtv-configuration:'||p_idempotency_key::text,0));
  select * into existing from private.vtv_requests where operation='configuration' and idempotency_key=p_idempotency_key;
  if found then
    if existing.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.result;
  end if;
  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision<>expected then raise exception 'REVISION_CONFLICT'; end if;
  initial_absent:=coalesce(initial_absent,draft.initial_absent_count);
  configuration:=jsonb_build_object('configurationId',new_configuration_id,'attemptLimit',attempts::integer,'initialAbsentCount',initial_absent::integer,'normalizerVersion',draft.normalizer_version,'levels',jsonb_build_array(3,5,7,9));
  update private.vtv_draft set configuration_id=new_configuration_id,attempt_limit=attempts::integer,initial_absent_count=initial_absent::integer,revision=revision+1,updated_at=now() where id=1;
  result:=jsonb_build_object('draftRevision',(draft.revision+1)::text,'configuration',configuration);
  insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration)
    values('configuration',p_request_id,'admin',draft.revision,draft.revision+1,p_input,result,configuration||jsonb_build_object('previousConfigurationId',draft.configuration_id,'previousAttemptLimit',draft.attempt_limit,'previousInitialAbsentCount',draft.initial_absent_count)) returning id into event_id;
  insert into private.vtv_requests(operation,idempotency_key,request_hash,result,event_id) values('configuration',p_idempotency_key,p_request_hash,result,event_id);
  return result;
end; $$;

create or replace function private.vtv_release_errors(p_payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare errors jsonb := '[]'; n integer; data jsonb; item jsonb; attr jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_payload))<>(case when p_payload ? 'initialAbsentCount' then 8 else 7 end)
    or not(p_payload ?& array['schemaVersion','normalizerVersion','releaseId','configurationId','attemptLimit','levels','attributions'])
    or (p_payload ? 'initialAbsentCount' and (jsonb_typeof(p_payload->'initialAbsentCount') is distinct from 'number' or p_payload->>'initialAbsentCount' !~ '^([0-9]|1[0-7])$'))
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
    if jsonb_array_length(data->'guesses')=0 or not exists(select 1 from jsonb_array_elements(data->'answers') where coalesce(value->>'category','common')='common') then errors:=errors||jsonb_build_array(jsonb_build_object('code','MISSING_LEVEL','level',n)); end if;
    if jsonb_array_length(data->'guesses')>20000 or jsonb_array_length(data->'answers')>2000 then errors:=errors||jsonb_build_array(jsonb_build_object('code','LEVEL_LIMIT','level',n)); end if;
    if (select count(*)<>count(distinct value) from jsonb_array_elements(data->'guesses')) or (select count(*)<>count(distinct value->>'normalized') from jsonb_array_elements(data->'answers')) then errors:=errors||jsonb_build_array(jsonb_build_object('code','DUPLICATE_MEMBERSHIP','level',n)); end if;
    if exists(select 1 from jsonb_array_elements_text(data->'guesses') g where char_length(g)<>n or g<>private.vtv_spelling(g) or g !~ '^[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]+$') then errors:=errors||jsonb_build_array(jsonb_build_object('code','INVALID_SPELLING','level',n)); end if;
    for item in select value from jsonb_array_elements(data->'answers') loop
      if (select count(*) from jsonb_object_keys(item))<>(case when item ? 'category' then 7 else 6 end)
        or (item ? 'category' and coalesce(item->>'category','') not in ('common','regional','technical','less-common','rare'))
        or not(item ?& array['id','original','normalized','level','definitionVi','attributionIds']) or item->>'normalized' is distinct from private.vtv_spelling(item->>'original') or (item->>'level')::integer<>n or btrim(coalesce(item->>'definitionVi',''))='' or char_length(item->>'definitionVi')>2000
        or not(data->'guesses' @> jsonb_build_array(item->>'normalized'))
        or jsonb_typeof(item->'attributionIds') is distinct from 'array' or jsonb_array_length(item->'attributionIds')=0
        or exists(select 1 from jsonb_array_elements_text(item->'attributionIds') a where not exists(select 1 from jsonb_array_elements(p_payload->'attributions') x where x->>'id'=a))
        then errors:=errors||jsonb_build_array(jsonb_build_object('code','INVALID_ANSWER','id',item->>'id')); end if;
    end loop;
  end loop;
  return errors;
exception when others then return '[{"code":"INVALID_PAYLOAD"}]';
end; $$;

create or replace function private.vtv_build_document(p_release_id uuid) returns jsonb language plpgsql set search_path='' as $$
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
  -- Keep exact entry attribution for displayed definitions. Guess-only
  -- spellings share an attribution for their immutable source and import.
  with selected_answers as materialized (
    select answer_revision_id
    from private.vtv_answer_projection
    where not unresolved and answer_revision_id is not null
  ), credits as (
    select e.id,e.source_id,e.import_id,e.source_entry_id,e.source_sense_id,e.entry_url
    from selected_answers a
    join private.vtv_current_candidates c on c.id=a.answer_revision_id
    join private.vtv_entries e on e.id=c.entry_id
    union all
    select md5(e.source_id::text||e.import_id::text)::uuid as id,
      e.source_id,e.import_id,'artifact'::text,null::text,null::text
    from private.vtv_current_candidates c
    join private.vtv_entries e on e.id=c.entry_id
    left join selected_answers a on a.answer_revision_id=c.id
    where c.accepted_guess and a.answer_revision_id is null
    group by e.source_id,e.import_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',credit.id,'sourceName',s.metadata->>'name','sourceEntryId',credit.source_entry_id,
    'sourceSenseId',credit.source_sense_id,'entryUrl',coalesce(credit.entry_url,s.metadata->>'artifactUrl'),
    'artifactUrl',s.metadata->>'artifactUrl','artifactSha256',s.artifact_sha256,
    'resourceRevision',s.resource_revision,'artifactRevision',i.artifact_revision,
    'licenseName',s.metadata->'rights'->>'licenseName','licenseVersion',s.metadata->'rights'->>'licenseVersion',
    'licenseUrl',s.metadata->'rights'->>'licenseUrl','attributionText',s.metadata->'rights'->>'attributionText',
    'historyUrl',s.metadata->'rights'->>'historyUrl','modificationsNotice',s.metadata->'rights'->>'modificationsNotice'
  ) order by credit.id),'[]'::jsonb)
  into attrs
  from credits credit
  join private.vtv_sources s on s.id=credit.source_id
  join private.vtv_imports i on i.id=credit.import_id;
  foreach n in array array[3,5,7,9] loop
    select coalesce(jsonb_agg(normalized order by normalized collate "C"),'[]'::jsonb) into guesses from (select distinct normalized from private.vtv_current_candidates where level=n and accepted_guess) g;
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'original',c.original,'normalized',c.normalized,'level',c.level,'definitionVi',c.definition_vi,'category',c.category,'attributionIds',jsonb_build_array(c.entry_id)) order by c.normalized collate "C"),'[]'::jsonb) into answers
      from private.vtv_answer_projection p join private.vtv_current_candidates c on c.id=p.answer_revision_id where p.level=n and not p.unresolved;
    levels:=levels||jsonb_build_object(n::text,jsonb_build_object('guesses',guesses,'answers',answers));
    coverage:=coverage||jsonb_build_object(n::text,jsonb_build_object('guesses',jsonb_array_length(guesses),'answers',jsonb_array_length(answers)));
  end loop;
  select jsonb_build_object('schemaVersion',1,'normalizerVersion',normalizer_version,'releaseId',p_release_id,'configurationId',configuration_id,'attemptLimit',attempt_limit,'initialAbsentCount',initial_absent_count,'levels',levels,'attributions',attrs) into payload from private.vtv_draft where id=1;
  errors:=errors||private.vtv_release_errors(payload);
  select coalesce(jsonb_agg(jsonb_build_object('entryId',e.id,'revisionId',c.id,'sourceId',e.source_id,'importId',e.import_id,'rightsReviewId',rr.id) order by e.id),'[]'::jsonb) into refs
    from private.vtv_current_candidates c join private.vtv_entries e on e.id=c.entry_id
    left join lateral (select id from private.vtv_rights_reviews where source_id=e.source_id order by draft_revision desc limit 1) rr on true where c.review='approved';
  return jsonb_build_object('payload',payload,'errors',errors,'coverage',coverage,'inputReferences',refs);
end; $$;

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
      'attemptLimit',draft.attempt_limit,'initialAbsentCount',draft.initial_absent_count,'normalizerVersion',draft.normalizer_version),
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
