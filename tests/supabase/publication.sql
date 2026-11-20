begin;
do $$ declare report jsonb; begin
  report := public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('a',64),0);
  if report->>'valid' <> 'false' or (report->>'errorCount')::integer < 4 then raise exception 'empty dictionary preview accepted'; end if;
end $$;
rollback;
begin;
-- PUBLICATION_FIXTURE
create function private.vtv_test_fail() returns trigger language plpgsql as $$ begin
  if new.operation='publish' then raise exception 'FORCED_COMMIT_FAILURE'; end if;
  return new;
end; $$;
create trigger vtv_test_commit_failure before insert on private.vtv_editorial_events for each row execute function private.vtv_test_fail();
do $$ declare preview jsonb; begin
  preview:=public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('a',64),1);
  begin
    perform public.vtv_publish(gen_random_uuid(),gen_random_uuid(),repeat('b',64),(preview->>'buildId')::uuid,1,null);
    raise exception 'forced failure not exercised';
  exception when raise_exception then if sqlerrm<>'FORCED_COMMIT_FAILURE' then raise; end if; end;
  if exists(select 1 from public.vtv_releases) or exists(select 1 from public.vtv_current_release) or exists(select 1 from private.vtv_requests where operation='publish') then raise exception 'failed transaction exposed partial publication'; end if;
  if (select revision from private.vtv_draft where id=1)<>1 then raise exception 'failed transaction advanced draft'; end if;
end $$;
rollback;
begin;
-- PUBLICATION_FIXTURE
do $$ declare preview jsonb; input jsonb; n integer; begin
  for n in 1..5 loop if public.vtv_consume_publication_limit()<>0 then raise exception 'early rate limit'; end if; end loop;
  if public.vtv_consume_publication_limit()<=0 then raise exception 'publication rate limit missing'; end if;
  perform public.vtv_review_rights(gen_random_uuid(),gen_random_uuid(),repeat('b',64),'{"sourceId":"10000000-0000-4000-8000-000000000001","expectedDraftRevision":"1","decision":"unresolved","evidence":"Synthetic unresolved","obligations":"Synthetic"}');
  preview:=public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('c',64),2);
  if preview->>'valid'<>'false' or not(preview->'errors' @> '[{"code":"RIGHTS_UNRESOLVED"}]') then raise exception 'unresolved rights accepted'; end if;
  begin
    perform public.vtv_publish(gen_random_uuid(),gen_random_uuid(),repeat('d',64),(preview->>'buildId')::uuid,2,null);
    raise exception 'invalid build published';
  exception when raise_exception then if sqlerrm<>'RELEASE_INCOMPLETE' then raise; end if; end;
  if exists(select 1 from public.vtv_releases) or exists(select 1 from public.vtv_current_release) then raise exception 'failed validation exposed release'; end if;
end $$;
rollback;
begin;
-- PUBLICATION_FIXTURE
insert into private.vtv_entries(id,source_id,external_id,source_entry_id,source_sense_id,entry_url,source_payload,import_id,current_revision_id)
values('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','alternate','alternate','alternate','https://example.invalid/alternate','{}','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005');
insert into private.vtv_entry_revisions(id,entry_id,revision_number,original,normalized,level,definition_vi,review,answer_eligible,category,rationale,exclusion_checks,actor_role)
select '40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005',1,'MÈO','MÈO',3,'Nghĩa thay thế đã duyệt.','approved',true,'common','Reviewed','{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}','admin';
do $$ declare preview jsonb; begin
  preview:=public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('a',64),1);
  if preview->>'valid'<>'false' or not(preview->'errors' @> '[{"code":"UNRESOLVED_COLLISION"}]') then raise exception 'unresolved collision published'; end if;
  perform public.vtv_select_answer(gen_random_uuid(),gen_random_uuid(),repeat('b',64),'{"normalized":"MÈO","level":3,"entryRevisionId":"40000000-0000-4000-8000-000000000005","expectedDraftRevision":"1"}');
  preview:=public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('c',64),2);
  if preview->>'valid'<>'true' or preview->'coverage'->'3'->>'guesses'<>'1' or preview->'playerSamples'->'3'->0->>'definitionVi'<>'Nghĩa thay thế đã duyệt.' then raise exception 'selected definition/membership wrong'; end if;
  perform public.vtv_review_candidate(gen_random_uuid(),gen_random_uuid(),repeat('d',64),'{"entryId":"30000000-0000-4000-8000-000000000005","expectedEntryRevision":1,"expectedDraftRevision":"2","original":"mèo","definitionVi":"Nghĩa mới.","review":"approved","answerEligible":true,"category":"common","rationale":"Reviewed","exclusionChecks":{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}}','MÈO',3);
  begin
    perform public.vtv_publish(gen_random_uuid(),gen_random_uuid(),repeat('e',64),(preview->>'buildId')::uuid,2,null);
    raise exception 'edit during preview accepted';
  exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise; end if; end;
  preview:=public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('f',64),3);
  if preview->>'valid'<>'false' then raise exception 'stale selected revision reused'; end if;
end $$;
rollback;
begin;
-- PUBLICATION_FIXTURE
do $$ declare preview jsonb; result jsonb; repeated jsonb; snapshot jsonb; changed jsonb;
key uuid:=gen_random_uuid(); req uuid:=gen_random_uuid();
begin
  if private.vtv_https('https://[not-a-host') or private.vtv_https('https://%') or private.vtv_https('https://example.invalid:99999') or private.vtv_https('https://xn--a') or private.vtv_https('https://user:pass@example.invalid') then raise exception 'invalid source URL accepted'; end if;
  if not private.vtv_https('https://example.invalid:443/entry?oldid=1#sense') then raise exception 'valid source URL rejected'; end if;
  preview:=public.vtv_publication_preview(req,key,repeat('b',64),1);
  if preview->>'valid'<>'true' then raise exception 'complete fixture rejected: %',preview->'errors'; end if;
  if public.vtv_publication_preview(gen_random_uuid(),key,repeat('b',64),1)<>preview then raise exception 'preview retry changed'; end if;
  select payload into snapshot from private.vtv_release_builds where id=(preview->>'buildId')::uuid;
  if snapshot::text like '%PRIVATE%' or snapshot::text like '%DO NOT EXPOSE%' then raise exception 'private payload leak'; end if;
  if snapshot->'levels'->'9'->'answers'->0->>'definitionVi'<>'Nghĩa đã duyệt cho kiểm thử.' then raise exception 'wrong player meaning'; end if;
  changed:=jsonb_set(snapshot,'{levels,9,answers,0,definitionVi}','" "');
  if private.vtv_release_errors(changed)='[]'::jsonb then raise exception 'missing meaning accepted'; end if;
  changed:=jsonb_set(snapshot,'{levels,9,guesses}','[]');
  if private.vtv_release_errors(changed)='[]'::jsonb then raise exception 'answer outside membership accepted'; end if;
  changed:=jsonb_set(snapshot,'{levels,9,guesses}',(select jsonb_agg('TIẾNGVIỆT'::text) from generate_series(1,20001)));
  if not(private.vtv_release_errors(changed) @> '[{"code":"LEVEL_LIMIT","level":9}]') then raise exception 'guess cap missing'; end if;
  changed:=jsonb_set(snapshot,'{attributions,0,attributionText}',to_jsonb(repeat('x',2097153)));
  if not(private.vtv_release_errors(changed) @> '[{"code":"PAYLOAD_TOO_LARGE"}]') then raise exception 'byte cap missing'; end if;
  begin
    perform public.vtv_publish(gen_random_uuid(),gen_random_uuid(),repeat('c',64),(preview->>'buildId')::uuid,1,gen_random_uuid());
    raise exception 'wrong current pointer accepted';
  exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise; end if; end;
  key:=gen_random_uuid();
  result:=public.vtv_publish(gen_random_uuid(),key,repeat('d',64),(preview->>'buildId')::uuid,1,null);
  repeated:=public.vtv_publish(gen_random_uuid(),key,repeat('d',64),(preview->>'buildId')::uuid,1,null);
  if repeated<>result or result->>'pointerRevision'<>'1' then raise exception 'publication retry changed'; end if;
  if (select count(*) from public.vtv_releases)<>1 or (select count(*) from private.vtv_editorial_events where operation='publish')<>1 then raise exception 'duplicate publication'; end if;
  begin
    perform public.vtv_publish(gen_random_uuid(),gen_random_uuid(),repeat('e',64),(preview->>'buildId')::uuid,1,null);
    raise exception 'second stale publish accepted';
  exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise; end if; end;
  begin update public.vtv_releases set attempt_limit=7; raise exception 'release mutable'; exception when raise_exception then if sqlerrm<>'IMMUTABLE' then raise; end if; end;
  preview:=public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('f',64),2);
  repeated:=public.vtv_publish(gen_random_uuid(),gen_random_uuid(),repeat('0',64),(preview->>'buildId')::uuid,2,(result->>'releaseId')::uuid);
  if repeated->>'pointerRevision'<>'2' or (select count(*) from public.vtv_releases)<>2 then raise exception 'old release lost'; end if;
  if has_function_privilege('anon','public.vtv_publish(uuid,uuid,text,uuid,bigint,uuid)','execute') or has_table_privilege('authenticated','public.vtv_releases','insert') or has_table_privilege('anon','private.vtv_release_builds','select') then raise exception 'public privileges unsafe'; end if;
end $$;
set local role anon;
select count(*)=2 as retained_releases from public.vtv_releases;
select count(*)=1 as current_pointer from public.vtv_current_release;
rollback;

begin;
-- PUBLICATION_FIXTURE
insert into private.vtv_entries(id,source_id,external_id,source_entry_id,source_sense_id,entry_url,source_payload,import_id,current_revision_id)
values('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','alternate','alternate','alternate','https://example.invalid/alternate','{}','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005');
insert into private.vtv_entry_revisions(id,entry_id,revision_number,original,normalized,level,definition_vi,review,answer_eligible,category,rationale,exclusion_checks,actor_role)
values('40000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000005',1,'mèo','MÈO',3,'Nghĩa thay thế.','approved',false,'common','Reviewed','{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}','admin');
do $$
declare baseline jsonb; preview jsonb; release_id uuid;
begin
  baseline := public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('a',64),1);
  release_id := (public.vtv_publish_confirmed(gen_random_uuid(),gen_random_uuid(),repeat('b',64),
    (baseline->>'buildId')::uuid,1,null,baseline->>'contentHash')->>'releaseId')::uuid;
  perform public.vtv_review_candidate(gen_random_uuid(),gen_random_uuid(),repeat('c',64),
    '{"entryId":"30000000-0000-4000-8000-000000000001","expectedEntryRevision":1,"expectedDraftRevision":"2","original":"mèo","definitionVi":"Nghĩa đã duyệt cho kiểm thử.","review":"withdrawn","answerEligible":false,"category":"common","rationale":"Withdrawn","exclusionChecks":{}}','MÈO',3);
  preview := public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('d',64),3);
  if preview->>'valid' is distinct from 'false' or preview->'coverage'->'3'->>'guesses' is distinct from '1'
    or preview->'changes'->'3'->'guesses'->>'removed' is distinct from '0'
    or not (preview->'spellingChanges'->'groups' @> '{"guessRetained":{"total":1,"items":[{"normalized":"MÈO","level":3}]},"answerRemoved":{"total":1,"items":[{"normalized":"MÈO","level":3}]}}')
  then raise exception 'withdrawal did not keep alternate membership and report the removed answer: %',preview; end if;
  begin
    perform public.vtv_publish_confirmed(gen_random_uuid(),gen_random_uuid(),repeat('e',64),
      (preview->>'buildId')::uuid,3,release_id,preview->>'contentHash');
    raise exception 'incomplete release replaced the public baseline';
  exception when raise_exception then if sqlerrm <> 'RELEASE_INCOMPLETE' then raise; end if; end;
  if (select current.release_id from public.vtv_current_release current where current.id=1) is distinct from release_id then
    raise exception 'failed publication changed public pointer';
  end if;
  perform public.vtv_review_candidate(gen_random_uuid(),gen_random_uuid(),repeat('f',64),
    '{"entryId":"30000000-0000-4000-8000-000000000005","expectedEntryRevision":1,"expectedDraftRevision":"3","original":"mèo","definitionVi":"Nghĩa thay thế.","review":"withdrawn","answerEligible":false,"category":"common","rationale":"Withdrawn","exclusionChecks":{}}','MÈO',3);
  preview := public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('0',64),4);
  if not (preview->'spellingChanges'->'groups' @> '{"guessRemoved":{"total":1,"items":[{"normalized":"MÈO","level":3}]}}')
    or preview->'spellingChanges'->'groups' ? 'guessRetained'
  then raise exception 'removal of last approved meaning did not drop spelling'; end if;
end $$;
rollback;
