begin;
do $$ declare result jsonb; repeated jsonb; key uuid:=gen_random_uuid(); cfg uuid; value jsonb; begin
  if (select attempt_limit from private.vtv_draft where id=1)<>6 then raise exception 'default is not six'; end if;
  result:=public.vtv_configure(gen_random_uuid(),key,repeat('a',64),'{"attemptLimit":1,"expectedDraftRevision":"0"}');
  if result->'configuration'->>'attemptLimit'<>'1' or result->'configuration'->'levels'<>'[3,5,7,9]'::jsonb or result->'configuration'->>'normalizerVersion'<>'vi-nfc-v2' then raise exception 'configuration bounds/fixed rules wrong'; end if;
  cfg:=(result->'configuration'->>'configurationId')::uuid;
  repeated:=public.vtv_configure(gen_random_uuid(),key,repeat('a',64),'{"attemptLimit":1,"expectedDraftRevision":"0"}');
  if repeated<>result or (select revision from private.vtv_draft where id=1)<>1 or (select count(*) from private.vtv_editorial_events where operation='configuration')<>1 then raise exception 'retry mutated twice'; end if;
  begin perform public.vtv_configure(gen_random_uuid(),key,repeat('b',64),'{"attemptLimit":12,"expectedDraftRevision":"1"}'); raise exception 'key reuse accepted'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  begin perform public.vtv_configure(gen_random_uuid(),gen_random_uuid(),repeat('c',64),'{"attemptLimit":12,"expectedDraftRevision":"0"}'); raise exception 'stale edit accepted'; exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise; end if; end;
  foreach value in array array['0'::jsonb,'13'::jsonb,'1.5'::jsonb,'"6"'::jsonb,'null'::jsonb,'true'::jsonb] loop
    begin perform public.vtv_configure(gen_random_uuid(),gen_random_uuid(),repeat('d',64),jsonb_build_object('attemptLimit',value,'expectedDraftRevision','1')); raise exception 'invalid attempts accepted'; exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise; end if; end;
  end loop;
  begin perform public.vtv_configure(gen_random_uuid(),gen_random_uuid(),repeat('e',64),'{"attemptLimit":6,"expectedDraftRevision":"1","levels":[3]}'); raise exception 'rules override accepted'; exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise; end if; end;
  foreach value in array array['-1'::jsonb,'18'::jsonb,'1.5'::jsonb,'"5"'::jsonb,'null'::jsonb] loop
    begin perform public.vtv_configure(gen_random_uuid(),gen_random_uuid(),repeat('d',64),jsonb_build_object('attemptLimit',6,'initialAbsentCount',value,'expectedDraftRevision','1')); raise exception 'invalid clues accepted'; exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise; end if; end;
  end loop;
  result:=public.vtv_configure(gen_random_uuid(),gen_random_uuid(),repeat('f',64),'{"attemptLimit":12,"expectedDraftRevision":"1"}');
  if result->'configuration'->>'attemptLimit'<>'12' or (result->'configuration'->>'configurationId')::uuid=cfg or result->>'draftRevision'<>'2' then raise exception 'new identity/revision missing'; end if;
  if not exists(select 1 from private.vtv_editorial_events where operation='configuration' and actor_role='admin' and previous_draft_revision=1 and next_draft_revision=2 and input->>'attemptLimit'='12' and output=result and configuration->>'attemptLimit'='12' and created_at is not null) then raise exception 'audit incomplete'; end if;
  if exists(select 1 from public.vtv_releases) or exists(select 1 from public.vtv_current_release) then raise exception 'private draft published early'; end if;
end $$;
rollback;
begin;
create function private.vtv_test_configuration_failure() returns trigger language plpgsql as $$ begin
  if new.operation='configuration' then raise exception 'FORCED_CONFIGURATION_AUDIT_FAILURE'; end if;
  return new;
end; $$;
create trigger vtv_test_configuration_failure before insert on private.vtv_editorial_events for each row execute function private.vtv_test_configuration_failure();
do $$ declare before_id uuid; begin
  select configuration_id into before_id from private.vtv_draft where id=1;
  begin perform public.vtv_configure(gen_random_uuid(),gen_random_uuid(),repeat('a',64),'{"attemptLimit":12,"expectedDraftRevision":"0"}'); raise exception 'forced failure absent'; exception when raise_exception then if sqlerrm<>'FORCED_CONFIGURATION_AUDIT_FAILURE' then raise; end if; end;
  if (select configuration_id from private.vtv_draft where id=1)<>before_id or (select revision from private.vtv_draft where id=1)<>0 or exists(select 1 from private.vtv_requests where operation='configuration') then raise exception 'failed audit leaked configuration'; end if;
  if has_function_privilege('anon','public.vtv_configure(uuid,uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.vtv_configure(uuid,uuid,text,jsonb)','execute') or not has_function_privilege('service_role','public.vtv_configure(uuid,uuid,text,jsonb)','execute') then raise exception 'configuration RPC privilege incorrect'; end if;
end $$;
rollback;
begin;
-- PUBLICATION_FIXTURE
insert into private.vtv_entries(id,source_id,external_id,source_entry_id,source_sense_id,entry_url,source_payload,import_id,current_revision_id)
values ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','5','entry-5','sense-5','https://example.invalid/entry-5','{}','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005');
insert into private.vtv_entry_revisions(id,entry_id,revision_number,original,normalized,level,definition_vi,review,answer_eligible,category,rationale,exclusion_checks,actor_role)
values ('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005',1,'soi','SOI',3,'Nghĩa cho kiểm thử.','approved',true,'rare','Classification test','{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}','admin');
do $$ declare old_preview jsonb; stale_preview jsonb; next_preview jsonb; old_release jsonb; next_release jsonb; old_payload jsonb; next_payload jsonb; configured jsonb; begin
  old_preview:=public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('a',64),1);
  old_release:=public.vtv_publish(gen_random_uuid(),gen_random_uuid(),repeat('b',64),(old_preview->>'buildId')::uuid,1,null);
  select public_payload into old_payload from public.vtv_releases where id=(old_release->>'releaseId')::uuid;
  if not ((old_payload->'levels'->'3'->'answers') @> '[{"normalized":"SOI","category":"rare"}]'::jsonb) then raise exception 'rare answer missing'; end if;
  stale_preview:=public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('c',64),2);
  configured:=public.vtv_configure(gen_random_uuid(),gen_random_uuid(),repeat('d',64),'{"attemptLimit":12,"initialAbsentCount":17,"expectedDraftRevision":"2"}');
  if (select release_id from public.vtv_current_release where id=1)<>(old_release->>'releaseId')::uuid or (select attempt_limit from public.vtv_releases where id=(old_release->>'releaseId')::uuid)<>6 then raise exception 'draft changed live configuration'; end if;
  begin perform public.vtv_publish(gen_random_uuid(),gen_random_uuid(),repeat('e',64),(stale_preview->>'buildId')::uuid,2,(old_release->>'releaseId')::uuid); raise exception 'stale preview published'; exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise; end if; end;
  next_preview:=public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('f',64),3);
  next_release:=public.vtv_publish(gen_random_uuid(),gen_random_uuid(),repeat('1',64),(next_preview->>'buildId')::uuid,3,(old_release->>'releaseId')::uuid);
  select public_payload into next_payload from public.vtv_releases where id=(next_release->>'releaseId')::uuid;
  if (next_payload->>'initialAbsentCount') is distinct from '17' or (next_preview->'configuration'->>'initialAbsentCount') is distinct from '17' or (old_payload->>'initialAbsentCount') is distinct from '0' or next_payload->>'attemptLimit'<>'12' or next_payload->>'configurationId'<>configured->'configuration'->>'configurationId' or old_payload->>'configurationId'=next_payload->>'configurationId' or old_payload->'levels'<>next_payload->'levels' or old_payload->'attributions'<>next_payload->'attributions' then raise exception 'settings-only snapshot incomplete or mixed'; end if;
  if (select public_payload from public.vtv_releases where id=(old_release->>'releaseId')::uuid)<>old_payload or (select release_id from public.vtv_current_release where id=1)<>(next_release->>'releaseId')::uuid then raise exception 'old release changed or pointer not advanced'; end if;
end $$;
rollback;
begin;
set local role anon;
do $$ begin
  begin perform public.vtv_configure(gen_random_uuid(),gen_random_uuid(),repeat('a',64),'{"attemptLimit":12,"expectedDraftRevision":"0"}'); raise exception 'anonymous configured'; exception when insufficient_privilege then null; end;
end $$;
rollback;
