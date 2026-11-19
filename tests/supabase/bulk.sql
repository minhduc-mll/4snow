begin;

insert into private.vtv_sources(id,kind,resource_revision,artifact_sha256,metadata) values
  ('10000000-0000-4000-8000-000000000001','kaikki','synthetic',repeat('a',64),'{"name":"Cleared synthetic source"}'),
  ('10000000-0000-4000-8000-000000000002','kaikki','synthetic',repeat('b',64),'{"name":"Uncleared synthetic source"}');
insert into private.vtv_rights_reviews(source_id,decision,evidence,obligations,draft_revision,actor_role)
  values('10000000-0000-4000-8000-000000000001','cleared','Synthetic fixture evidence','Synthetic fixture obligations',0,'admin');
insert into private.vtv_imports(id,artifact_id,artifact_revision,expected_chunks,status,finalized_at)
  values('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','v1',1,'finalized',now());

insert into private.vtv_entries(id,source_id,external_id,source_entry_id,entry_url,source_payload,import_id,current_revision_id)
  select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
    ('10000000-0000-4000-8000-'||lpad(case when n=2 then '2' else '1' end,12,'0'))::uuid,
    n::text,n::text,'https://example.invalid/'||n,'{}','20000000-0000-4000-8000-000000000001',
    ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
  from generate_series(1,101) n;
insert into private.vtv_entry_revisions(id,entry_id,revision_number,original,normalized,level,definition_vi,actor_role)
  select current_revision_id,id,1,'mèo','MÈO',3,case when external_id='3' then 'Cách dùng cổ.' when external_id='4' then null else 'Một con vật.' end,'import'
  from private.vtv_entries;

do $$
begin
  if has_function_privilege('anon','public.vtv_bulk_create(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.vtv_bulk_page(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.vtv_bulk_apply(jsonb,uuid,uuid,text)','EXECUTE')
    or has_table_privilege('anon','private.vtv_bulk_targets','SELECT')
  then raise exception 'Browser role can access bulk review directly'; end if;
end $$;

set local role service_role;
do $$
declare
  sample jsonb;
  list_page jsonb;
  filters jsonb;
  next_page jsonb;
  body jsonb;
  receipt jsonb;
  entry_id uuid := '30000000-0000-4000-8000-000000000001';
  key uuid := gen_random_uuid();
  selection_id uuid;
  starting_filters jsonb := '{"sourceId":null,"level":3,"review":"pending","hasDefinition":null,"collisionsOnly":false}';
begin
  foreach filters in array array[
    starting_filters,
    starting_filters || '{"sourceId":"10000000-0000-4000-8000-000000000002","hasDefinition":true,"collisionsOnly":true}'::jsonb,
    starting_filters || '{"hasDefinition":false}'::jsonb
  ] loop
    list_page := public.vtv_list_candidates(filters,null,null,100);
    sample := public.vtv_bulk_create(jsonb_build_object('filters',filters,'expectedDraftRevision','0','targets',null));
    if (select jsonb_agg(value->>'id' order by value->>'id') from jsonb_array_elements(list_page->'items'))
       is distinct from (select jsonb_agg(value->>'entryId' order by value->>'entryId') from jsonb_array_elements(sample->'items'))
      then raise exception 'Frozen set diverged from filtered list for %',filters; end if;
  end loop;
  sample := public.vtv_bulk_create(jsonb_build_object('filters',starting_filters,'expectedDraftRevision','0','targets',null));
  selection_id := (sample->>'selectionId')::uuid;
  if (sample->>'count')::integer<>101 or jsonb_array_length(sample->'items')<>100
    or sample->'items'->1->>'blocker' is distinct from 'source-rights'
    or sample->'items'->2->>'answerBlocker' is distinct from 'meaning-warning'
    or sample->'items'->3->>'answerBlocker' is distinct from 'missing-meaning'
    or sample->'items'->0->>'answerBlocker' is distinct from 'answer-collision'
    then raise exception 'Unexpected frozen set or blockers %',sample->'items'->0; end if;
  body := jsonb_build_object(
    'selectionId',selection_id,'selectionHash',sample->>'selectionHash','batchId',gen_random_uuid(),
    'expectedDraftRevision','0','offset',0,'category','common','answerEligible',false,'rationale','Synthetic fixture review',
    'exclusionChecks','{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}'::jsonb,
    'targets',(select jsonb_agg(jsonb_build_object('entryId',r->'entryId','expectedEntryRevision',r->'expectedEntryRevision') order by pos) from jsonb_array_elements(sample->'items') with ordinality e(r,pos))
  );
  begin
    perform public.vtv_bulk_apply(jsonb_set(body,'{targets}',(body->'targets')-0),gen_random_uuid(),key,repeat('c',64));
    raise exception 'Accepted incomplete batch';
  exception when raise_exception then if sqlerrm<>'INVALID_INPUT' then raise; end if; end;
  receipt := public.vtv_bulk_apply(body,gen_random_uuid(),key,repeat('c',64));
  if (receipt->>'checkpoint')::integer<>100 or receipt->'items'->1->>'status' is distinct from 'invalid'
    or receipt->'items'->2->>'status' is distinct from 'invalid' or receipt->'items'->3->>'status' is distinct from 'applied'
    or public.vtv_bulk_apply(body,gen_random_uuid(),key,repeat('c',64))<>receipt
    then raise exception 'Unexpected batch result or retry'; end if;
  begin
    perform public.vtv_bulk_apply(jsonb_set(body,'{rationale}','"Different reason"'),gen_random_uuid(),key,repeat('d',64));
    raise exception 'Accepted conflicting idempotency key';
  exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
  if not (public.vtv_candidate_history(entry_id,null,null,50)->'items' @> jsonb_build_array(jsonb_build_object('revisionNumber',2,'bulkBatchId',receipt->>'batchId')))
    then raise exception 'Revision history lost batch ID'; end if;
  next_page := public.vtv_bulk_page(jsonb_build_object('selectionId',selection_id,'offset',100));
  if (next_page->>'checkpoint')::integer<>100 or jsonb_array_length(next_page->'items')<>1 or (next_page->'totals'->>'applied')::integer<>98
    then raise exception 'Resume checkpoint or totals did not match recorded receipt'; end if;
  perform public.vtv_review_rights(gen_random_uuid(),gen_random_uuid(),repeat('e',64),
    jsonb_build_object('sourceId','10000000-0000-4000-8000-000000000001','expectedDraftRevision','1','decision','cleared','evidence','New review','obligations','Test'));
  begin
    perform public.vtv_bulk_apply(body||jsonb_build_object(
      'batchId',gen_random_uuid(),'offset',100,'expectedDraftRevision',next_page->>'draftRevision',
      'targets',jsonb_build_array(jsonb_build_object('entryId',next_page->'items'->0->'entryId','expectedEntryRevision',next_page->'items'->0->'expectedEntryRevision'))
    ),gen_random_uuid(),gen_random_uuid(),repeat('f',64));
    raise exception 'Accepted stale selection after rights changed';
  exception when raise_exception then if sqlerrm<>'REVISION_CONFLICT' then raise; end if; end;
  if public.vtv_bulk_apply(body,gen_random_uuid(),key,repeat('c',64))<>receipt then raise exception 'Stale draft prevented receipt recovery'; end if;
end $$;

reset role;
set constraints all immediate;
do $$
begin
  if (select count(*) from private.vtv_bulk_batches)<>1 or (select count(*) from private.vtv_editorial_events where operation='bulk-review')<>100
    or (select count(*) from private.vtv_entry_revisions where bulk_batch_id is not null)<>98
  then raise exception 'Audit or revisions not consistent with batch receipts'; end if;
end $$;
rollback;
