-- Reuse verified staged rows at finalization. The locked draft, source checks,
-- idempotency receipt and audit event remain part of the same transaction.
create or replace function public.vtv_import_finalize(
  p_request_id uuid, p_idempotency_key uuid, p_request_hash text,
  p_import_id uuid, p_expected_draft_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing private.vtv_requests%rowtype;
  imported private.vtv_imports%rowtype;
  draft private.vtv_draft%rowtype;
  chunk private.vtv_import_chunks%rowtype;
  source_item jsonb;
  source_ids jsonb;
  entry_source_id uuid;
  staged record;
  entry_item jsonb;
  derived jsonb;
  source_row private.vtv_sources%rowtype;
  previous private.vtv_entries%rowtype;
  new_entry_id uuid;
  new_revision_id uuid;
  supersedes uuid;
  source_count integer;
  inserted_count integer;
  conflict_chunk integer;
  conflict_entry integer;
  conflict_reason text;
  created_count integer := 0;
  noop_count integer := 0;
  result jsonb;
  event_id uuid;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash !~ '^[0-9a-f]{64}$' or p_import_id is null or p_expected_draft_revision < 0 then raise exception 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vtv-finalize:' || p_idempotency_key::text, 0));
  select * into existing from private.vtv_requests where operation = 'import-finalize' and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.result;
  end if;
  select * into draft from private.vtv_draft where id = 1 for update;
  if draft.revision <> p_expected_draft_revision then raise exception 'REVISION_CONFLICT'; end if;
  select * into imported from private.vtv_imports where id = p_import_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if imported.status <> 'staging' then raise exception using message = 'IMPORT_CONFLICT', detail = 'IMPORT_NOT_STAGING'; end if;
  if (select count(*) from private.vtv_import_chunks where import_id = p_import_id) <> imported.expected_chunks then
    select position into conflict_chunk from pg_catalog.generate_series(0, imported.expected_chunks - 1) position where not exists (select 1 from private.vtv_import_chunks c where c.import_id = p_import_id and c.chunk_index = position) order by position limit 1;
    raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'MISSING_CHUNKS', 'chunkIndex', conflict_chunk)::text;
  end if;
  if exists (
    select 1
    from private.vtv_import_chunks c
    left join lateral (
      select count(*) as candidate_count
      from private.vtv_staged_candidates sc
      where sc.import_id = c.import_id and sc.chunk_index = c.chunk_index
    ) staged_count on true
    where c.import_id = p_import_id and staged_count.candidate_count <> c.entry_count
  ) then
    raise exception using message = 'IMPORT_CONFLICT', detail = 'MISSING_CHUNKS';
  end if;
  select min(first_chunk) into conflict_chunk from (
      select s.value->>'sourceId' source_id, min(c.chunk_index) first_chunk, count(distinct (s.value - 'sourceId')) metadata_count
      from private.vtv_import_chunks c cross join lateral pg_catalog.jsonb_array_elements(c.payload->'sources') s(value)
      where c.import_id = p_import_id group by s.value->>'sourceId'
    ) inconsistent where metadata_count > 1;
  if conflict_chunk is not null then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'SOURCE_METADATA_MISMATCH', 'chunkIndex', conflict_chunk)::text; end if;
  select min(first_chunk) into conflict_chunk from (
      select s.value->>'kind' kind, s.value->>'resourceRevision' revision, s.value->>'artifactSha256' digest,
        min(c.chunk_index) first_chunk, count(distinct (s.value - 'sourceId')) metadata_count
      from private.vtv_import_chunks c cross join lateral pg_catalog.jsonb_array_elements(c.payload->'sources') s(value)
      where c.import_id = p_import_id group by 1, 2, 3
    ) inconsistent where metadata_count > 1;
  if conflict_chunk is not null then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'SOURCE_METADATA_MISMATCH', 'chunkIndex', conflict_chunk)::text; end if;
  with chunk_sources as materialized (
    select c.chunk_index, s.value
    from private.vtv_import_chunks c
    cross join lateral pg_catalog.jsonb_array_elements(c.payload->'sources') s(value)
    where c.import_id = p_import_id
  )
  select first_chunk, first_entry into conflict_chunk, conflict_entry from (
      select s.value->>'kind' kind, s.value->>'resourceRevision' revision, s.value->>'artifactSha256' digest, e.candidate->>'externalId' external_id,
        (pg_catalog.array_agg(e.chunk_index order by e.chunk_index, e.entry_index))[1] first_chunk,
        (pg_catalog.array_agg(e.entry_index order by e.chunk_index, e.entry_index))[1] first_entry
      from private.vtv_staged_candidates e
      join chunk_sources s on s.chunk_index = e.chunk_index and s.value->>'sourceId' = e.candidate->>'sourceId'
      where e.import_id = p_import_id
      group by 1, 2, 3, 4 having count(*) > 1
    ) duplicate_identity order by first_chunk, first_entry limit 1;
  if conflict_chunk is not null then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'DUPLICATE_IDENTITY', 'chunkIndex', conflict_chunk, 'entryIndex', conflict_entry)::text; end if;

  for chunk in select * from private.vtv_import_chunks where import_id = p_import_id order by chunk_index loop
    source_ids := '{}'::jsonb;
    for source_item in select value from pg_catalog.jsonb_array_elements(chunk.payload->'sources') loop
      insert into private.vtv_sources(kind, resource_revision, artifact_sha256, metadata)
      values (source_item->>'kind', source_item->>'resourceRevision', source_item->>'artifactSha256', source_item - 'sourceId')
      on conflict (kind, resource_revision, artifact_sha256) do nothing;
      select * into source_row from private.vtv_sources where kind = source_item->>'kind' and resource_revision = source_item->>'resourceRevision' and artifact_sha256 = source_item->>'artifactSha256';
      if source_row.metadata <> source_item - 'sourceId' then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'SOURCE_METADATA_MISMATCH', 'chunkIndex', chunk.chunk_index)::text; end if;
      source_ids := source_ids || pg_catalog.jsonb_build_object(source_item->>'sourceId', source_row.id);
    end loop;
    select sc.entry_index, case when e.id is null then 'SOURCE_REFERENCE' else 'CANDIDATE_CONTENT_MISMATCH' end
      into conflict_entry, conflict_reason
      from private.vtv_staged_candidates sc
      left join private.vtv_entries e on e.source_id = (source_ids->>(sc.candidate->>'sourceId'))::uuid
        and e.external_id = sc.candidate->>'externalId'
      where sc.import_id = p_import_id and sc.chunk_index = chunk.chunk_index
        and ((source_ids->>(sc.candidate->>'sourceId')) is null or e.source_payload <> sc.candidate - 'sourceId')
      order by sc.entry_index limit 1;
    if found then
      raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object(
        'reason', conflict_reason, 'chunkIndex', chunk.chunk_index, 'entryIndex', conflict_entry)::text;
    end if;

    -- Imports with revision-local source IDs cannot carry a lineage attestation.
    -- Insert these verified candidates and their first revisions in batches.
    with candidates as materialized (
      select gen_random_uuid() as entry_id, gen_random_uuid() as revision_id,
        (source_ids->>(sc.candidate->>'sourceId'))::uuid as source_id, sc.candidate, sc.derived
      from private.vtv_staged_candidates sc
      where sc.import_id = p_import_id and sc.chunk_index = chunk.chunk_index
        and (sc.candidate->>'sourceEntryId' like 'stable:%' and sc.candidate->>'sourceSenseId' like 'stable:%') is not true
    ), new_entries as (
      insert into private.vtv_entries(id,source_id,external_id,source_entry_id,source_sense_id,entry_url,source_payload,import_id,current_revision_id)
      select c.entry_id,c.source_id,c.candidate->>'externalId',c.candidate->>'sourceEntryId',c.candidate->>'sourceSenseId',
        c.candidate->>'entryUrl',c.candidate-'sourceId',p_import_id,c.revision_id
      from candidates c
      on conflict (source_id,external_id) do nothing
      returning id
    )
    insert into private.vtv_entry_revisions(id,entry_id,revision_number,original,normalized,level,definition_vi,review,answer_eligible,actor_role)
    select c.revision_id,c.entry_id,1,c.candidate->>'original',c.derived->>'normalized',(c.derived->>'level')::integer,
      c.candidate->>'definitionVi','pending',false,'import'
    from candidates c join new_entries e on e.id = c.entry_id;
    get diagnostics inserted_count = row_count;
    created_count := created_count + inserted_count;
    -- Only stable identifiers can link to a prior finalized entry.
    for staged in
      select sc.candidate, sc.derived as normalized_entry, sc.entry_index
      from private.vtv_staged_candidates sc
      where sc.import_id = p_import_id and sc.chunk_index = chunk.chunk_index
        and sc.candidate->>'sourceEntryId' like 'stable:%' and sc.candidate->>'sourceSenseId' like 'stable:%'
      order by sc.entry_index
    loop
      entry_item := staged.candidate;
      derived := staged.normalized_entry;
      entry_source_id := (source_ids->>(entry_item->>'sourceId'))::uuid;
      if entry_source_id is null then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'SOURCE_REFERENCE', 'chunkIndex', chunk.chunk_index, 'entryIndex', staged.entry_index)::text; end if;
      select * into previous from private.vtv_entries where source_id = entry_source_id and external_id = entry_item->>'externalId';
      if found then
        if previous.source_payload <> entry_item - 'sourceId' then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'CANDIDATE_CONTENT_MISMATCH', 'chunkIndex', chunk.chunk_index, 'entryIndex', staged.entry_index)::text; end if;
        continue;
      end if;
      supersedes := null;
      if entry_item->>'sourceEntryId' like 'stable:%' and entry_item->>'sourceSenseId' like 'stable:%' then
        select * into source_row from private.vtv_sources where id = entry_source_id;
        select count(*) into source_count from private.vtv_entries e join private.vtv_sources s on s.id = e.source_id join private.vtv_imports imp on imp.id = e.import_id
        where s.kind = source_row.kind and imp.status = 'finalized'
          and exists (select 1 from private.vtv_source_lineage_attestations current_attestation join private.vtv_source_lineage_attestations prior_attestation on prior_attestation.lineage_id = current_attestation.lineage_id where current_attestation.kind = source_row.kind and current_attestation.resource_revision = source_row.resource_revision and current_attestation.artifact_sha256 = source_row.artifact_sha256 and prior_attestation.kind = s.kind and prior_attestation.resource_revision = s.resource_revision and prior_attestation.artifact_sha256 = s.artifact_sha256 and current_attestation.source_entry_id = entry_item->>'sourceEntryId' and current_attestation.source_sense_id = entry_item->>'sourceSenseId' and current_attestation.candidate_payload = entry_item - 'sourceId' and prior_attestation.source_entry_id = e.source_entry_id and prior_attestation.source_sense_id = e.source_sense_id and prior_attestation.candidate_payload = e.source_payload)
          and e.source_entry_id = entry_item->>'sourceEntryId' and e.source_sense_id = entry_item->>'sourceSenseId'
          and not exists (select 1 from private.vtv_entries successor join private.vtv_imports successor_import on successor_import.id = successor.import_id where successor.supersedes_entry_id = e.id and successor_import.status = 'finalized');
        if source_count = 1 then
          select e.id into supersedes from private.vtv_entries e join private.vtv_sources s on s.id = e.source_id join private.vtv_imports imp on imp.id = e.import_id
          where s.kind = source_row.kind and imp.status = 'finalized'
            and exists (select 1 from private.vtv_source_lineage_attestations current_attestation join private.vtv_source_lineage_attestations prior_attestation on prior_attestation.lineage_id = current_attestation.lineage_id where current_attestation.kind = source_row.kind and current_attestation.resource_revision = source_row.resource_revision and current_attestation.artifact_sha256 = source_row.artifact_sha256 and prior_attestation.kind = s.kind and prior_attestation.resource_revision = s.resource_revision and prior_attestation.artifact_sha256 = s.artifact_sha256 and current_attestation.source_entry_id = entry_item->>'sourceEntryId' and current_attestation.source_sense_id = entry_item->>'sourceSenseId' and current_attestation.candidate_payload = entry_item - 'sourceId' and prior_attestation.source_entry_id = e.source_entry_id and prior_attestation.source_sense_id = e.source_sense_id and prior_attestation.candidate_payload = e.source_payload)
            and e.source_entry_id = entry_item->>'sourceEntryId' and e.source_sense_id = entry_item->>'sourceSenseId'
            and not exists (select 1 from private.vtv_entries successor join private.vtv_imports successor_import on successor_import.id = successor.import_id where successor.supersedes_entry_id = e.id and successor_import.status = 'finalized');
        end if;
      end if;
      new_entry_id := gen_random_uuid();
      new_revision_id := gen_random_uuid();
      insert into private.vtv_entries(id, source_id, external_id, source_entry_id, source_sense_id, entry_url, source_payload, import_id, supersedes_entry_id, current_revision_id)
      values (new_entry_id, entry_source_id, entry_item->>'externalId', entry_item->>'sourceEntryId', entry_item->>'sourceSenseId', entry_item->>'entryUrl', entry_item - 'sourceId', p_import_id, supersedes, new_revision_id);
      insert into private.vtv_entry_revisions(id, entry_id, revision_number, original, normalized, level, definition_vi, review, answer_eligible, actor_role)
      values (new_revision_id, new_entry_id, 1, entry_item->>'original', derived->>'normalized', (derived->>'level')::integer, entry_item->>'definitionVi', 'pending', false, 'import');
      created_count := created_count + 1;
    end loop;
  end loop;
  noop_count := imported.total_entries - created_count;
  update private.vtv_imports set status = 'finalized', finalized_at = pg_catalog.now() where id = p_import_id;
  update private.vtv_draft set revision = revision + 1, updated_at = pg_catalog.now() where id = 1 returning * into draft;
  result := pg_catalog.jsonb_build_object('importId', p_import_id, 'status', 'finalized', 'createdCount', created_count, 'noOpCount', noop_count, 'draftRevision', draft.revision::text);
  insert into private.vtv_editorial_events(operation, request_id, actor_role, previous_draft_revision, next_draft_revision, input, output, configuration)
  values ('import-finalize', p_request_id, 'admin', p_expected_draft_revision, draft.revision, pg_catalog.jsonb_build_object('importId', p_import_id, 'expectedDraftRevision', p_expected_draft_revision::text), result,
    pg_catalog.jsonb_build_object('configurationId', draft.configuration_id, 'draftRevision', draft.revision::text, 'attemptLimit', draft.attempt_limit, 'normalizerVersion', draft.normalizer_version)) returning id into event_id;
  insert into private.vtv_requests(operation, idempotency_key, request_hash, result, event_id) values ('import-finalize', p_idempotency_key, p_request_hash, result, event_id);
  return result;
end; $$;
