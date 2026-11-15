begin;
insert into private.vtv_sources(id,kind,resource_revision,artifact_sha256,metadata) values ('10000000-0000-4000-8000-000000000001','kaikki','source-v1',repeat('a',64),'{"name":"Fixture","artifactUrl":"https://example.invalid/artifact","rights":{"licenseName":"Test","licenseVersion":"1","licenseUrl":"https://example.invalid/license","attributionText":"Credit","historyUrl":"https://example.invalid/history","modificationsNotice":"Modified","redistributionNote":"private claim"}}');
insert into private.vtv_imports(id,artifact_id,artifact_revision,expected_chunks,status,finalized_at) values ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000011','artifact-v1',1,'finalized',now());
insert into private.vtv_entries(id,source_id,external_id,source_entry_id,source_sense_id,entry_url,source_payload,import_id,current_revision_id) values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','one','entry','sense','https://example.invalid/entry','{"sourceNotes":"private notes"}','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
insert into private.vtv_entry_revisions(id,entry_id,revision_number,original,normalized,level,actor_role) values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'mèo','MÈO',3,'import');
do $$ begin
 if has_table_privilege('anon','private.vtv_rights_reviews','select') or has_function_privilege('authenticated','public.vtv_review_rights(uuid,uuid,text,jsonb)','execute') or has_function_privilege('anon','public.vtv_candidate_detail(uuid)','execute') then raise exception 'private rights exposed'; end if;
end $$;
set local role service_role;
do $$ declare input jsonb := '{"sourceId":"10000000-0000-4000-8000-000000000001","expectedDraftRevision":"0","decision":"unresolved","evidence":"private evidence","obligations":"private obligations"}'; first_result jsonb; result jsonb; detail jsonb; preview jsonb; begin
 detail := public.vtv_candidate_detail('30000000-0000-4000-8000-000000000001');
 if detail->'rightsReview' <> 'null'::jsonb then raise exception 'import claim cleared itself'; end if;
 first_result := public.vtv_review_rights('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',repeat('a',64),input);
 result := public.vtv_review_rights('50000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002',repeat('a',64),input);
 if result <> first_result then raise exception 'retry differs'; end if;
 begin perform public.vtv_review_rights('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',repeat('b',64),input); raise exception 'conflicting retry accepted'; exception when raise_exception then if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin perform public.vtv_review_rights('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004',repeat('b',64),input); raise exception 'stale accepted'; exception when raise_exception then if sqlerrm <> 'REVISION_CONFLICT' then raise; end if; end;
 input := jsonb_set(jsonb_set(input,'{expectedDraftRevision}','"1"'),'{decision}','"cleared"');
 result := public.vtv_review_rights('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004',repeat('b',64),input);
 detail := public.vtv_candidate_detail('30000000-0000-4000-8000-000000000001'); preview := detail->'attributionPreview';
 if detail->'rightsReview'->>'decision' <> 'cleared' or detail->'rightsReview'->>'previousReviewId' <> first_result->>'rightsReviewId' or result->>'draftRevision' <> '2' then raise exception 'linked clearance failed'; end if;
 if preview <> jsonb_build_object('id','30000000-0000-4000-8000-000000000001','sourceName','Fixture','sourceEntryId','entry','sourceSenseId','sense','entryUrl','https://example.invalid/entry','artifactUrl','https://example.invalid/artifact','artifactSha256',repeat('a',64),'resourceRevision','source-v1','artifactRevision','artifact-v1','licenseName','Test','licenseVersion','1','licenseUrl','https://example.invalid/license','attributionText','Credit','historyUrl','https://example.invalid/history','modificationsNotice','Modified') then raise exception 'public attribution mismatch'; end if;
 input := jsonb_set(jsonb_set(input,'{expectedDraftRevision}','"2"'),'{decision}','"rejected"');
 perform public.vtv_review_rights('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000005',repeat('c',64),input);
 if public.vtv_candidate_detail('30000000-0000-4000-8000-000000000001')->'rightsReview'->>'decision' <> 'rejected' then raise exception 'latest rejection missing'; end if;
end $$;
rollback;
