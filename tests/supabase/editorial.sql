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
do $$ begin
  if pg_catalog.has_function_privilege('anon','public.vtv_review_candidate(uuid,uuid,text,jsonb,text,integer)','execute') or pg_catalog.has_function_privilege('authenticated','public.vtv_list_candidates(jsonb,timestamptz,uuid,integer)','execute') then raise exception 'browser role access'; end if;
end $$;
set local role service_role;
do $$
declare
  filters jsonb := '{"sourceId":null,"level":3,"review":null,"hasDefinition":null,"collisionsOnly":true}';
  listed jsonb;
  next_page jsonb;
  input jsonb := '{"entryId":"30000000-0000-4000-8000-000000000001","expectedEntryRevision":1,"expectedDraftRevision":"0","original":"mèo","definitionVi":"Một con vật.","openingClue":"Động vật nuôi","review":"approved","answerEligible":true,"category":"common","rationale":"Đã kiểm tra.","exclusionChecks":{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}}';
  result jsonb;
  repeated jsonb;
begin
  listed := public.vtv_list_candidates(filters,null,null,10);
  if jsonb_array_length(listed->'items') <> 2 then raise exception 'list included staging or missed collisions'; end if;
  next_page := public.vtv_list_candidates('{"sourceId":null,"level":3,"review":"pending","hasDefinition":false,"collisionsOnly":false}',null,null,10);
  if jsonb_array_length(next_page->'items') <> 1 or next_page->'items'->0->>'normalized' <> 'MEO' then raise exception 'filter or accent-sensitive collision failed'; end if;
  if public.vtv_candidate_detail('30000000-0000-4000-8000-000000000001')->>'sourceEntryId' <> 'one' then raise exception 'provenance missing'; end if;
  begin
    perform public.vtv_candidate_detail('30000000-0000-4000-8000-000000000003');
    raise exception 'staging candidate exposed';
  exception when raise_exception then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
  begin
    perform public.vtv_review_candidate('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000007',repeat('e',64),jsonb_set(input,'{exclusionChecks,names}','false'),'MÈO',3);
    raise exception 'approval without checks accepted';
  exception when raise_exception then if sqlerrm <> 'INVALID_INPUT' then raise; end if; end;
  listed := public.vtv_list_candidates(filters,null,null,1);
  if jsonb_array_length(listed->'items') <> 1 or listed->'nextPosition' = 'null'::jsonb then raise exception 'first page missing cursor'; end if;
  next_page := public.vtv_list_candidates(filters,(listed->'nextPosition'->>'createdAt')::timestamptz,(listed->'nextPosition'->>'id')::uuid,1);
  if jsonb_array_length(next_page->'items') <> 1 or next_page->'items'->0->>'id' = listed->'items'->0->>'id' then raise exception 'keyset page invalid'; end if;
  result := public.vtv_review_candidate('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',repeat('a',64),input,'MÈO',3);
  if result->>'review' <> 'approved' or result->>'answerEligible' <> 'true' or result->>'draftRevision' <> '1' then raise exception 'approval failed'; end if;
  if public.vtv_candidate_detail('30000000-0000-4000-8000-000000000001')->'current'->>'openingClue' is distinct from 'Động vật nuôi' then raise exception 'opening clue missing from detail'; end if;
  repeated := public.vtv_review_candidate('50000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002',repeat('a',64),input,'MÈO',3);
  if repeated <> result then raise exception 'retry changed receipt'; end if;
  begin
    perform public.vtv_review_candidate('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004',repeat('b',64),input,'MÈO',3);
    raise exception 'stale revision accepted';
  exception when raise_exception then if sqlerrm <> 'REVISION_CONFLICT' then raise; end if; end;
  input := jsonb_set(input,'{expectedEntryRevision}','2'); input := jsonb_set(input,'{expectedDraftRevision}','"1"'); input := jsonb_set(input,'{original}','"mêu"');
  result := public.vtv_review_candidate('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000005',repeat('c',64),input,'MÊU',3);
  if result->>'review' <> 'pending' or result->>'answerEligible' <> 'false' then raise exception 'edit retained approval'; end if;
  input := jsonb_set(input,'{expectedEntryRevision}','3'); input := jsonb_set(input,'{expectedDraftRevision}','"2"'); input := jsonb_set(input,'{openingClue}','null'); input := jsonb_set(input,'{review}','"rejected"'); input := jsonb_set(input,'{answerEligible}','false');
  result := public.vtv_review_candidate('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000006',repeat('d',64),input,'MÊU',3);
  if result->>'review' <> 'rejected' or result->>'answerEligible' <> 'false' then raise exception 'rejection failed'; end if;
  if public.vtv_candidate_detail('30000000-0000-4000-8000-000000000001')->'current'->'openingClue' is distinct from 'null'::jsonb then raise exception 'opening clue not cleared'; end if;
  if not exists(select 1 from jsonb_array_elements(public.vtv_candidate_history('30000000-0000-4000-8000-000000000001',null,null,50)->'items') r where r->>'revisionNumber'='2' and r->>'openingClue'='Động vật nuôi') then raise exception 'opening clue history missing'; end if;
  if jsonb_array_length(public.vtv_candidate_history('30000000-0000-4000-8000-000000000001',null,null,50)->'items') <> 4 then raise exception 'revision history missing'; end if;
end $$;
rollback;
