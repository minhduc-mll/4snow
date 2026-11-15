begin;
insert into private.vtv_sources(id,kind,resource_revision,artifact_sha256,metadata) values ('10000000-0000-4000-8000-000000000001','kaikki','fixture',repeat('a',64),'{"name":"Synthetic source"}');
insert into private.vtv_imports(id,artifact_id,artifact_revision,expected_chunks,status,finalized_at) values ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000011','v1',1,'finalized',now()),('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000012','v1',1,'staging',null);
insert into private.vtv_entries(id,source_id,external_id,source_entry_id,entry_url,source_payload,import_id,current_revision_id) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','one','one','https://example.invalid/one','{}','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','two','two','https://example.invalid/two','{}','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002'),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','private','private','https://example.invalid/private','{}','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003'),
('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','accent','accent','https://example.invalid/accent','{}','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004');
insert into private.vtv_entry_revisions(id,entry_id,revision_number,original,normalized,level,definition_vi,actor_role) values
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'mèo','MÈO',3,'Một con vật.','import'),
('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',1,'mèo','MÈO',3,'Một nghĩa khác.','import'),
('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003',1,'mèo','MÈO',3,'Chưa hoàn tất.','import'),
('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000004',1,'meo','MEO',3,null,'import');

update private.vtv_entry_revisions set review='approved',answer_eligible=true,category='common',rationale='Reviewed.',exclusion_checks='{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}' where id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002');
do $$
declare result jsonb; receipt jsonb;
input jsonb := '{"normalized":"MÈO","level":3,"entryRevisionId":"40000000-0000-4000-8000-000000000002","expectedDraftRevision":"0"}';
begin
  if public.vtv_collision('MEO',3,null,null,50)->>'eligibleCount' <> '0' then raise exception 'guess-only collision became answer'; end if;
  update private.vtv_entry_revisions set answer_eligible=false where id='40000000-0000-4000-8000-000000000002';
  result := public.vtv_collision('MÈO',3,null,null,50);
  if result->>'unresolved'<>'false' or result->>'answerRevisionId'<>'40000000-0000-4000-8000-000000000001' then raise exception 'sole eligible answer missing'; end if;
  update private.vtv_entry_revisions set answer_eligible=true where id='40000000-0000-4000-8000-000000000002';
  if has_function_privilege('anon','public.vtv_select_answer(uuid,uuid,text,jsonb)','execute') or has_function_privilege('authenticated','public.vtv_collision(text,integer,timestamptz,uuid,integer)','execute') then raise exception 'role access'; end if;
  result := public.vtv_collision('MÈO',3,null,null,1);
  if result->>'unresolved'<>'true' or result->>'eligibleCount'<>'2' or result->'answerRevisionId'<>'null'::jsonb or result->'nextPosition'='null'::jsonb then raise exception 'unselected collision resolved'; end if;
  result := public.vtv_collision('MÈO',3,(result->'nextPosition'->>'createdAt')::timestamptz,(result->'nextPosition'->>'id')::uuid,1);
  if jsonb_array_length(result->'items')<>1 or result->'nextPosition'<>'null'::jsonb then raise exception 'collision pagination failed'; end if;
  if (select count(*) from private.vtv_answer_projection where normalized='MÈO' and accepted_guess) <> 1 then raise exception 'membership not deduplicated'; end if;
  receipt := public.vtv_select_answer(gen_random_uuid(),'50000000-0000-4000-8000-000000000001',repeat('a',64),input);
  result := public.vtv_select_answer(gen_random_uuid(),'50000000-0000-4000-8000-000000000001',repeat('a',64),input);
  if result<>receipt or result->>'draftRevision'<>'1' then raise exception 'retry changed'; end if;
  if (select definition_vi from private.vtv_current_candidates where id=(select answer_revision_id from private.vtv_answer_projection where normalized='MÈO')) <> 'Một nghĩa khác.' then raise exception 'wrong selected definition'; end if;
  begin
    perform public.vtv_select_answer(gen_random_uuid(),gen_random_uuid(),repeat('b',64),input);
    raise exception 'stale accepted';
  exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise; end if; end;
  begin
    perform public.vtv_select_answer(gen_random_uuid(),'50000000-0000-4000-8000-000000000001',repeat('c',64),input);
    raise exception 'changed retry accepted';
  exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  input := jsonb_set(input,'{expectedDraftRevision}','"1"');
  update private.vtv_entry_revisions set review='pending',answer_eligible=false where id='40000000-0000-4000-8000-000000000001';
  begin
    perform public.vtv_select_answer(gen_random_uuid(),gen_random_uuid(),repeat('9',64),jsonb_set(input,'{entryRevisionId}','"40000000-0000-4000-8000-000000000001"'));
    raise exception 'same spelling pending answer accepted';
  exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise; end if; end;
  update private.vtv_entry_revisions set review='approved',answer_eligible=true where id='40000000-0000-4000-8000-000000000001';
  begin
    perform public.vtv_select_answer(gen_random_uuid(),gen_random_uuid(),repeat('d',64),jsonb_set(input,'{entryRevisionId}','"40000000-0000-4000-8000-000000000004"'));
    raise exception 'ineligible accepted';
  exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise; end if; end;
  perform public.vtv_review_candidate(gen_random_uuid(),gen_random_uuid(),repeat('e',64),'{"entryId":"30000000-0000-4000-8000-000000000002","expectedEntryRevision":1,"expectedDraftRevision":"1","original":"mèo","definitionVi":"Nghĩa sửa đổi.","review":"approved","answerEligible":true,"category":"common","rationale":"Reviewed.","exclusionChecks":{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}}','MÈO',3);
  result := public.vtv_collision('MÈO',3,null,null,50);
  if result->>'unresolved'<>'true' or result->'answerRevisionId'<>'null'::jsonb or result->>'eligibleCount'<>'1' then raise exception 'stale selection fell back'; end if;
  begin
    perform public.vtv_select_answer(gen_random_uuid(),gen_random_uuid(),repeat('f',64),jsonb_set(input,'{expectedDraftRevision}','"2"'));
    raise exception 'old revision accepted';
  exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise; end if; end;
  if (select count(*) from private.vtv_editorial_events where operation='select-answer')<>1 then raise exception 'duplicate audit'; end if;
end $$;
rollback;
