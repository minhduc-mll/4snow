-- Run against a fresh disposable database after both VTV migrations.
begin;
do $$
begin
  if pg_catalog.has_schema_privilege('anon', 'private', 'usage') or pg_catalog.has_schema_privilege('authenticated', 'private', 'usage') then raise exception 'private schema exposed'; end if;
  if pg_catalog.has_function_privilege('anon', 'public.vtv_import_start(uuid,uuid,text,uuid,text,integer)', 'execute') or pg_catalog.has_function_privilege('authenticated', 'public.vtv_import_finalize(uuid,uuid,text,uuid,bigint)', 'execute') then raise exception 'mutation exposed'; end if;
  if exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private' and c.relkind = 'r' and (not c.relrowsecurity or pg_catalog.has_table_privilege('anon', c.oid, 'select,insert,update,delete') or pg_catalog.has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))) then raise exception 'private table exposed'; end if;
  if pg_catalog.has_function_privilege('anon', 'public.vtv_import_apply(uuid,uuid,text,uuid,jsonb,text,integer,jsonb)', 'execute') or pg_catalog.has_function_privilege('authenticated', 'public.vtv_consume_import_apply_limit()', 'execute') then raise exception 'import operation exposed'; end if;
  if pg_catalog.has_function_privilege('anon', 'public.vtv_consume_import_mutation_limit()', 'execute') or pg_catalog.has_function_privilege('authenticated', 'public.vtv_consume_import_mutation_limit()', 'execute') then raise exception 'limiter exposed'; end if;
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('vtv_import_start', 'vtv_import_apply', 'vtv_import_finalize', 'vtv_consume_import_apply_limit', 'vtv_consume_import_mutation_limit') and (pg_catalog.has_function_privilege('anon', p.oid, 'execute') or pg_catalog.has_function_privilege('authenticated', p.oid, 'execute'))) then raise exception 'function exposed'; end if;
end; $$;
insert into private.vtv_source_lineage_attestations(kind, resource_revision, artifact_sha256, source_entry_id, source_sense_id, candidate_payload, lineage_id, evidence)
select 'kaikki', revision, repeat('a', 64), 'stable:test-entry', 'stable:sense-1', '{"externalId":"test-entry","sourceEntryId":"stable:test-entry","sourceSenseId":"stable:sense-1","entryUrl":"https://example.invalid/test","original":"mèo","definitionVi":"Định nghĩa giả lập.","language":"vi","sourceNotes":null}'::jsonb, '20000000-0000-4000-8000-000000000099', 'Synthetic trusted source record and stable identifier scheme'
from (values ('v1'), ('v2'), ('v3'), ('v4')) revisions(revision);
set local role service_role;
do $$
declare result integer;
begin
  for counter in 1..20 loop
    select public.vtv_consume_import_apply_limit() into result;
    if result <> 0 then raise exception 'premature apply limit'; end if;
  end loop;
  select public.vtv_consume_import_apply_limit() into result;
  if result <= 0 then raise exception 'apply limit missing'; end if;
end; $$;
do $$
declare
  start_result jsonb;
  same_result jsonb;
  apply_result jsonb;
  final_result jsonb;
  import_id uuid;
  next_import_id uuid;
  payload jsonb := '{"artifactId":"10000000-0000-4000-8000-000000000001","artifactRevision":"v1","chunkIndex":0,"chunkCount":1,"sources":[{"sourceId":"20000000-0000-4000-8000-000000000002","kind":"kaikki","name":"fixture","artifactUrl":"https://example.invalid/source","resourceRevision":"v1","artifactSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"entries":[{"sourceId":"20000000-0000-4000-8000-000000000002","externalId":"test-entry","sourceEntryId":"stable:test-entry","sourceSenseId":"stable:sense-1","entryUrl":"https://example.invalid/test","original":"mèo","definitionVi":"Định nghĩa giả lập.","language":"vi","sourceNotes":null}]}'::jsonb;
  derived jsonb := '[{"normalized":"MÈO","level":3}]'::jsonb;
begin
  start_result := public.vtv_import_start('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',repeat('a',64),'10000000-0000-4000-8000-000000000001','v1',1);
  import_id := (start_result->>'importId')::uuid;
  same_result := public.vtv_import_start('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',repeat('a',64),'10000000-0000-4000-8000-000000000001','v1',1);
  if same_result <> start_result then raise exception 'start retry changed'; end if;
  begin
    perform public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000005',repeat('c',64),import_id,0);
    raise exception 'missing chunk accepted';
  exception when raise_exception then if sqlerrm <> 'IMPORT_CONFLICT' then raise; end if; end;
  apply_result := public.vtv_import_apply('30000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000006',repeat('b',64),import_id,payload,repeat('d',64),100,derived);
  if apply_result->>'createdCount' <> '1' or apply_result->>'noOpCount' <> '0' then raise exception 'invalid staged counts'; end if;
  same_result := public.vtv_import_apply('30000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000006',repeat('b',64),import_id,payload,repeat('d',64),100,derived);
  if same_result <> apply_result then raise exception 'apply retry changed'; end if;
  begin
    perform public.vtv_import_apply('30000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000007',repeat('e',64),import_id,payload,repeat('f',64),100,derived);
    raise exception 'conflicting chunk accepted';
  exception when raise_exception then if sqlerrm <> 'IMPORT_CONFLICT' then raise; end if; end;
  final_result := public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000005',repeat('c',64),import_id,0);
  if final_result->>'createdCount' <> '1' or final_result->>'draftRevision' <> '1' then raise exception 'invalid final receipt'; end if;
  same_result := public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000005',repeat('c',64),import_id,0);
  if same_result <> final_result then raise exception 'finalize retry changed'; end if;
  begin
    perform public.vtv_import_start('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',repeat('b',64),'10000000-0000-4000-8000-000000000001','v1',1);
    raise exception 'idempotency conflict accepted';
  exception when raise_exception then if sqlerrm <> 'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  start_result := public.vtv_import_start('30000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000008',repeat('1',64),'90000000-0000-4000-8000-000000000009','v1',1);
  next_import_id := (start_result->>'importId')::uuid;
  payload := pg_catalog.jsonb_set(payload, '{artifactId}', '"90000000-0000-4000-8000-000000000009"'::jsonb);
  apply_result := public.vtv_import_apply('30000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-00000000000a',repeat('2',64),next_import_id,payload,repeat('3',64),100,derived);
  if apply_result->>'createdCount' <> '0' or apply_result->>'noOpCount' <> '1' then raise exception 'invalid staged no-op count'; end if;
  begin
    perform public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-00000000000b',repeat('4',64),next_import_id,0);
    raise exception 'stale draft revision accepted';
  exception when raise_exception then if sqlerrm <> 'REVISION_CONFLICT' then raise; end if; end;
  final_result := public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-00000000000b',repeat('5',64),next_import_id,1);
  if final_result->>'createdCount' <> '0' or final_result->>'noOpCount' <> '1' or final_result->>'draftRevision' <> '2' then raise exception 'invalid no-op receipt'; end if;
  start_result := public.vtv_import_start('30000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-00000000000c',repeat('6',64),'d0000000-0000-4000-8000-00000000000d','v2',1);
  next_import_id := (start_result->>'importId')::uuid;
  payload := pg_catalog.jsonb_set(payload, '{artifactId}', '"d0000000-0000-4000-8000-00000000000d"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{artifactRevision}', '"v2"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{sources,0,resourceRevision}', '"v2"'::jsonb);
  perform public.vtv_import_apply('30000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-00000000000e',repeat('7',64),next_import_id,payload,repeat('8',64),100,derived);
  final_result := public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-00000000000f',repeat('9',64),next_import_id,2);
  if final_result->>'createdCount' <> '1' or final_result->>'draftRevision' <> '3' then raise exception 'new source revision not imported'; end if;
  start_result := public.vtv_import_start('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000015',repeat('1',64),'10000000-0000-4000-8000-000000000016','v3',1);
  next_import_id := (start_result->>'importId')::uuid;
  payload := pg_catalog.jsonb_set(payload, '{artifactId}', '"10000000-0000-4000-8000-000000000016"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{artifactRevision}', '"v3"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{sources,0,resourceRevision}', '"v3"'::jsonb);
  perform public.vtv_import_apply('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000017',repeat('2',64),next_import_id,payload,repeat('3',64),100,derived);
  final_result := public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000018',repeat('4',64),next_import_id,3);
  if final_result->>'createdCount' <> '1' or final_result->>'draftRevision' <> '4' then raise exception 'third source revision not imported'; end if;
  start_result := public.vtv_import_start('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000019',repeat('5',64),'10000000-0000-4000-8000-000000000020','v4',1);
  next_import_id := (start_result->>'importId')::uuid;
  payload := pg_catalog.jsonb_set(payload, '{artifactId}', '"10000000-0000-4000-8000-000000000020"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{artifactRevision}', '"v4"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{sources,0,resourceRevision}', '"v4"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{entries,0,definitionVi}', '"Nội dung chưa xác minh"'::jsonb);
  perform public.vtv_import_apply('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000021',repeat('6',64),next_import_id,payload,repeat('7',64),100,derived);
  final_result := public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000022',repeat('8',64),next_import_id,4);
  if final_result->>'createdCount' <> '1' or final_result->>'draftRevision' <> '5' then raise exception 'unverified candidate not imported'; end if;
  start_result := public.vtv_import_start('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000011',repeat('a',64),'10000000-0000-4000-8000-000000000012','v1',1);
  next_import_id := (start_result->>'importId')::uuid;
  payload := pg_catalog.jsonb_set(payload, '{artifactId}', '"10000000-0000-4000-8000-000000000012"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{artifactRevision}', '"v1"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{sources,0,resourceRevision}', '"v1"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{sources,0,artifactUrl}', '"https://example.invalid/source"'::jsonb);
  payload := pg_catalog.jsonb_set(payload, '{entries,0,original}', '"cám"'::jsonb);
  derived := '[{"normalized":"CÁM","level":3}]'::jsonb;
  begin
    perform public.vtv_import_apply('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000013',repeat('b',64),next_import_id,payload,repeat('c',64),100,derived);
    raise exception 'changed candidate accepted';
  exception when raise_exception then if sqlerrm <> 'IMPORT_CONFLICT' then raise; end if; end;
end; $$;
reset role;
do $$
begin
  if not exists (select 1 from private.vtv_entry_revisions where original = 'mèo' and normalized = 'MÈO' and review = 'pending' and not answer_eligible) then raise exception 'missing pending entry'; end if;
  if not exists (select 1 from private.vtv_entries e join private.vtv_entry_revisions r on r.id = e.current_revision_id where e.supersedes_entry_id is not null and r.review = 'pending' and not r.answer_eligible) then raise exception 'superseding entry missing or approved'; end if;
  if (select count(*) from private.vtv_entries where supersedes_entry_id is not null) <> 2 then raise exception 'lineage head not preserved'; end if;
  if exists (select 1 from private.vtv_editorial_events where configuration->>'attemptLimit' is distinct from '6' or configuration->>'normalizerVersion' is distinct from 'vi-nfc-v2' or previous_draft_revision is null or next_draft_revision is null) then raise exception 'audit configuration snapshot missing'; end if;
  if exists (select 1 from private.vtv_entry_revisions where original = 'cám') or (select revision from private.vtv_draft where id = 1) <> 5 then raise exception 'conflicting import changed data'; end if;
end; $$;
set local role service_role;
do $$
declare
  first_id uuid;
  second_id uuid;
  r jsonb;
  doc jsonb := '{"artifactId":"20000000-0000-4000-8000-000000000011","artifactRevision":"interleaving","chunkIndex":0,"chunkCount":1,"sources":[{"sourceId":"20000000-0000-4000-8000-000000000002","kind":"kaikki","name":"fixture","artifactUrl":"https://example.invalid/source","resourceRevision":"interleaving","artifactSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"entries":[{"sourceId":"20000000-0000-4000-8000-000000000002","externalId":"another","sourceEntryId":"another","sourceSenseId":null,"entryUrl":"https://example.invalid/test","original":"mèo","definitionVi":"Định nghĩa giả lập.","language":"vi","sourceNotes":null}]}'::jsonb;
  derived jsonb := '[{"normalized":"MÈO","level":3}]'::jsonb;
begin
  r := public.vtv_import_start('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000031',repeat('a',64),'20000000-0000-4000-8000-000000000011','interleaving',1);
  first_id := (r->>'importId')::uuid;
  r := public.vtv_import_start('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000032',repeat('b',64),'20000000-0000-4000-8000-000000000012','interleaving',1);
  second_id := (r->>'importId')::uuid;
  r := public.vtv_import_apply('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000033',repeat('c',64),first_id,doc,repeat('d',64),100,derived);
  if r->>'createdCount' <> '1' or r->>'countsProvisional' <> 'true' then raise exception 'first provisional count invalid'; end if;
  doc := pg_catalog.jsonb_set(doc, '{artifactId}', '"20000000-0000-4000-8000-000000000012"'::jsonb);
  r := public.vtv_import_apply('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000034',repeat('e',64),second_id,doc,repeat('f',64),100,derived);
  if r->>'createdCount' <> '1' or r->>'countsProvisional' <> 'true' then raise exception 'second provisional count invalid'; end if;
  perform public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000035',repeat('1',64),first_id,5);
  r := public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000036',repeat('2',64),second_id,6);
  if r->>'createdCount' <> '0' or r->>'noOpCount' <> '1' then raise exception 'final count did not account for interleaving'; end if;
end; $$;
do $$
declare
  import_id uuid;
  r jsonb;
  conflict_detail text;
  doc jsonb := '{"artifactId":"30000000-0000-4000-8000-000000000011","artifactRevision":"cross-test","chunkIndex":0,"chunkCount":2,"sources":[{"sourceId":"20000000-0000-4000-8000-000000000002","kind":"kaikki","name":"first","artifactUrl":"https://example.invalid/source","resourceRevision":"cross-test","artifactSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}],"entries":[{"sourceId":"20000000-0000-4000-8000-000000000002","externalId":"first","sourceEntryId":"first","sourceSenseId":null,"entryUrl":"https://example.invalid/test","original":"mèo","definitionVi":"Định nghĩa giả lập.","language":"vi","sourceNotes":null}]}'::jsonb;
  derived jsonb := '[{"normalized":"MÈO","level":3}]'::jsonb;
begin
  r := public.vtv_import_start('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000031',repeat('a',64),'30000000-0000-4000-8000-000000000011','cross-test',2);
  import_id := (r->>'importId')::uuid;
  perform public.vtv_import_apply('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000032',repeat('b',64),import_id,doc,repeat('c',64),100,derived);
  doc := pg_catalog.jsonb_set(doc, '{chunkIndex}', '1'::jsonb);
  doc := pg_catalog.jsonb_set(doc, '{sources,0,name}', '"second"'::jsonb);
  doc := pg_catalog.jsonb_set(doc, '{entries,0,externalId}', '"second"'::jsonb);
  perform public.vtv_import_apply('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000033',repeat('d',64),import_id,doc,repeat('e',64),100,derived);
  begin
    perform public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000034',repeat('f',64),import_id,7);
    raise exception 'inconsistent source accepted';
  exception when raise_exception then
    if sqlerrm <> 'IMPORT_CONFLICT' then raise; end if;
    get stacked diagnostics conflict_detail = pg_exception_detail;
    if (conflict_detail::jsonb)->>'reason' <> 'SOURCE_METADATA_MISMATCH' or (conflict_detail::jsonb)->>'chunkIndex' <> '0' then raise exception 'source conflict location missing'; end if;
  end;
  r := public.vtv_import_start('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000035',repeat('1',64),'30000000-0000-4000-8000-000000000012','cross-test',2);
  import_id := (r->>'importId')::uuid;
  doc := pg_catalog.jsonb_set(doc, '{artifactId}', '"30000000-0000-4000-8000-000000000012"'::jsonb);
  doc := pg_catalog.jsonb_set(doc, '{chunkIndex}', '0'::jsonb);
  doc := pg_catalog.jsonb_set(doc, '{sources,0,name}', '"first"'::jsonb);
  doc := pg_catalog.jsonb_set(doc, '{entries,0,externalId}', '"first"'::jsonb);
  perform public.vtv_import_apply('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000036',repeat('2',64),import_id,doc,repeat('3',64),100,derived);
  doc := pg_catalog.jsonb_set(doc, '{chunkIndex}', '1'::jsonb);
  perform public.vtv_import_apply('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000037',repeat('4',64),import_id,doc,repeat('5',64),100,derived);
  begin
    perform public.vtv_import_finalize('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000038',repeat('6',64),import_id,7);
    raise exception 'duplicate candidate accepted';
  exception when raise_exception then
    if sqlerrm <> 'IMPORT_CONFLICT' then raise; end if;
    get stacked diagnostics conflict_detail = pg_exception_detail;
    if (conflict_detail::jsonb)->>'reason' <> 'DUPLICATE_IDENTITY' or (conflict_detail::jsonb)->>'chunkIndex' <> '0' or (conflict_detail::jsonb)->>'entryIndex' <> '0' then raise exception 'duplicate conflict location missing'; end if;
  end;
end; $$;
rollback;
