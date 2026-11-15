-- Private import storage. No browser role receives direct access.
create table private.vtv_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('kaikki', 'underthesea-resource')),
  resource_revision text not null check (char_length(resource_revision) between 1 and 200),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (kind, resource_revision, artifact_sha256)
);

-- Written only by a future trusted lineage review, never by imports.
create table private.vtv_source_lineage_attestations (
  kind text not null check (kind in ('kaikki', 'underthesea-resource')),
  resource_revision text not null check (char_length(resource_revision) between 1 and 200),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  source_entry_id text not null check (char_length(source_entry_id) between 1 and 300),
  source_sense_id text not null check (char_length(source_sense_id) between 1 and 300),
  candidate_payload jsonb not null check (jsonb_typeof(candidate_payload) = 'object'),
  lineage_id uuid not null,
  evidence text not null check (char_length(evidence) between 1 and 4000),
  verified_at timestamptz not null default now(),
  primary key (kind, resource_revision, artifact_sha256, source_entry_id, source_sense_id)
);

create table private.vtv_imports (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null,
  artifact_revision text not null check (char_length(artifact_revision) between 1 and 128),
  schema_version integer not null default 1 check (schema_version = 1),
  normalizer_version text not null default 'vi-nfc-v2' check (normalizer_version = 'vi-nfc-v2'),
  expected_chunks integer not null check (expected_chunks between 1 and 100),
  status text not null default 'staging' check (status in ('staging', 'finalized', 'failed')),
  total_bytes integer not null default 0 check (total_bytes between 0 and 52428800),
  total_entries integer not null default 0 check (total_entries between 0 and 20000),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (artifact_id, artifact_revision),
  check ((status = 'finalized') = (finalized_at is not null))
);

create table private.vtv_import_chunks (
  import_id uuid not null references private.vtv_imports(id) on delete restrict,
  chunk_index integer not null check (chunk_index between 0 and 99),
  canonical_hash text not null check (canonical_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  byte_count integer not null check (byte_count between 1 and 524288),
  entry_count integer not null check (entry_count between 0 and 200),
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default now(),
  primary key (import_id, chunk_index)
);

create table private.vtv_staged_candidates (
  import_id uuid not null,
  chunk_index integer not null,
  entry_index integer not null check (entry_index between 0 and 199),
  candidate jsonb not null check (jsonb_typeof(candidate) = 'object'),
  derived jsonb not null check (jsonb_typeof(derived) = 'object'),
  was_noop boolean not null,
  created_at timestamptz not null default now(),
  primary key (import_id, chunk_index, entry_index),
  foreign key (import_id, chunk_index) references private.vtv_import_chunks(import_id, chunk_index) on delete restrict
);

create table private.vtv_entries (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references private.vtv_sources(id) on delete restrict,
  external_id text not null check (char_length(external_id) between 1 and 200),
  source_entry_id text not null check (char_length(source_entry_id) <= 300),
  source_sense_id text check (char_length(source_sense_id) <= 300),
  entry_url text not null check (entry_url ~ '^https://'),
  source_payload jsonb not null check (jsonb_typeof(source_payload) = 'object'),
  import_id uuid not null references private.vtv_imports(id) on delete restrict,
  supersedes_entry_id uuid references private.vtv_entries(id) on delete restrict,
  current_revision_id uuid not null,
  created_at timestamptz not null default now(),
  unique (source_id, external_id)
);

create table private.vtv_entry_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references private.vtv_entries(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  previous_revision_id uuid references private.vtv_entry_revisions(id) on delete restrict,
  original text not null check (char_length(original) between 1 and 120),
  normalized text not null check (char_length(normalized) in (3, 5, 7, 9)),
  level integer not null check (level in (3, 5, 7, 9) and level = char_length(normalized)),
  definition_vi text check (definition_vi is null or char_length(definition_vi) between 1 and 2000),
  review text not null default 'pending' check (review in ('pending', 'approved', 'rejected')),
  answer_eligible boolean not null default false,
  category text,
  rationale text,
  actor_role text not null check (actor_role in ('admin', 'import')),
  created_at timestamptz not null default now(),
  unique (entry_id, revision_number),
  unique (entry_id, id),
  check (not answer_eligible or (review = 'approved' and definition_vi is not null))
);
alter table private.vtv_entries add constraint vtv_entry_current_revision_fk
  foreign key (id, current_revision_id) references private.vtv_entry_revisions(entry_id, id)
  deferrable initially deferred;

create table private.vtv_draft (
  id integer primary key default 1 check (id = 1),
  revision bigint not null default 0 check (revision >= 0),
  configuration_id uuid not null default gen_random_uuid(),
  attempt_limit integer not null default 6 check (attempt_limit between 1 and 12),
  normalizer_version text not null default 'vi-nfc-v2' check (normalizer_version = 'vi-nfc-v2'),
  updated_at timestamptz not null default now()
);
insert into private.vtv_draft (id) values (1);

create table private.vtv_editorial_events (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  request_id uuid not null,
  actor_role text not null check (actor_role = 'admin'),
  previous_draft_revision bigint check (previous_draft_revision >= 0),
  next_draft_revision bigint check (next_draft_revision >= 0),
  input jsonb not null,
  output jsonb not null,
  configuration jsonb not null,
  created_at timestamptz not null default now()
);

create table private.vtv_requests (
  operation text not null,
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  event_id uuid not null references private.vtv_editorial_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (operation, idempotency_key)
);

create index vtv_entries_import_idx on private.vtv_entries(import_id);
create index vtv_entries_source_idx on private.vtv_entries(source_id);
create index vtv_entries_current_revision_idx on private.vtv_entries(current_revision_id);
create index vtv_revisions_level_review_idx on private.vtv_entry_revisions(level, review);
create index vtv_revisions_normalized_idx on private.vtv_entry_revisions(normalized);
create index vtv_import_status_idx on private.vtv_imports(status);
create index vtv_events_created_idx on private.vtv_editorial_events(created_at, id);

alter table private.vtv_sources enable row level security;
alter table private.vtv_source_lineage_attestations enable row level security;
alter table private.vtv_imports enable row level security;
alter table private.vtv_import_chunks enable row level security;
alter table private.vtv_staged_candidates enable row level security;
alter table private.vtv_entries enable row level security;
alter table private.vtv_entry_revisions enable row level security;
alter table private.vtv_draft enable row level security;
alter table private.vtv_editorial_events enable row level security;
alter table private.vtv_requests enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

-- Validated derived spellings are staged alongside the exact validated chunk.
alter table private.vtv_import_chunks add column derived_entries jsonb not null check (jsonb_typeof(derived_entries) = 'array');

create function public.vtv_import_start(
  p_request_id uuid, p_idempotency_key uuid, p_request_hash text,
  p_artifact_id uuid, p_artifact_revision text, p_chunk_count integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing private.vtv_requests%rowtype;
  imported private.vtv_imports%rowtype;
  result jsonb;
  event_id uuid;
  draft private.vtv_draft%rowtype;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash !~ '^[0-9a-f]{64}$' or p_artifact_id is null or char_length(p_artifact_revision) not between 1 and 128 or p_chunk_count not between 1 and 100 then
    raise exception 'INVALID_INPUT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vtv-start:' || p_idempotency_key::text, 0));
  select * into existing from private.vtv_requests where operation = 'import-start' and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.result;
  end if;
  insert into private.vtv_imports(artifact_id, artifact_revision, expected_chunks)
  values (p_artifact_id, p_artifact_revision, p_chunk_count)
  on conflict (artifact_id, artifact_revision) do nothing;
  select * into imported from private.vtv_imports where artifact_id = p_artifact_id and artifact_revision = p_artifact_revision for update;
  if imported.expected_chunks <> p_chunk_count then raise exception using message = 'IMPORT_CONFLICT', detail = 'ARTIFACT_MISMATCH'; end if;
  select * into draft from private.vtv_draft where id = 1;
  result := pg_catalog.jsonb_build_object('importId', imported.id, 'expectedChunks', imported.expected_chunks, 'status', imported.status,
    'draftRevision', draft.revision::text,
    'receipts', coalesce((select pg_catalog.jsonb_agg(c.receipt order by c.chunk_index) from private.vtv_import_chunks c where c.import_id = imported.id), '[]'::jsonb));
  insert into private.vtv_editorial_events(operation, request_id, actor_role, previous_draft_revision, next_draft_revision, input, output, configuration)
  values ('import-start', p_request_id, 'admin', draft.revision, draft.revision, pg_catalog.jsonb_build_object('artifactId', p_artifact_id, 'artifactRevision', p_artifact_revision, 'chunkCount', p_chunk_count), result,
    pg_catalog.jsonb_build_object('configurationId', draft.configuration_id, 'draftRevision', draft.revision::text, 'attemptLimit', draft.attempt_limit, 'normalizerVersion', draft.normalizer_version)) returning id into event_id;
  insert into private.vtv_requests(operation, idempotency_key, request_hash, result, event_id) values ('import-start', p_idempotency_key, p_request_hash, result, event_id);
  return result;
end; $$;
revoke all on function public.vtv_import_start(uuid, uuid, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.vtv_import_start(uuid, uuid, text, uuid, text, integer) to service_role;

create function public.vtv_import_apply(
  p_request_id uuid, p_idempotency_key uuid, p_request_hash text,
  p_import_id uuid, p_payload jsonb, p_canonical_hash text, p_byte_count integer, p_derived_entries jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing private.vtv_requests%rowtype;
  imported private.vtv_imports%rowtype;
  prior private.vtv_import_chunks%rowtype;
  v_chunk_index integer;
  entry_count integer;
  result jsonb;
  event_id uuid;
  draft private.vtv_draft%rowtype;
  source_item jsonb;
  entry_item jsonb;
  source_row private.vtv_sources%rowtype;
  existing_entry private.vtv_entries%rowtype;
  classifications jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_noop_count integer := 0;
  i integer;
begin
  if p_request_id is null or p_idempotency_key is null or p_request_hash !~ '^[0-9a-f]{64}$' or p_import_id is null or p_canonical_hash !~ '^[0-9a-f]{64}$' or p_byte_count not between 1 and 524288 or pg_catalog.jsonb_typeof(p_payload) <> 'object' or pg_catalog.jsonb_typeof(p_derived_entries) <> 'array' then raise exception 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vtv-apply:' || p_idempotency_key::text, 0));
  select * into existing from private.vtv_requests where operation = 'import-apply' and idempotency_key = p_idempotency_key;
  if found then
    if existing.request_hash <> p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return existing.result;
  end if;
  select * into imported from private.vtv_imports where id = p_import_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_chunk_index := (p_payload->>'chunkIndex')::integer;
  entry_count := pg_catalog.jsonb_array_length(p_payload->'entries');
  if (p_payload->>'artifactId')::uuid <> imported.artifact_id or p_payload->>'artifactRevision' <> imported.artifact_revision or (p_payload->>'chunkCount')::integer <> imported.expected_chunks or v_chunk_index < 0 or v_chunk_index >= imported.expected_chunks or entry_count > 200 or pg_catalog.jsonb_array_length(p_derived_entries) <> entry_count then raise exception using message = 'IMPORT_CONFLICT', detail = 'ARTIFACT_MISMATCH'; end if;
  select * into prior from private.vtv_import_chunks where import_id = p_import_id and vtv_import_chunks.chunk_index = v_chunk_index;
  if found then
    if prior.canonical_hash <> p_canonical_hash then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'CHUNK_HASH_MISMATCH', 'chunkIndex', v_chunk_index)::text; end if;
    result := prior.receipt;
  else
    if imported.status <> 'staging' then raise exception using message = 'IMPORT_CONFLICT', detail = 'IMPORT_NOT_STAGING'; end if;
    if imported.total_bytes + p_byte_count > 52428800 or imported.total_entries + entry_count > 20000 then raise exception using message = 'IMPORT_CONFLICT', detail = 'ARTIFACT_LIMIT'; end if;
    for i in 0..(entry_count - 1) loop
      entry_item := (p_payload->'entries')->i;
      select value into source_item from pg_catalog.jsonb_array_elements(p_payload->'sources') where value->>'sourceId' = entry_item->>'sourceId';
      if source_item is null then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'SOURCE_REFERENCE', 'chunkIndex', v_chunk_index, 'entryIndex', i)::text; end if;
      select * into source_row from private.vtv_sources where kind = source_item->>'kind' and resource_revision = source_item->>'resourceRevision' and artifact_sha256 = source_item->>'artifactSha256';
      if found then
        if source_row.metadata <> source_item - 'sourceId' then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'SOURCE_METADATA_MISMATCH', 'chunkIndex', v_chunk_index, 'entryIndex', i)::text; end if;
        select * into existing_entry from private.vtv_entries where source_id = source_row.id and external_id = entry_item->>'externalId';
        if found then
          if existing_entry.source_payload <> entry_item - 'sourceId' then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'CANDIDATE_CONTENT_MISMATCH', 'chunkIndex', v_chunk_index, 'entryIndex', i)::text; end if;
          v_noop_count := v_noop_count + 1;
          classifications := classifications || pg_catalog.jsonb_build_array(true);
          continue;
        end if;
      end if;
      v_created_count := v_created_count + 1;
      classifications := classifications || pg_catalog.jsonb_build_array(false);
    end loop;
    result := pg_catalog.jsonb_build_object('importId', p_import_id, 'chunkIndex', v_chunk_index, 'canonicalHash', p_canonical_hash, 'stagedCount', entry_count, 'createdCount', v_created_count, 'noOpCount', v_noop_count, 'countsProvisional', true);
    insert into private.vtv_import_chunks(import_id, chunk_index, canonical_hash, payload, byte_count, entry_count, receipt, derived_entries)
    values (p_import_id, v_chunk_index, p_canonical_hash, p_payload, p_byte_count, entry_count, result, p_derived_entries);
    for i in 0..(entry_count - 1) loop
      insert into private.vtv_staged_candidates(import_id, chunk_index, entry_index, candidate, derived, was_noop)
      values (p_import_id, v_chunk_index, i, (p_payload->'entries')->i, p_derived_entries->i, (classifications->>i)::boolean);
    end loop;
    update private.vtv_imports set total_bytes = total_bytes + p_byte_count, total_entries = total_entries + entry_count where id = p_import_id;
  end if;
  select * into draft from private.vtv_draft where id = 1;
  insert into private.vtv_editorial_events(operation, request_id, actor_role, previous_draft_revision, next_draft_revision, input, output, configuration)
  values ('import-apply', p_request_id, 'admin', draft.revision, draft.revision, pg_catalog.jsonb_build_object('importId', p_import_id, 'chunkIndex', v_chunk_index, 'canonicalHash', p_canonical_hash), result,
    pg_catalog.jsonb_build_object('configurationId', draft.configuration_id, 'draftRevision', draft.revision::text, 'attemptLimit', draft.attempt_limit, 'normalizerVersion', draft.normalizer_version)) returning id into event_id;
  insert into private.vtv_requests(operation, idempotency_key, request_hash, result, event_id) values ('import-apply', p_idempotency_key, p_request_hash, result, event_id);
  return result;
end; $$;
revoke all on function public.vtv_import_apply(uuid, uuid, text, uuid, jsonb, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.vtv_import_apply(uuid, uuid, text, uuid, jsonb, text, integer, jsonb) to service_role;

create function public.vtv_import_finalize(
  p_request_id uuid, p_idempotency_key uuid, p_request_hash text,
  p_import_id uuid, p_expected_draft_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing private.vtv_requests%rowtype;
  imported private.vtv_imports%rowtype;
  draft private.vtv_draft%rowtype;
  chunk private.vtv_import_chunks%rowtype;
  source_item jsonb;
  entry_item jsonb;
  derived jsonb;
  source_row private.vtv_sources%rowtype;
  previous private.vtv_entries%rowtype;
  new_entry_id uuid;
  new_revision_id uuid;
  supersedes uuid;
  source_count integer;
  conflict_chunk integer;
  conflict_entry integer;
  created_count integer := 0;
  noop_count integer := 0;
  i integer;
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
  select first_chunk, first_entry into conflict_chunk, conflict_entry from (
      select s.value->>'kind' kind, s.value->>'resourceRevision' revision, s.value->>'artifactSha256' digest, e.value->>'externalId' external_id,
        (pg_catalog.array_agg(c.chunk_index order by c.chunk_index, e.ordinality))[1] first_chunk,
        (pg_catalog.array_agg((e.ordinality - 1)::integer order by c.chunk_index, e.ordinality))[1] first_entry
      from private.vtv_import_chunks c
      cross join lateral pg_catalog.jsonb_array_elements(c.payload->'entries') with ordinality e(value, ordinality)
      cross join lateral pg_catalog.jsonb_array_elements(c.payload->'sources') s(value)
      where c.import_id = p_import_id and s.value->>'sourceId' = e.value->>'sourceId'
      group by 1, 2, 3, 4 having count(*) > 1
    ) duplicate_identity order by first_chunk, first_entry limit 1;
  if conflict_chunk is not null then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'DUPLICATE_IDENTITY', 'chunkIndex', conflict_chunk, 'entryIndex', conflict_entry)::text; end if;

  for chunk in select * from private.vtv_import_chunks where import_id = p_import_id order by chunk_index loop
    for source_item in select value from pg_catalog.jsonb_array_elements(chunk.payload->'sources') loop
      insert into private.vtv_sources(kind, resource_revision, artifact_sha256, metadata)
      values (source_item->>'kind', source_item->>'resourceRevision', source_item->>'artifactSha256', source_item - 'sourceId')
      on conflict (kind, resource_revision, artifact_sha256) do nothing;
      select * into source_row from private.vtv_sources where kind = source_item->>'kind' and resource_revision = source_item->>'resourceRevision' and artifact_sha256 = source_item->>'artifactSha256';
      if source_row.metadata <> source_item - 'sourceId' then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'SOURCE_METADATA_MISMATCH', 'chunkIndex', chunk.chunk_index)::text; end if;
    end loop;
    for i in 0..(chunk.entry_count - 1) loop
      entry_item := (chunk.payload->'entries')->i;
      derived := chunk.derived_entries->i;
      select value into source_item from pg_catalog.jsonb_array_elements(chunk.payload->'sources') where value->>'sourceId' = entry_item->>'sourceId';
      if source_item is null then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'SOURCE_REFERENCE', 'chunkIndex', chunk.chunk_index, 'entryIndex', i)::text; end if;
      select * into source_row from private.vtv_sources where kind = source_item->>'kind' and resource_revision = source_item->>'resourceRevision' and artifact_sha256 = source_item->>'artifactSha256';
      select * into previous from private.vtv_entries where source_id = source_row.id and external_id = entry_item->>'externalId';
      if found then
        if previous.source_payload <> entry_item - 'sourceId' then raise exception using message = 'IMPORT_CONFLICT', detail = pg_catalog.jsonb_build_object('reason', 'CANDIDATE_CONTENT_MISMATCH', 'chunkIndex', chunk.chunk_index, 'entryIndex', i)::text; end if;
        noop_count := noop_count + 1;
        continue;
      end if;
      supersedes := null;
      select count(*) into source_count from private.vtv_entries e join private.vtv_sources s on s.id = e.source_id join private.vtv_imports imp on imp.id = e.import_id
      where s.kind = source_row.kind and imp.status = 'finalized'
        and exists (select 1 from private.vtv_source_lineage_attestations current_attestation join private.vtv_source_lineage_attestations prior_attestation on prior_attestation.lineage_id = current_attestation.lineage_id where current_attestation.kind = source_row.kind and current_attestation.resource_revision = source_row.resource_revision and current_attestation.artifact_sha256 = source_row.artifact_sha256 and prior_attestation.kind = s.kind and prior_attestation.resource_revision = s.resource_revision and prior_attestation.artifact_sha256 = s.artifact_sha256 and current_attestation.source_entry_id = entry_item->>'sourceEntryId' and current_attestation.source_sense_id = entry_item->>'sourceSenseId' and current_attestation.candidate_payload = entry_item - 'sourceId' and prior_attestation.source_entry_id = e.source_entry_id and prior_attestation.source_sense_id = e.source_sense_id and prior_attestation.candidate_payload = e.source_payload)
        and entry_item->>'sourceEntryId' like 'stable:%' and entry_item->>'sourceSenseId' like 'stable:%'
        and e.source_entry_id = entry_item->>'sourceEntryId' and e.source_sense_id = entry_item->>'sourceSenseId'
        and not exists (select 1 from private.vtv_entries successor join private.vtv_imports successor_import on successor_import.id = successor.import_id where successor.supersedes_entry_id = e.id and successor_import.status = 'finalized');
      if source_count = 1 then
        select e.id into supersedes from private.vtv_entries e join private.vtv_sources s on s.id = e.source_id join private.vtv_imports imp on imp.id = e.import_id
        where s.kind = source_row.kind and imp.status = 'finalized'
          and exists (select 1 from private.vtv_source_lineage_attestations current_attestation join private.vtv_source_lineage_attestations prior_attestation on prior_attestation.lineage_id = current_attestation.lineage_id where current_attestation.kind = source_row.kind and current_attestation.resource_revision = source_row.resource_revision and current_attestation.artifact_sha256 = source_row.artifact_sha256 and prior_attestation.kind = s.kind and prior_attestation.resource_revision = s.resource_revision and prior_attestation.artifact_sha256 = s.artifact_sha256 and current_attestation.source_entry_id = entry_item->>'sourceEntryId' and current_attestation.source_sense_id = entry_item->>'sourceSenseId' and current_attestation.candidate_payload = entry_item - 'sourceId' and prior_attestation.source_entry_id = e.source_entry_id and prior_attestation.source_sense_id = e.source_sense_id and prior_attestation.candidate_payload = e.source_payload)
          and e.source_entry_id = entry_item->>'sourceEntryId' and e.source_sense_id = entry_item->>'sourceSenseId'
          and not exists (select 1 from private.vtv_entries successor join private.vtv_imports successor_import on successor_import.id = successor.import_id where successor.supersedes_entry_id = e.id and successor_import.status = 'finalized');
      end if;
      new_entry_id := gen_random_uuid();
      new_revision_id := gen_random_uuid();
      insert into private.vtv_entries(id, source_id, external_id, source_entry_id, source_sense_id, entry_url, source_payload, import_id, supersedes_entry_id, current_revision_id)
      values (new_entry_id, source_row.id, entry_item->>'externalId', entry_item->>'sourceEntryId', entry_item->>'sourceSenseId', entry_item->>'entryUrl', entry_item - 'sourceId', p_import_id, supersedes, new_revision_id);
      insert into private.vtv_entry_revisions(id, entry_id, revision_number, original, normalized, level, definition_vi, review, answer_eligible, actor_role)
      values (new_revision_id, new_entry_id, 1, entry_item->>'original', derived->>'normalized', (derived->>'level')::integer, entry_item->>'definitionVi', 'pending', false, 'import');
      created_count := created_count + 1;
    end loop;
  end loop;
  update private.vtv_imports set status = 'finalized', finalized_at = pg_catalog.now() where id = p_import_id;
  update private.vtv_draft set revision = revision + 1, updated_at = pg_catalog.now() where id = 1 returning * into draft;
  result := pg_catalog.jsonb_build_object('importId', p_import_id, 'status', 'finalized', 'createdCount', created_count, 'noOpCount', noop_count, 'draftRevision', draft.revision::text);
  insert into private.vtv_editorial_events(operation, request_id, actor_role, previous_draft_revision, next_draft_revision, input, output, configuration)
  values ('import-finalize', p_request_id, 'admin', p_expected_draft_revision, draft.revision, pg_catalog.jsonb_build_object('importId', p_import_id, 'expectedDraftRevision', p_expected_draft_revision::text), result,
    pg_catalog.jsonb_build_object('configurationId', draft.configuration_id, 'draftRevision', draft.revision::text, 'attemptLimit', draft.attempt_limit, 'normalizerVersion', draft.normalizer_version)) returning id into event_id;
  insert into private.vtv_requests(operation, idempotency_key, request_hash, result, event_id) values ('import-finalize', p_idempotency_key, p_request_hash, result, event_id);
  return result;
end; $$;
revoke all on function public.vtv_import_finalize(uuid, uuid, text, uuid, bigint) from public, anon, authenticated;
grant execute on function public.vtv_import_finalize(uuid, uuid, text, uuid, bigint) to service_role;

create table private.vtv_import_rate_limit (
  role_key text primary key,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0)
);
alter table private.vtv_import_rate_limit enable row level security;
revoke all on private.vtv_import_rate_limit from public, anon, authenticated;
create function public.vtv_consume_import_apply_limit() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  current_row private.vtv_import_rate_limit%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  insert into private.vtv_import_rate_limit(role_key, window_start, request_count) values ('admin', v_now, 1)
  on conflict (role_key) do update
  set window_start = case when private.vtv_import_rate_limit.window_start <= v_now - interval '1 minute' then v_now else private.vtv_import_rate_limit.window_start end,
      request_count = case when private.vtv_import_rate_limit.window_start <= v_now - interval '1 minute' then 1 else private.vtv_import_rate_limit.request_count + 1 end
  returning * into current_row;
  if current_row.request_count <= 20 then return 0; end if;
  return greatest(1, ceil(extract(epoch from current_row.window_start + interval '1 minute' - v_now))::integer);
end; $$;
revoke all on function public.vtv_consume_import_apply_limit() from public, anon, authenticated;
grant execute on function public.vtv_consume_import_apply_limit() to service_role;

create table private.vtv_import_mutation_rate_limit (
  role_key text primary key,
  window_start timestamptz not null,
  request_count integer not null check (request_count > 0)
);
alter table private.vtv_import_mutation_rate_limit enable row level security;
revoke all on private.vtv_import_mutation_rate_limit from public, anon, authenticated;
create function public.vtv_consume_import_mutation_limit() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  current_row private.vtv_import_mutation_rate_limit%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  insert into private.vtv_import_mutation_rate_limit(role_key, window_start, request_count) values ('admin', v_now, 1)
  on conflict (role_key) do update
  set window_start = case when private.vtv_import_mutation_rate_limit.window_start <= v_now - interval '1 minute' then v_now else private.vtv_import_mutation_rate_limit.window_start end,
      request_count = case when private.vtv_import_mutation_rate_limit.window_start <= v_now - interval '1 minute' then 1 else private.vtv_import_mutation_rate_limit.request_count + 1 end
  returning * into current_row;
  if current_row.request_count <= 30 then return 0; end if;
  return greatest(1, ceil(extract(epoch from current_row.window_start + interval '1 minute' - v_now))::integer);
end; $$;
revoke all on function public.vtv_consume_import_mutation_limit() from public, anon, authenticated;
grant execute on function public.vtv_consume_import_mutation_limit() to service_role;
