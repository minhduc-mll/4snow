create or replace function private.vtv_build_document(p_release_id uuid) returns jsonb language plpgsql set search_path='' as $$
declare payload jsonb; errors jsonb := '[]'; refs jsonb; levels jsonb := '{}'; n integer; item record; attrs jsonb; guesses jsonb; answers jsonb; coverage jsonb := '{}';
begin
  for item in select c.*, rr.decision from private.vtv_current_candidates c
    left join lateral (select decision from private.vtv_rights_reviews where source_id=c.source_id order by draft_revision desc limit 1) rr on true
    where c.review='approved' loop
    if item.accepted_guess is distinct from true or (item.answer_eligible and item.eligible is distinct from true) then errors:=errors||jsonb_build_array(jsonb_build_object('code','INVALID_ELIGIBILITY','id',item.entry_id)); end if;
    if item.decision is distinct from 'cleared' then errors:=errors||jsonb_build_array(jsonb_build_object('code','RIGHTS_UNRESOLVED','id',item.source_id)); end if;
    if item.normalized<>private.vtv_spelling(item.original) or char_length(item.normalized)<>item.level then errors:=errors||jsonb_build_array(jsonb_build_object('code','INVALID_SPELLING','id',item.entry_id)); end if;
  end loop;
  for item in select * from private.vtv_answer_projection where unresolved loop errors:=errors||jsonb_build_array(jsonb_build_object('code','UNRESOLVED_COLLISION','normalized',item.normalized)); end loop;
  -- Keep exact entry attribution for displayed definitions. Guess-only
  -- spellings share an attribution for their immutable source and import.
  with selected_answers as materialized (
    select answer_revision_id
    from private.vtv_answer_projection
    where not unresolved and answer_revision_id is not null
  ), credits as (
    select e.id,e.source_id,e.import_id,e.source_entry_id,e.source_sense_id,e.entry_url
    from selected_answers a
    join private.vtv_current_candidates c on c.id=a.answer_revision_id
    join private.vtv_entries e on e.id=c.entry_id
    union all
    select md5(e.source_id::text||e.import_id::text)::uuid as id,
      e.source_id,e.import_id,'artifact'::text,null::text,null::text
    from private.vtv_current_candidates c
    join private.vtv_entries e on e.id=c.entry_id
    left join selected_answers a on a.answer_revision_id=c.id
    where c.accepted_guess and a.answer_revision_id is null
    group by e.source_id,e.import_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',credit.id,'sourceName',s.metadata->>'name','sourceEntryId',credit.source_entry_id,
    'sourceSenseId',credit.source_sense_id,'entryUrl',coalesce(credit.entry_url,s.metadata->>'artifactUrl'),
    'artifactUrl',s.metadata->>'artifactUrl','artifactSha256',s.artifact_sha256,
    'resourceRevision',s.resource_revision,'artifactRevision',i.artifact_revision,
    'licenseName',s.metadata->'rights'->>'licenseName','licenseVersion',s.metadata->'rights'->>'licenseVersion',
    'licenseUrl',s.metadata->'rights'->>'licenseUrl','attributionText',s.metadata->'rights'->>'attributionText',
    'historyUrl',s.metadata->'rights'->>'historyUrl','modificationsNotice',s.metadata->'rights'->>'modificationsNotice'
  ) order by credit.id),'[]'::jsonb)
  into attrs
  from credits credit
  join private.vtv_sources s on s.id=credit.source_id
  join private.vtv_imports i on i.id=credit.import_id;
  foreach n in array array[3,5,7,9] loop
    select coalesce(jsonb_agg(normalized order by normalized collate "C"),'[]'::jsonb) into guesses from (select distinct normalized from private.vtv_current_candidates where level=n and accepted_guess) g;
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'original',c.original,'normalized',c.normalized,'level',c.level,'definitionVi',c.definition_vi,'attributionIds',jsonb_build_array(c.entry_id)) order by c.normalized collate "C"),'[]'::jsonb) into answers
      from private.vtv_answer_projection p join private.vtv_current_candidates c on c.id=p.answer_revision_id where p.level=n and not p.unresolved;
    levels:=levels||jsonb_build_object(n::text,jsonb_build_object('guesses',guesses,'answers',answers));
    coverage:=coverage||jsonb_build_object(n::text,jsonb_build_object('guesses',jsonb_array_length(guesses),'answers',jsonb_array_length(answers)));
  end loop;
  select jsonb_build_object('schemaVersion',1,'normalizerVersion',normalizer_version,'releaseId',p_release_id,'configurationId',configuration_id,'attemptLimit',attempt_limit,'levels',levels,'attributions',attrs) into payload from private.vtv_draft where id=1;
  errors:=errors||private.vtv_release_errors(payload);
  select coalesce(jsonb_agg(jsonb_build_object('entryId',e.id,'revisionId',c.id,'sourceId',e.source_id,'importId',e.import_id,'rightsReviewId',rr.id) order by e.id),'[]'::jsonb) into refs
    from private.vtv_current_candidates c join private.vtv_entries e on e.id=c.entry_id
    left join lateral (select id from private.vtv_rights_reviews where source_id=e.source_id order by draft_revision desc limit 1) rr on true where c.review='approved';
  return jsonb_build_object('payload',payload,'errors',errors,'coverage',coverage,'inputReferences',refs);
end; $$;
