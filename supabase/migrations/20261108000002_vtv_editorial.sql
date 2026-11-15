-- Editorial state remains private and accessible only through trusted functions.
alter table private.vtv_entry_revisions add column exclusion_checks jsonb;
alter table private.vtv_entry_revisions add constraint vtv_revision_category_check check (category is null or category in ('common', 'regional', 'technical', 'less-common', 'excluded'));
alter table private.vtv_entry_revisions add constraint vtv_revision_rationale_check check (rationale is null or char_length(rationale) <= 2000);
alter table private.vtv_entry_revisions add constraint vtv_revision_checks_object check (exclusion_checks is null or jsonb_typeof(exclusion_checks) = 'object');
create index vtv_entries_created_id_idx on private.vtv_entries(created_at, id);
create index vtv_revisions_entry_created_idx on private.vtv_entry_revisions(entry_id, created_at, id);

create function public.vtv_review_candidate(
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
  if next_review not in ('pending','approved','rejected') or (p_input->>'category') not in ('common','regional','technical','less-common','excluded') or pg_catalog.jsonb_typeof(checks) <> 'object' then raise exception 'INVALID_INPUT'; end if;
  if current_revision.original is distinct from p_input->>'original' or current_revision.definition_vi is distinct from p_input->>'definitionVi' then next_review := 'pending'; next_answer := false; end if;
  if next_review = 'approved' and (checks->>'names' is distinct from 'true' or checks->>'abbreviations' is distinct from 'true' or checks->>'offensive' is distinct from 'true' or checks->>'malformed' is distinct from 'true' or checks->>'unverified' is distinct from 'true' or p_input->>'category' = 'excluded' or pg_catalog.btrim(p_input->>'rationale') = '') then raise exception 'INVALID_INPUT'; end if;
  if next_answer and (next_review <> 'approved' or p_input->>'category' <> 'common' or pg_catalog.btrim(coalesce(p_input->>'definitionVi','')) = '' or pg_catalog.btrim(p_input->>'rationale') = '') then raise exception 'INVALID_INPUT'; end if;
  insert into private.vtv_entry_revisions(id, entry_id, revision_number, previous_revision_id, original, normalized, level, definition_vi, review, answer_eligible, category, rationale, exclusion_checks, actor_role)
  values (new_id, entry.id, current_revision.revision_number + 1, current_revision.id, p_input->>'original', p_normalized, p_level, p_input->>'definitionVi', next_review, next_answer, p_input->>'category', p_input->>'rationale', checks, 'admin');
  update private.vtv_entries set current_revision_id = new_id where id = entry.id;
  update private.vtv_draft set revision = revision + 1, updated_at = pg_catalog.now() where id = 1 returning * into draft;
  result := pg_catalog.jsonb_build_object('entryId', entry.id, 'revisionId', new_id, 'revisionNumber', current_revision.revision_number + 1, 'review', next_review, 'answerEligible', next_answer, 'draftRevision', draft.revision::text);
  insert into private.vtv_editorial_events(operation, request_id, actor_role, previous_draft_revision, next_draft_revision, input, output, configuration)
  values ('review', p_request_id, 'admin', expected_draft, draft.revision, p_input, result, pg_catalog.jsonb_build_object('configurationId', draft.configuration_id, 'attemptLimit', draft.attempt_limit, 'normalizerVersion', draft.normalizer_version, 'previousRevisionId', current_revision.id, 'nextRevisionId', new_id)) returning id into event_id;
  insert into private.vtv_requests(operation, idempotency_key, request_hash, result, event_id) values ('review', p_idempotency_key, p_request_hash, result, event_id);
  return result;
end; $$;
revoke all on function public.vtv_review_candidate(uuid,uuid,text,jsonb,text,integer) from public, anon, authenticated;
grant execute on function public.vtv_review_candidate(uuid,uuid,text,jsonb,text,integer) to service_role;

create function public.vtv_list_candidates(p_filters jsonb, p_after_time timestamptz, p_after_id uuid, p_limit integer)
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
revoke all on function public.vtv_list_candidates(jsonb,timestamptz,uuid,integer) from public, anon, authenticated;
grant execute on function public.vtv_list_candidates(jsonb,timestamptz,uuid,integer) to service_role;

create function public.vtv_candidate_history(p_entry_id uuid, p_after_time timestamptz, p_after_id uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_entry_id is null or p_limit not between 1 and 50 or ((p_after_time is null) <> (p_after_id is null)) then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from private.vtv_entries e join private.vtv_imports imp on imp.id=e.import_id and imp.status='finalized' where e.id=p_entry_id) then raise exception 'NOT_FOUND'; end if;
  with selected as (select r.* from private.vtv_entry_revisions r where r.entry_id=p_entry_id and (p_after_time is null or (r.created_at,r.id)>(p_after_time,p_after_id)) order by r.created_at,r.id limit p_limit+1), numbered as (select *, row_number() over(order by created_at,id) rn from selected)
  select pg_catalog.jsonb_build_object(
    'items',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'revisionNumber',revision_number,'createdAt',created_at,'original',original,'normalized',normalized,'level',level,'definitionVi',definition_vi,'review',review,'answerEligible',answer_eligible,'category',category,'rationale',rationale,'exclusionChecks',exclusion_checks,'actorRole',actor_role) order by created_at,id) filter(where rn<=p_limit),'[]'::jsonb),
    'nextPosition',case when count(*)>p_limit then (pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('createdAt',created_at,'id',id) order by created_at,id) filter(where rn=p_limit))->0 else null end
  ) into result from numbered;
  return result;
end; $$;
revoke all on function public.vtv_candidate_history(uuid,timestamptz,uuid,integer) from public, anon, authenticated;
grant execute on function public.vtv_candidate_history(uuid,timestamptz,uuid,integer) to service_role;

create function public.vtv_candidate_detail(p_entry_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  select pg_catalog.jsonb_build_object('id',e.id,'sourceEntryId',e.source_entry_id,'sourceSenseId',e.source_sense_id,'sourceNotes',e.source_payload->>'sourceNotes','entryUrl',e.entry_url,'externalId',e.external_id,'source',s.metadata,'importId',e.import_id,'supersedesEntryId',e.supersedes_entry_id,'current',pg_catalog.jsonb_build_object('id',r.id,'revisionNumber',r.revision_number,'original',r.original,'normalized',r.normalized,'level',r.level,'definitionVi',r.definition_vi,'review',r.review,'answerEligible',r.answer_eligible,'category',r.category,'rationale',r.rationale,'exclusionChecks',r.exclusion_checks),'draftRevision',d.revision::text)
  into result from private.vtv_entries e join private.vtv_imports imp on imp.id=e.import_id and imp.status='finalized' join private.vtv_sources s on s.id=e.source_id join private.vtv_entry_revisions r on r.id=e.current_revision_id and r.entry_id=e.id cross join private.vtv_draft d where e.id=p_entry_id and d.id=1;
  if not found then raise exception 'NOT_FOUND'; end if;
  return result;
end; $$;
revoke all on function public.vtv_candidate_detail(uuid) from public, anon, authenticated;
grant execute on function public.vtv_candidate_detail(uuid) to service_role;

create table private.vtv_read_rate_limit (role_key text primary key, window_start timestamptz not null, request_count integer not null check(request_count>0));
alter table private.vtv_read_rate_limit enable row level security;
revoke all on private.vtv_read_rate_limit from public, anon, authenticated;
create function public.vtv_consume_read_limit() returns integer language plpgsql security definer set search_path='' as $$
declare v_now timestamptz := pg_catalog.clock_timestamp(); current_row private.vtv_read_rate_limit%rowtype;
begin
  insert into private.vtv_read_rate_limit(role_key,window_start,request_count) values('admin',v_now,1)
  on conflict(role_key) do update set window_start=case when private.vtv_read_rate_limit.window_start<=v_now-interval '1 minute' then v_now else private.vtv_read_rate_limit.window_start end,
  request_count=case when private.vtv_read_rate_limit.window_start<=v_now-interval '1 minute' then 1 else private.vtv_read_rate_limit.request_count+1 end returning * into current_row;
  if current_row.request_count<=120 then return 0; end if;
  return greatest(1,ceil(extract(epoch from current_row.window_start+interval '1 minute'-v_now))::integer);
end; $$;
revoke all on function public.vtv_consume_read_limit() from public, anon, authenticated;
grant execute on function public.vtv_consume_read_limit() to service_role;
