-- Only the authorized Edge boundary may change private draft settings.
create function public.vtv_configure(p_request_id uuid,p_idempotency_key uuid,p_request_hash text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  existing private.vtv_requests%rowtype;
  draft private.vtv_draft%rowtype;
  expected bigint;
  attempts numeric;
  new_configuration_id uuid:=gen_random_uuid();
  configuration jsonb;
  result jsonb;
  event_id uuid;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_input is null or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'INVALID_INPUT'; end if;
  if (select count(*) from jsonb_object_keys(p_input))<>2 or not(p_input ?& array['expectedDraftRevision','attemptLimit'])
    or jsonb_typeof(p_input->'expectedDraftRevision') is distinct from 'string'
    or (p_input->>'expectedDraftRevision') !~ '^(0|[1-9][0-9]{0,18})$'
    or jsonb_typeof(p_input->'attemptLimit') is distinct from 'number' then raise exception 'INVALID_INPUT'; end if;
  if (p_input->>'expectedDraftRevision')::numeric>9223372036854775807 then raise exception 'INVALID_INPUT'; end if;
  attempts:=(p_input->>'attemptLimit')::numeric;
  if attempts<1 or attempts>12 or trunc(attempts)<>attempts then raise exception 'INVALID_INPUT'; end if;
  expected:=(p_input->>'expectedDraftRevision')::bigint;
  perform pg_advisory_xact_lock(hashtextextended('vtv-configuration:'||p_idempotency_key::text,0));
  select * into existing from private.vtv_requests where operation='configuration' and idempotency_key=p_idempotency_key;
  if found then
    if existing.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.result;
  end if;
  select * into draft from private.vtv_draft where id=1 for update;
  if draft.revision<>expected then raise exception 'REVISION_CONFLICT'; end if;
  configuration:=jsonb_build_object('configurationId',new_configuration_id,'attemptLimit',attempts::integer,'normalizerVersion',draft.normalizer_version,'levels',jsonb_build_array(3,5,7,9));
  update private.vtv_draft set configuration_id=new_configuration_id,attempt_limit=attempts::integer,revision=revision+1,updated_at=now() where id=1;
  result:=jsonb_build_object('draftRevision',(draft.revision+1)::text,'configuration',configuration);
  insert into private.vtv_editorial_events(operation,request_id,actor_role,previous_draft_revision,next_draft_revision,input,output,configuration)
    values('configuration',p_request_id,'admin',draft.revision,draft.revision+1,p_input,result,configuration||jsonb_build_object('previousConfigurationId',draft.configuration_id,'previousAttemptLimit',draft.attempt_limit)) returning id into event_id;
  insert into private.vtv_requests(operation,idempotency_key,request_hash,result,event_id) values('configuration',p_idempotency_key,p_request_hash,result,event_id);
  return result;
end; $$;
revoke all on function public.vtv_configure(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vtv_configure(uuid,uuid,text,jsonb) to service_role;
