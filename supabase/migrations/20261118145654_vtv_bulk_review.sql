create table private.vtv_bulk_selections (
  id uuid primary key default gen_random_uuid(),
  filters jsonb not null,
  selection_hash text not null check (selection_hash ~ '^[0-9a-f]{64}$'),
  original_draft_revision bigint not null,
  draft_revision bigint not null,
  item_count integer not null check (item_count between 1 and 20000),
  checkpoint integer not null default 0,
  distribution jsonb not null,
  decision jsonb,
  applied integer not null default 0,
  unchanged integer not null default 0,
  invalid integer not null default 0,
  conflicts integer not null default 0,
  created_at timestamptz not null default now(),
  check (checkpoint between 0 and item_count)
);

create table private.vtv_bulk_targets (
  selection_id uuid not null references private.vtv_bulk_selections(id),
  position integer not null,
  entry_id uuid not null references private.vtv_entries(id),
  entry_revision_id uuid not null references private.vtv_entry_revisions(id),
  entry_revision integer not null,
  rights_review_id uuid references private.vtv_rights_reviews(id),
  blocker text,
  answer_blocker text,
  meaning_warning boolean not null,
  primary key (selection_id,position),
  unique (selection_id,entry_id)
);

create table private.vtv_bulk_batches (
  id uuid primary key,
  selection_id uuid not null references private.vtv_bulk_selections(id),
  position integer not null,
  idempotency_key uuid not null unique,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  unique (selection_id, position)
);

alter table private.vtv_bulk_selections enable row level security;
alter table private.vtv_bulk_targets enable row level security;
alter table private.vtv_bulk_batches enable row level security;
revoke all on private.vtv_bulk_selections, private.vtv_bulk_targets, private.vtv_bulk_batches from public, anon, authenticated;

alter table private.vtv_entry_revisions add column bulk_batch_id uuid
  references private.vtv_bulk_batches(id) deferrable initially deferred;

create function public.vtv_bulk_page(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  selection private.vtv_bulk_selections%rowtype;
  start_at integer := (p_input->>'offset')::integer;
  rows jsonb;
begin
  select * into selection from private.vtv_bulk_selections where id=(p_input->>'selectionId')::uuid;
  if not found then raise exception 'NOT_FOUND'; end if;
  if start_at is null or start_at not between 0 and selection.item_count then raise exception 'INVALID_INPUT'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'entryId',t.entry_id,'expectedEntryRevision',t.entry_revision,'original',r.original,'level',r.level,
    'definitionVi',r.definition_vi,'blocker',t.blocker,'answerBlocker',t.answer_blocker,'meaningWarning',t.meaning_warning,
    'result',(b.receipt->'items')->(t.position-b.position)
  ) order by t.position),'[]'::jsonb)
    into rows
    from private.vtv_bulk_targets t join private.vtv_entry_revisions r on r.id=t.entry_revision_id
    left join private.vtv_bulk_batches b on b.selection_id=t.selection_id and b.position=(t.position/100)*100
    where t.selection_id=selection.id and t.position>=start_at and t.position<start_at+100;
  return jsonb_build_object(
    'selectionId',selection.id,'selectionHash',selection.selection_hash,'offset',start_at,'count',selection.item_count,
    'checkpoint',selection.checkpoint,'draftRevision',selection.draft_revision::text,'distribution',selection.distribution,'items',rows,'decision',selection.decision,
    'totals',jsonb_build_object('applied',selection.applied,'unchanged',selection.unchanged,'conflict',selection.conflicts,'invalid',selection.invalid));
end; $$;

create function public.vtv_bulk_create(p_input jsonb)
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
      c.review='rejected' or c.category='excluded' as excluded,
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
        (filters->>'sourceId' is null or c.source_id=(filters->>'sourceId')::uuid)
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

create function public.vtv_bulk_apply(p_input jsonb,p_request_id uuid,p_idempotency_key uuid,p_request_hash text)
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
     or answer is null or coalesce(p_input->>'category','') not in ('common','regional','technical','less-common')
     or (answer and p_input->>'category'<>'common') or char_length(btrim(coalesce(p_input->>'rationale',''))) not between 1 and 2000
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

revoke all on function public.vtv_bulk_page(jsonb), public.vtv_bulk_create(jsonb), public.vtv_bulk_apply(jsonb,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.vtv_bulk_page(jsonb), public.vtv_bulk_create(jsonb), public.vtv_bulk_apply(jsonb,uuid,uuid,text) to service_role;


create or replace function public.vtv_candidate_history(p_entry_id uuid, p_after_time timestamptz, p_after_id uuid, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_entry_id is null or p_limit not between 1 and 50 or ((p_after_time is null) <> (p_after_id is null)) then raise exception 'INVALID_INPUT'; end if;
  if not exists(select 1 from private.vtv_entries e join private.vtv_imports imp on imp.id=e.import_id and imp.status='finalized' where e.id=p_entry_id) then raise exception 'NOT_FOUND'; end if;
  with selected as (select r.* from private.vtv_entry_revisions r where r.entry_id=p_entry_id and (p_after_time is null or (r.created_at,r.id)>(p_after_time,p_after_id)) order by r.created_at,r.id limit p_limit+1), numbered as (select *, row_number() over(order by created_at,id) rn from selected)
  select pg_catalog.jsonb_build_object(
    'items',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'revisionNumber',revision_number,'createdAt',created_at,'original',original,'normalized',normalized,'level',level,'definitionVi',definition_vi,'review',review,'answerEligible',answer_eligible,'category',category,'rationale',rationale,'exclusionChecks',exclusion_checks,'actorRole',actor_role,'bulkBatchId',bulk_batch_id) order by created_at,id) filter(where rn<=p_limit),'[]'::jsonb),
    'nextPosition',case when count(*)>p_limit then (pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('createdAt',created_at,'id',id) order by created_at,id) filter(where rn=p_limit))->0 else null end
  ) into result from numbered;
  return result;
end; $$;
