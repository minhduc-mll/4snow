-- Exact revision choices are private. Stale pointers are retained for audit and
-- deliberately block resolution; never substitute an alternative after editing.
create table private.vtv_answer_selections (
  normalized text primary key,
  level integer not null check (level in (3,5,7,9) and char_length(normalized)=level),
  entry_revision_id uuid not null references private.vtv_entry_revisions(id),
  updated_at timestamptz not null default now()
);
alter table private.vtv_answer_selections enable row level security;
revoke all on private.vtv_answer_selections from public, anon, authenticated;

create view private.vtv_current_candidates as
select e.id as entry_id, e.created_at, e.source_id, e.source_entry_id, e.source_sense_id, e.entry_url,
  r.id, r.revision_number, r.original, r.normalized, r.level, r.definition_vi,
  r.review, r.answer_eligible, r.category, r.rationale, r.exclusion_checks, s.metadata as source,
  (r.review='approved' and r.category <> 'excluded'
    and r.exclusion_checks @> '{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}'::jsonb) as accepted_guess,
  (r.review='approved' and r.answer_eligible and r.category='common'
    and btrim(coalesce(r.definition_vi,'')) <> '' and btrim(coalesce(r.rationale,'')) <> ''
    and r.exclusion_checks @> '{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}'::jsonb) as eligible
from private.vtv_entries e
join private.vtv_imports i on i.id=e.import_id and i.status='finalized'
join private.vtv_entry_revisions r on r.id=e.current_revision_id and r.entry_id=e.id
join private.vtv_sources s on s.id=e.source_id;

-- Editorial projection only. Ticket 07 must additionally enforce source rights,
-- provenance, coverage and release validation in its consistent snapshot.
create view private.vtv_answer_projection as
with groups as (
  select normalized, level, bool_or(accepted_guess) as accepted_guess,
    count(*) filter(where eligible) as eligible_count,
    (array_agg(id order by id) filter(where eligible))[1] as sole_revision
  from private.vtv_current_candidates group by normalized,level
)
select g.normalized, g.level, g.accepted_guess, g.eligible_count,
  case when s.normalized is not null then valid.id
    when g.eligible_count=1 then g.sole_revision else null end as answer_revision_id,
  ((s.normalized is not null and valid.id is null) or (g.eligible_count>1 and s.normalized is null)) as unresolved
from groups g left join private.vtv_answer_selections s on s.normalized=g.normalized
left join private.vtv_current_candidates valid on valid.id=s.entry_revision_id
  and valid.normalized=g.normalized and valid.level=g.level and valid.eligible;
revoke all on private.vtv_current_candidates, private.vtv_answer_projection from public, anon, authenticated;

create function public.vtv_select_answer(p_request_id uuid, p_idempotency_key uuid, p_request_hash text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  existing private.vtv_requests%rowtype;
  draft private.vtv_draft%rowtype;
  chosen private.vtv_current_candidates%rowtype;
  expected bigint;
  result jsonb;
  event_id uuid;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_input) is distinct from 'object'
    or not (p_input ?& array['normalized','level','entryRevisionId','expectedDraftRevision'])
    or (select count(*) from jsonb_object_keys(p_input)) <> 4
    or jsonb_typeof(p_input->'normalized') is distinct from 'string'
    or jsonb_typeof(p_input->'level') is distinct from 'number'
    or p_input->>'level' not in ('3','5','7','9')
    or char_length(p_input->>'normalized') <> (p_input->>'level')::integer
    or p_input->>'normalized' <> normalize(p_input->>'normalized', NFC)
    or p_input->>'normalized' <> upper(p_input->>'normalized')
    or p_input->>'normalized' !~ '^[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]+$'
    or jsonb_typeof(p_input->'entryRevisionId') is distinct from 'string'
    or p_input->>'entryRevisionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'expectedDraftRevision') is distinct from 'string'
    or p_input->>'expectedDraftRevision' !~ '^(0|[1-9][0-9]{0,18})$'
    or (p_input->>'expectedDraftRevision')::numeric > 9223372036854775807 then raise exception 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vtv-select:' || p_idempotency_key::text,0));
  select * into existing from private.vtv_requests where operation='select-answer' and idempotency_key=p_idempotency_key;
  if found then
    if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.result;
  end if;
  expected := (p_input->>'expectedDraftRevision')::bigint;
  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision <> expected then raise exception 'REVISION_CONFLICT'; end if;
  select * into chosen from private.vtv_current_candidates where id=(p_input->>'entryRevisionId')::uuid;
  if not found then raise exception 'REVISION_CONFLICT'; end if;
  if chosen.normalized <> p_input->>'normalized' or chosen.level <> (p_input->>'level')::integer or chosen.eligible is distinct from true then raise exception 'INVALID_INPUT'; end if;
  insert into private.vtv_answer_selections(normalized,level,entry_revision_id)
  values(chosen.normalized,chosen.level,chosen.id)
  on conflict(normalized) do update set level=excluded.level,entry_revision_id=excluded.entry_revision_id,updated_at=now();
  update private.vtv_draft set revision=revision+1,updated_at=now() where id=1 returning * into draft;
  result := jsonb_build_object('selection',jsonb_build_object('normalized',chosen.normalized,'level',chosen.level,'entryRevisionId',chosen.id),'draftRevision',draft.revision::text);
  insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration)
  values('select-answer',p_request_id,'admin',expected,draft.revision,p_input,result,jsonb_build_object('configurationId',draft.configuration_id,'attemptLimit',draft.attempt_limit,'normalizerVersion',draft.normalizer_version)) returning id into event_id;
  insert into private.vtv_requests(operation,idempotency_key,request_hash,result,event_id) values('select-answer',p_idempotency_key,p_request_hash,result,event_id);
  return result;
end; $$;
revoke all on function public.vtv_select_answer(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vtv_select_answer(uuid,uuid,text,jsonb) to service_role;

create function public.vtv_collision(p_normalized text,p_level integer,p_after_time timestamptz,p_after_id uuid,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if p_normalized is null or p_level is null or p_level not in (3,5,7,9) or char_length(p_normalized)<>p_level or p_limit is null or p_limit not between 1 and 50 or ((p_after_time is null)<>(p_after_id is null)) then raise exception 'INVALID_INPUT'; end if;
  with page as (
    select *,row_number() over(order by created_at,entry_id) rn from private.vtv_current_candidates
    where normalized=p_normalized and level=p_level and (p_after_time is null or (created_at,entry_id)>(p_after_time,p_after_id))
    order by created_at,entry_id limit p_limit+1
  ) select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object('entryId',entry_id,'revisionId',id,'revisionNumber',revision_number,'original',original,'definitionVi',definition_vi,'review',review,'eligible',coalesce(eligible,false),'sourceName',source->>'name','sourceEntryId',source_entry_id,'sourceSenseId',source_sense_id,'entryUrl',entry_url) order by created_at,entry_id) filter(where rn<=p_limit),'[]'::jsonb),
    'nextPosition',case when count(*)>p_limit then (jsonb_agg(jsonb_build_object('createdAt',created_at,'id',entry_id) order by created_at,entry_id) filter(where rn=p_limit))->0 else null end,
    'selectedRevisionId',(select entry_revision_id from private.vtv_answer_selections where normalized=p_normalized),
    'answerRevisionId',(select answer_revision_id from private.vtv_answer_projection where normalized=p_normalized and level=p_level),
    'unresolved',coalesce((select unresolved from private.vtv_answer_projection where normalized=p_normalized and level=p_level),false),
    'eligibleCount',coalesce((select eligible_count from private.vtv_answer_projection where normalized=p_normalized and level=p_level),0),
    'draftRevision',(select revision::text from private.vtv_draft where id=1)
  ) into result from page;
  return result;
end; $$;
revoke all on function public.vtv_collision(text,integer,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.vtv_collision(text,integer,timestamptz,uuid,integer) to service_role;
