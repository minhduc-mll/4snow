create table private.vtv_rights_reviews (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references private.vtv_sources(id) on delete restrict,
  previous_review_id uuid,
  decision text not null check (decision in ('cleared','unresolved','rejected')),
  evidence text not null check (char_length(evidence) between 1 and 4000 and btrim(evidence) <> ''),
  obligations text not null check (char_length(obligations) between 1 and 4000 and btrim(obligations) <> ''),
  draft_revision bigint not null unique,
  actor_role text not null check (actor_role = 'admin'),
  created_at timestamptz not null default now(),
  unique (source_id,id),
  foreign key (source_id,previous_review_id) references private.vtv_rights_reviews(source_id,id) on delete restrict
);
create index vtv_rights_reviews_source_revision_idx on private.vtv_rights_reviews(source_id,draft_revision desc);
alter table private.vtv_rights_reviews enable row level security;
revoke all on private.vtv_rights_reviews from public, anon, authenticated;

create function public.vtv_review_rights(p_request_id uuid, p_idempotency_key uuid, p_request_hash text, p_input jsonb)
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
  if not exists(select 1 from private.vtv_entries e join private.vtv_imports i on i.id=e.import_id and i.status='finalized' where e.source_id=v_source_id) then raise exception 'NOT_FOUND'; end if;
  select id into previous_id from private.vtv_rights_reviews r where r.source_id=v_source_id order by r.draft_revision desc limit 1;
  update private.vtv_draft set revision=revision+1, updated_at=pg_catalog.now() where id=1 returning * into draft;
  insert into private.vtv_rights_reviews(id,source_id,previous_review_id,decision,evidence,obligations,draft_revision,actor_role) values(new_id,v_source_id,previous_id,p_input->>'decision',p_input->>'evidence',p_input->>'obligations',draft.revision,'admin');
  result := pg_catalog.jsonb_build_object('rightsReviewId',new_id,'draftRevision',draft.revision::text);
  insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration) values('rights-review',p_request_id,'admin',expected,draft.revision,p_input,result,pg_catalog.jsonb_build_object('configurationId',draft.configuration_id,'attemptLimit',draft.attempt_limit,'normalizerVersion',draft.normalizer_version,'previousReviewId',previous_id)) returning id into event_id;
  insert into private.vtv_requests(operation,idempotency_key,request_hash,result,event_id) values('rights-review',p_idempotency_key,p_request_hash,result,event_id);
  return result;
end; $$;
revoke all on function public.vtv_review_rights(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.vtv_review_rights(uuid,uuid,text,jsonb) to service_role;

alter function public.vtv_candidate_detail(uuid) rename to vtv_candidate_detail_base;
create function public.vtv_candidate_detail(p_entry_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; extra jsonb;
begin
  result := public.vtv_candidate_detail_base(p_entry_id);
  select pg_catalog.jsonb_build_object(
    'sourceId', s.id,
    'rightsReview', (select pg_catalog.jsonb_build_object('id',r.id,'previousReviewId',r.previous_review_id,'decision',r.decision,'evidence',r.evidence,'obligations',r.obligations,'createdAt',r.created_at,'actorRole',r.actor_role) from private.vtv_rights_reviews r where r.source_id=s.id order by r.draft_revision desc limit 1),
    'attributionPreview', pg_catalog.jsonb_build_object('id',e.id,'sourceName',s.metadata->>'name','sourceEntryId',e.source_entry_id,'sourceSenseId',e.source_sense_id,'entryUrl',e.entry_url,'artifactUrl',s.metadata->>'artifactUrl','artifactSha256',s.artifact_sha256,'resourceRevision',s.resource_revision,'artifactRevision',i.artifact_revision,'licenseName',s.metadata->'rights'->>'licenseName','licenseVersion',s.metadata->'rights'->>'licenseVersion','licenseUrl',s.metadata->'rights'->>'licenseUrl','attributionText',s.metadata->'rights'->>'attributionText','historyUrl',s.metadata->'rights'->>'historyUrl','modificationsNotice',s.metadata->'rights'->>'modificationsNotice')
  ) into extra from private.vtv_entries e join private.vtv_sources s on s.id=e.source_id join private.vtv_imports i on i.id=e.import_id where e.id=p_entry_id;
  return result || extra;
end; $$;
revoke all on function public.vtv_candidate_detail(uuid) from public, anon, authenticated;
grant execute on function public.vtv_candidate_detail(uuid) to service_role;
