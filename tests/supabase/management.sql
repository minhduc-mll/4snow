begin;

do $$
declare
  internal_id uuid := gen_random_uuid();
  external_id uuid := gen_random_uuid();
  key uuid := gen_random_uuid();
  hash text := repeat('a',64);
  input jsonb;
  created jsonb;
  changed jsonb;
  page jsonb;
  entry uuid;
  filters jsonb := '{"review":"withdrawn","spelling":"ỌAM"}';
begin
  if has_function_privilege('anon','public.vtv_create_candidate(uuid,uuid,text,jsonb,text,integer)','execute')
    or has_function_privilege('authenticated','public.vtv_candidate_sources(timestamptz,uuid)','execute')
    or has_function_privilege('authenticated','public.vtv_review_candidate(uuid,uuid,text,jsonb,text,integer)','execute')
    then raise exception 'Browser roles can call trusted RPCs'; end if;

  insert into private.vtv_sources(id,kind,resource_revision,artifact_sha256,metadata)
  values
    (internal_id,'internal-editorial','manual-test',repeat('b',64),'{"name":"Synthetic internal source","artifactUrl":"https://example.com/internal"}'),
    (external_id,'kaikki','manual-test',repeat('c',64),'{"name":"Synthetic external source","artifactUrl":"https://example.com/external"}');

  input := jsonb_build_object('original','họa mi','definitionVi',null,'sourceId',internal_id,'entryUrl',null,
    'sourceEntryId',null,'sourceSenseId',null,'allowAlternateMeaning',false,
    'expectedDraftRevision',(select revision::text from private.vtv_draft where id=1));
  if public.vtv_candidate_sources(null,null)->'items' @> jsonb_build_array(jsonb_build_object('id',internal_id)) then
    raise exception 'Uncleared internal source was offered'; end if;
  begin
    perform public.vtv_create_candidate(gen_random_uuid(),key,hash,input,'HỌAMI',5);
    raise exception 'Expected an internal source clearance error';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;
  begin
    perform public.vtv_create_candidate(gen_random_uuid(),key,hash,input||jsonb_build_object('sourceId',external_id),'HỌAMI',5);
    raise exception 'Expected an external provenance error';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;

  changed := public.vtv_review_rights(gen_random_uuid(),gen_random_uuid(),hash,
    jsonb_build_object('sourceId',internal_id,'decision','cleared','evidence','Synthetic evaluation only',
      'obligations','Use only in this rolled-back test','expectedDraftRevision',input->>'expectedDraftRevision'));
  input := input || jsonb_build_object('expectedDraftRevision',changed->>'draftRevision');
  if not (public.vtv_candidate_sources(null,null)->'items' @> jsonb_build_array(jsonb_build_object('id',internal_id))) then
    raise exception 'Cleared internal source was missing'; end if;

  created := public.vtv_create_candidate(gen_random_uuid(),key,hash,input,'HỌAMI',5);
  entry := (created->>'entryId')::uuid;
  if created->>'review' <> 'pending' or created->>'revisionNumber' <> '1'
    or created is distinct from public.vtv_create_candidate(gen_random_uuid(),key,hash,input,'HỌAMI',5)
    then raise exception 'Manual entry must start pending and retries must replay its receipt'; end if;

  input := input || jsonb_build_object('expectedDraftRevision',created->>'draftRevision');
  begin
    perform public.vtv_create_candidate(gen_random_uuid(),gen_random_uuid(),hash,input,'HỌAMI',5);
    raise exception 'Expected a duplicate spelling error';
  exception when raise_exception then
    if sqlerrm <> 'SPELLING_EXISTS' then raise; end if;
  end;
  changed := public.vtv_create_candidate(gen_random_uuid(),gen_random_uuid(),hash,input||
    '{"allowAlternateMeaning":true,"definitionVi":"Một nghĩa khác dùng trong phép thử."}'::jsonb,'HỌAMI',5);
  if changed->>'entryId' = entry::text then raise exception 'Different meaning reused the existing entry'; end if;

  input := jsonb_build_object('entryId',entry,'expectedEntryRevision',1,'expectedDraftRevision',changed->>'draftRevision',
    'original','họa mi','definitionVi',null,'review','withdrawn','answerEligible',false,'category','common','rationale','',
    'exclusionChecks','{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}'::jsonb);
  changed := public.vtv_review_candidate(gen_random_uuid(),gen_random_uuid(),hash,input,'HỌAMI',5);
  if changed->>'review' <> 'withdrawn' then raise exception 'Expected withdrawn entry'; end if;
  page := public.vtv_list_candidates(filters,null,null,50);
  if not (page->'items' @> jsonb_build_array(jsonb_build_object('id',entry,'review','withdrawn'))) then
    raise exception 'Withdrawn entry could not be found by spelling and status'; end if;
  input := input || jsonb_build_object('expectedEntryRevision',2,'expectedDraftRevision',changed->>'draftRevision');
  begin
    perform public.vtv_review_candidate(gen_random_uuid(),gen_random_uuid(),hash,input||
      '{"review":"approved","rationale":"Review evidence."}'::jsonb,'HỌAMI',5);
    raise exception 'Expected direct withdrawn-to-approved rejection';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_INPUT' then raise; end if;
  end;
  changed := public.vtv_review_candidate(gen_random_uuid(),gen_random_uuid(),hash,input||'{"review":"pending"}'::jsonb,'HỌAMI',5);
  if changed->>'review' <> 'pending' or changed->>'revisionNumber' <> '3' then
    raise exception 'Restoration requires pending status and a new revision'; end if;

  page := public.vtv_candidate_history(entry,null,null,50);
  if jsonb_array_length(page->'items') <> 3 or not (page->'items' @> '[{"revisionNumber":2,"review":"withdrawn"}]') then
    raise exception 'Editorial history was lost'; end if;
end $$;

rollback;
