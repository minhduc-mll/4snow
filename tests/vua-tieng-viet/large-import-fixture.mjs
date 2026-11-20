import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeSpelling } from "../../lib/vua-tieng-viet/dictionary-contract.ts";

// Pipe the generated SQL into psql on a disposable database with the VTV
// migrations applied. The staging data and finalization are rolled back.
const [directory, ...options] = process.argv.slice(2);
const batchIndexes = options.filter((option) => option !== "--preview" && option !== "--publish");
const publish = options.includes("--publish");
if (!directory || !batchIndexes.length) throw new Error("Expected dataset directory and one or more batch indexes");
const { batches } = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";

console.log("\\set ON_ERROR_STOP on\n\\timing on\nbegin;");
for (const batchIndex of batchIndexes) {
  const batch = batches[Number(batchIndex) - 1];
  if (!batch) throw new Error("Unknown batch " + batchIndex);
  const importId = randomUUID();
  const count = batch.chunks.reduce((sum, chunk) => sum + chunk.entries, 0);
  console.log(`insert into private.vtv_imports(id,artifact_id,artifact_revision,expected_chunks)
    values ('${importId}', ${literal(batch.artifactId)}, ${literal(batch.artifactRevision)}, ${batch.chunkCount});`);
  for (const { file, canonicalHash } of batch.chunks) {
    const body = readFileSync(resolve(directory, file), "utf8");
    const document = JSON.parse(body);
    const derived = document.entries.map(({ original }) => normalizeSpelling(original));
    console.log(`select public.vtv_import_apply(gen_random_uuid(),gen_random_uuid(),'${canonicalHash}',
      '${importId}', ${literal(body)}, '${canonicalHash}', ${Buffer.byteLength(body)}, ${literal(JSON.stringify(derived))}) as staged_receipt \\gset`);
  }
  console.log(`set local statement_timeout = '8s';
do $verify$
declare
  draft_revision bigint := (select revision from private.vtv_draft where id = 1);
  request_id uuid := gen_random_uuid();
  idempotency_key uuid := gen_random_uuid();
  request_hash text := repeat('a', 64);
  receipt jsonb;
begin
  receipt := public.vtv_import_finalize(request_id, idempotency_key, request_hash, '${importId}', draft_revision);
  if receipt->>'status' is distinct from 'finalized'
    or (receipt->>'createdCount')::integer + (receipt->>'noOpCount')::integer is distinct from ${count}
    or receipt is distinct from public.vtv_import_finalize(gen_random_uuid(), idempotency_key, request_hash, '${importId}', draft_revision)
  then
    raise exception 'Unexpected finalization receipt: %', receipt;
  end if;
  raise notice 'Batch % finalized: %', ${Number(batchIndex)}, receipt;
end;
$verify$;`);
}
if (publish || options.includes("--preview")) {
  console.log(`
-- Simulate decisions solely inside this rolled-back load test.
update private.vtv_entry_revisions
set review='approved', category='less-common', rationale='Load test only',
  exclusion_checks='{"names":true,"abbreviations":true,"offensive":true,"malformed":true,"unverified":true}';
update private.vtv_entry_revisions
set answer_eligible=true, category='common'
where id in (
  select distinct on (level) id
  from private.vtv_entry_revisions
  where nullif(btrim(definition_vi),'') is not null
  order by level,id
);
insert into private.vtv_rights_reviews(id,source_id,draft_revision,decision,evidence,obligations,actor_role)
select gen_random_uuid(),id,(select revision from private.vtv_draft where id=1),
  'cleared','Load test only','Load test only','admin'
from private.vtv_sources;
do $verify$
declare
  preview jsonb := public.vtv_publication_preview(gen_random_uuid(),gen_random_uuid(),repeat('b',64),
    (select revision from private.vtv_draft where id=1));
  projected_count integer;
begin
  select sum((value->>'guesses')::integer) into projected_count
    from jsonb_each(preview->'coverage');
  if preview->>'valid' is distinct from 'true'
    or projected_count is distinct from (select count(distinct normalized)::integer from private.vtv_current_candidates)
    or (preview->>'payloadBytes')::integer > 2097152
  then
    raise exception 'Unexpected publication preview: %', preview-'sampleAttributions'-'playerSamples';
  end if;
  raise notice 'Full preview: % spellings, % bytes, % attributions',
    projected_count, preview->>'payloadBytes', preview->>'attributionCount';
end;
$verify$;`);
}
if (publish) {
  console.log(`
do $verify$
declare
  build private.vtv_release_builds%rowtype;
  receipt jsonb;
  public_document jsonb;
begin
  select * into strict build from private.vtv_release_builds;
  receipt := public.vtv_publish_confirmed(gen_random_uuid(),gen_random_uuid(),repeat('c',64),
    build.id,build.expected_draft_revision,
    (build.validation_report->>'expectedCurrentReleaseId')::uuid,build.payload_sha256);
  select release.public_payload into strict public_document
    from public.vtv_current_release pointer
    join public.vtv_releases release on release.id=pointer.release_id
    where pointer.id=1 and pointer.release_id=(receipt->>'releaseId')::uuid;
  if public_document is distinct from build.payload
    or receipt->>'payloadHash' is distinct from build.payload_sha256
  then
    raise exception 'Public release differs from the validated preview';
  end if;
  raise notice 'Published all preview spellings on the test database';
end;
$verify$;`);
}
console.log("rollback;");
