# Vua tiếng Việt implementation specification

Status: implementation exists, but the first real-data release and production readiness remain unaccepted. This document records requirements and does not itself establish clearance, verification, or deployment.

Design decisions confirmed on 2026-11-08: purple solo player interface, accent-sensitive matching, sequential cell input backed by one IME-compatible field, expandable letter-variant pickers, and green/yellow/gray feedback. Readiness decisions confirmed on 2026-11-15 are recorded below.

This specification operationalizes the gameplay and dictionary requirements. The [improvement specification](./vua-tieng-viet-improvement-plan.md) extends the baseline with mode settings, feedback accessibility, dataset import, bulk editorial review, and isolated publication preview. Those documents own product behavior; AGENTS.md owns architecture and security. Use the domain glossary's dictionary candidate, accepted guess, answer entry, normalized spelling, dictionary release, and round terminology. The numerical operational limits below are implementation decisions, not verified platform limits.

## Problem Statement

Players of mixed ages need a clear solo Vietnamese word game that works on phones without an MC or shared screen. They need to enter accented letters using their familiar device input method, understand per-cell clues, and correct invalid guesses without losing attempts. Administrators need a safe way to turn attributable source material into reviewed gameplay content without exposing private candidates or changing rounds already underway.

## Solution

Provide a solo game with 3/5/7/9-letter levels and six accepted guesses by default. Present the board in a restrained modern gameshow style with deep purple surfaces, lavender primary actions, and readable Vietnamese text. Fill cells sequentially through one shared text input; support the installed IME and a conventional virtual keyboard with expandable accented-letter pickers. Evaluate exact accented letters only on submission and preserve the board through inline win/loss results. Deliver immutable public dictionary releases from Supabase; select and evaluate answers locally. Extend the existing admin shell with private import, review, configuration, and publication operations through independently authorized Edge Functions. Save each round with its historical public input snapshot.

## User Stories

1. As a player, I want to open the game from home, so that I can discover it alongside existing games.
2. As a player, I want to choose 3, 5, 7, or 9 letters, so that I can choose difficulty.
3. As a player, I want help explaining normalization and feedback, so that I understand the rules.
4. As a player, I want keyboard, virtual keyboard, paste, and Vietnamese IME support, so that my preferred input works.
5. As a player, I want invalid guesses to preserve my input and attempts, so that I can correct mistakes.
6. As a player, I want feedback only after acceptance, so that typing does not reveal answers.
7. As a player, I want accurate repeated-letter feedback, so that each clue is useful.
8. As a player, I want proven absent letters disabled, so that I avoid known mistakes.
9. As a player, I want excess repeated letters to preserve stronger clues, so that useful letters remain available.
10. As a player, I want rapid duplicate submissions counted once, so that input glitches do not cost attempts.
11. As a player, I want the selected answer's original spelling and reviewed meaning on victory, so that I learn the intended expression.
12. As a player, I want the answer revealed on loss and a replay action, so that I can continue.
13. As a player, I want confirmation before discarding an active round, so that progress is not lost accidentally.
14. As a player, I want refresh and offline resume under the original rules, so that publication does not disrupt play.
15. As a player, I want actionable errors for corrupt saves or unavailable content, so that recovery is explicit.
16. As a player, I want storage failures explained while play continues, so that I understand recovery limitations.
17. As a player, I want accessible feedback and a readable mobile board, so that I can play without relying on color or a large display.
18. As a player, I want attribution linked to the selected meaning, so that I can identify its sources.
19. As an administrator, I want the existing login and logout, so that no second account system is required.
20. As an administrator, I want source revisions and rights verified before publication, so that redistributed content has a documented basis.
21. As an administrator, I want versioned JSON previews with bounded errors, so that I can fix preparation mistakes.
22. As an administrator, I want safe upload retries, so that network failures do not duplicate candidates.
23. As an administrator, I want source, length, status, definition, and collision filters, so that I can review efficiently.
24. As an administrator, I want separate guess approval and answer eligibility, so that uncommon guesses do not automatically become answers.
25. As an administrator, I want edits to preserve provenance and prior revisions, so that decisions remain traceable.
26. As an administrator, I want stale edits rejected, so that another session's review is not overwritten.
27. As an administrator, I want explicit collision selection, so that published answers have deterministic meanings.
28. As an administrator, I want coverage and exact player previews, so that incomplete releases are caught before publication.
29. As an administrator, I want configurable attempts published atomically with content, so that each round has consistent rules.
30. As an administrator, I want publication failures to preserve the previous release, so that players retain usable content.
31. As an operator, I want direct HTTP authorization and RLS protection, so that bypassing the UI exposes no private data.
32. As an operator, I want bounded requests, rate limits, and secret-free audit events, so that trusted operations remain controlled and inspectable.
33. As a player, I want a purple interface with clear Vietnamese text, so that I can enjoy the gameshow atmosphere while reading comfortably.
34. As a player, I want to play independently without a host or shared screen, so that I can start on my own device.
35. As a player, I want every configured attempt visible as a board row, so that I can understand my remaining chances.
36. As a player, I want accented letters to occupy one cell each, so that letter counts match the Vietnamese spelling I see.
37. As a player, I want E, Ê, and Ế distinguished, so that spelling and tone marks matter to the puzzle.
38. As a player, I want canonically equivalent Unicode input accepted, so that my device's encoding does not change the outcome.
39. As a player, I want typing to fill from the first cell and advance automatically, so that I do not have to select each cell.
40. As a player, I want Backspace to delete the last entered letter and move back, so that corrections are predictable.
41. As a player, I want my installed input method to finish composing accents before validation, so that ordinary Vietnamese typing works.
42. As a player, I want incomplete or composing input to disable submission, so that I cannot waste effort submitting unfinished text.
43. As a player, I want the main virtual key to enter its ordinary letter, so that common input stays fast.
44. As a player, I want a visible expansion control on every key with Vietnamese variants, so that accented letters are discoverable.
45. As a player, I want to choose a variant from a small dialog and continue typing, so that I can enter accents without changing device settings.
46. As a keyboard user, I want to open, navigate, choose from, and dismiss variant dialogs with restored focus, so that every input method is usable.
47. As a player, I want rejected dictionary guesses to retain the complete row and explain the problem, so that I can revise them without losing an attempt.
48. As a player, I want green, yellow, and gray clues with non-color equivalents, so that I can distinguish every result.
49. As a player, I want absent-letter knowledge scoped to each exact accented letter, so that an absent base letter does not block its viable variants.
50. As a player, I want short instructions and a visible legend without an automatic help dialog, so that I can start with little interruption.
51. As a player, I want detailed examples available through Cách chơi, so that I can learn the rules when needed.
52. As a player, I want result messages below the preserved board, so that I can inspect my guesses after the round ends.
53. As a player, I want Chơi lại to use a new answer at the same length, so that I can continue without configuring another round.
54. As a mobile player, I want the nine-letter board and virtual keyboard to fit without horizontal scrolling, so that all controls remain reachable.
55. As a motion-sensitive player, I want restrained effects and reduced-motion support, so that feedback stays comfortable.
56. As a player, I want a worked repeated-letter feedback example, so that I can understand how exact and remaining letter matches are assigned.
57. As an operator, I want a small reviewed first dictionary release covering every level, so that I can validate real play before expanding the content.
58. As a project owner, I want setup instructions for a separate staging environment, so that I can create or designate its resources and return the required configuration safely.
59. As a reviewer, I want source lineage, rights obligations, and candidate evidence assembled for review, so that I can make an informed clearance or editorial decision.
60. As an operator, I want the complete release and player workflow exercised on staging, so that production readiness reflects deployed behavior rather than mocked tests alone.
61. As a project owner, I want remaining release blockers and verification evidence recorded, so that I can decide whether to proceed to production.

## Implementation Decisions

### Architecture and delivery order

- Add the player route `/vua-tieng-viet` within the existing player route group and navigation through the existing path registry. Extend the existing admin page and authenticated shell; preserve Quiz and Lucky Draw boundaries.
- Use existing root-level domain types, feature hooks, Supabase browser client, TanStack Query provider, localization, and atoms/molecules/organisms conventions. New equivalent controls require atom wrappers over Shadcn. Keep transitions and I/O in hooks/services, presentation in typed functional components. Add client boundaries only where needed.
- TanStack Query owns live published/admin data. Local React state owns the round and unsaved interaction; Zustand is optional for UI state only. Historical round snapshots live in feature persistence, outside Query and Zustand. On logout/401, cancel and remove private dictionary queries and clear private previews; retain unrelated game state.
- No gameplay server, new Next.js handlers, Server Actions, server-side DB clients, accounts, or realtime subscriptions. Existing admin authentication endpoints remain the only Route Handler exception. Privileged access exists only inside authorized Edge Functions; transactional database routines support those operations.
- Implement in order: source/rights preparation and synthetic fixtures; pure domain validators and tests; migrations/RLS and Edge authorization; imports/review/publication; public loader and local gameplay/persistence; accessible UI integration; full verification. Source readiness blocks real-data publication, not synthetic implementation tests.
- For the readiness follow-up, repair the editorial panel's separation of presentation and hook logic, add worked repeated-letter help, and reconcile deployment documentation with the actual migrations and functions. Preserve existing feature behavior and independent workspace changes.
- Aim for production readiness through a separate owner-created or owner-designated Supabase staging project and Vercel Preview. Provide a step-by-step setup guide specifying what non-secret configuration or secure access is needed and what must never be sent in plaintext or committed. Do not assume an existing environment or create resources on the owner's behalf.
- Prepare the source and rights evidence for a qualified review, then identify the reviewer after the owner has seen the dossier. Human rights clearance and editorial approval are separate decisions; automated preparation or validation never substitutes for either. Do not publish uncleared entries.
- Target an initial small release with 20 reviewed answer entries and 50 accepted guesses per level, including answer entries in the guess count. These are planning targets, not new hard validation minima or evidence of adequacy for long-term play. If eligible material is insufficient, report the actual counts and seek a decision rather than approving unsuitable entries. Existing candidates are a review seed, not a cleared release.
- After source and input prerequisites are met, rehearse real import, review, collision resolution, publication and player flows on staging. Retain non-secret receipts and evidence; evaluate production readiness separately. This work does not authorize production publication or deployment.

### Source-data prerequisites

- Select an exact Kaikki extraction of Vietnamese-language entries from Vietnamese Wiktionary. Record immutable artifact URL, originating dump identifier/date, extraction/tool revision, SHA-256 of downloaded bytes, retrieval time, entry/sense identifiers, and language. Do not substitute an English definition for a Vietnamese one.
- Identify a specific Underthesea-related lexical resource and immutable revision/artifact. Record its own provenance and dataset rights independently of the toolkit license. Tokenization output is insufficient evidence of dictionary eligibility. Until a suitable resource is verified, omit its candidates rather than fabricate them; the core game can ship using cleared, reviewed Kaikki material.
- For each source, record exact applicable license name/version/URL, attribution text, contributor/history reference when required, modifications notice, redistribution/share-alike handling, and access to the modified distributed data under applicable terms. A reviewer records evidence and clearance time. Unresolved rights block publication of affected entries. Do not assume all artifacts share licensing terms.
- Offline preparation may use local scripts and Underthesea tooling, but introduces no deployed service or runtime fetching. Preparation emits manifests and chunked JSON. Preserve original source records or an immutable artifact reference; edited spellings/definitions never replace provenance.
- No initial dataset, source revision, legal clearance, or counts are asserted here. Populate the source ledger and obtain sufficient reviewed answers and guesses for all four levels before release acceptance.

### Shared normalization and gameplay rules

- Version the accent-preserving normalizer as `vi-nfc-v2`, replacing the previous planned accent-stripping contract. Validate raw input as supported Vietnamese Latin letters, combining marks attached to those letters that form supported Vietnamese letters, and ordinary U+0020 spaces only. Reject punctuation, digits, controls, emoji, tabs/newlines, unsupported accented Latin letters, and other scripts; never strip invalid characters into a valid word. Trim/collapse spaces for display preparation while retaining raw submitted input for the round record.
- Normalize to Unicode NFC, remove ordinary spaces, compare case-insensitively through a canonical uppercase spelling, and preserve Vietnamese vowel shapes, tone marks, and Đ. E, Ê, and Ế are distinct; D and Đ are distinct. Count NFC letters rather than raw UTF-16 units or decomposed marks: “tiếng Việt” has nine cells. Require supported letters with length 3/5/7/9. Use one shared versioned implementation in browser/offline preparation/Edge validation, with cross-runtime golden fixtures. Imports never supply authoritative normalized values.
- Feedback first reserves exact accented-letter positions, then assigns remaining answer counts left-to-right. Keyboard state takes the strongest evidence across accepted guesses per exact accented letter: correct > present > absent > unknown. Disable only letters with absent evidence and no stronger evidence. Reject committed edits/pastes containing disabled letters atomically with a clear message; preserve prior editable input. Never silently remove letters. An absent E cannot disable Ê or Ế. Keep expansion controls usable whenever at least one variant remains available; do not reject unfinished IME drafts based on provisional letters.
- IME composition retains its own draft; do not validate, mutate normalized cells, or submit mid-composition. All inputs funnel into one serialized round transition. A synchronous processing guard plus round revision prevents multiple handlers accepting the same event against the same input. Rejected guesses do not advance revision/attempts. No typing feedback beyond input validation.
- Uniformly select from the chosen level's eligible answer entries using browser cryptographic randomness with unbiased bounded selection, inside error handling. For replay, exclude the previous answer entry when alternatives exist at that level; if only one eligible answer exists, retain playable behavior and explain that no different answer is available. No fallback fabricated answer. Win requires full accent-sensitive normalized equality; a differently accented approved guess does not win. Reveal the selected entry and its reviewed sense when multiple sources share its exact normalized spelling.
- Attempts are integers 1–12 inclusive, default 6. Config contains fixed levels [3,5,7,9], attempt limit, normalizer version, and configuration UUID. Configuration changes are drafts until a new release is published. Even settings-only changes create a release referencing the complete content snapshot.

### Versioned JSON imports

The wire format is UTF-8 JSON, without compression, and uses strict objects: unknown fields are rejected. All identifiers described as UUID are valid UUID strings; hashes are lowercase 64-character SHA-256 hex; times are RFC3339 UTC. All strings have character and UTF-8 byte limits validated before persistence.

| Object | Required fields and exact value shapes |
| --- | --- |
| Import document | `schemaVersion`: literal 1; `normalizerVersion`: literal vi-nfc-v2; `artifactId`: UUID; `artifactRevision`: nonempty string ≤128; `preparedAt`: timestamp; `chunkIndex`: integer ≥0; `chunkCount`: integer 1–100; `sources`: Source[]; `entries`: Candidate[] |
| Source | `sourceId`: UUID; `name`: string ≤120; `kind`: kaikki or underthesea-resource; `artifactUrl`: HTTPS URL; `artifactSha256`: hash; `resourceRevision`: string ≤200; `originDump`: string or null; `retrievedAt`: timestamp; `rights`: Rights |
| Rights | `licenseName`: string ≤200; `licenseVersion`: string ≤80 or null; `licenseUrl`: HTTPS URL; `attributionText`: string ≤4000; `historyUrl`: HTTPS URL or null; `redistributionNote`: string ≤4000; `modificationsNotice`: string ≤2000 |
| Candidate | `externalId`: nonempty string ≤200 unique within source/revision; `sourceId`: UUID in sources; `sourceEntryId`: string ≤300; `sourceSenseId`: string ≤300 or null; `entryUrl`: HTTPS URL; `original`: string 1–120; `definitionVi`: string 1–2000 or null; `language`: literal vi; `sourceNotes`: string ≤2000 or null |

- Imported rights are claims awaiting trusted review, never self-authorizing clearance. No approval/status/answer-selection fields exist in import schema. Imported candidates start pending, not answer eligible.
- Each chunk is at most 512 KiB and 200 entries; at most 20 source records per chunk, 20,000 entries/100 chunks/50 MiB across an artifact. The browser rejects oversized datasets before parsing and splits a complete JSON without chunk metadata using serialized UTF-8 byte counts. Pre-split parts preserve their indices and hashes. Offline preparation splits larger datasets into separate artifacts. No archive upload, URL fetching, HTML rendering, or browser execution of source content.
- Canonical hash means SHA-256 over recursively key-sorted compact JSON, UTF-8, preserving array order and string content. Reject duplicate JSON keys before canonicalization on the trusted side. Browser and Edge use the same canonicalization fixtures. Store both canonical chunk hash and source artifact byte hashes; these have different purposes.
- Preview validates schema, provenance references, raw characters, normalized lengths, and duplicates; returns counts and at most 100 indexed field errors plus `errorsTruncated`. An invalid chunk creates no candidates. Browser preview is advisory; apply repeats trusted validation.
- Start an artifact import session pinned to artifact identity/revision and chunk count. Apply each chunk atomically with immutable hash and receipt; retry of same index/hash returns its receipt, different hash returns conflict. Finalization checks all chunks, source metadata agreement, total limits, and unique candidate identities. Only finalized imports appear in review queries. Abandoned sessions stay private and cannot publish.
- Unique source identity is (kind, resourceRevision, artifactSha256); candidate identity is (source identity, externalId). Same identity/same content is a reported no-op. Changed content under the same identity is a conflict, never an overwrite. A new source revision creates a linked pending candidate with `supersedesEntryId` when matched; reviewed content is not automatically replaced or carried forward as approved.

### Database schema and invariants

Use feature-prefixed tables. UUID primary keys are generated in trusted operations; timestamps are database `timestamptz`, defaulting to database time. All foreign keys have restrictive deletion. Private schema is not exposed through PostgREST. Every table, including private tables, has RLS enabled. Migration SQL must encode the following columns, keys, constraints, grants, and transactional routines; no ORM is introduced.

| Table | Columns and constraints beyond primary key/timestamps |
| --- | --- |
| private.vtv_sources | Immutable source identity and full Source metadata; unique identity tuple; imported rights claims |
| private.vtv_rights_reviews | source_id FK, evidence text, decision cleared/unresolved/rejected, obligations text, previous_review_id nullable FK; append-only |
| private.vtv_imports | artifact_id/revision unique, schema/normalizer versions, expected_chunks, status staging/finalized/failed, finalized_at nullable, total_bytes/entries; bounded checks |
| private.vtv_import_chunks | import_id FK, chunk_index, canonical_hash, validated payload, receipt JSON; unique(import_id, chunk_index) |
| private.vtv_entries | source_id FK, external_id, source entry/sense IDs, entry URL, import_id FK, supersedes_entry_id nullable FK, current_revision_id FK; unique(source_id, external_id) |
| private.vtv_entry_revisions | entry_id FK, revision_number positive integer, previous_revision_id nullable FK, original, normalized, level, definition_vi nullable, review pending/approved/rejected, answer_eligible boolean, editorial category, commonness/review rationale, actor_role literal admin or import; unique(entry_id, revision_number) |
| private.vtv_draft | Singleton id, revision bigint, configuration_id UUID, attempt_limit integer 1–12, normalizer_version; initialized at six attempts |
| private.vtv_answer_selections | normalized primary key, entry_revision_id FK; explicit reviewed choice for each collision group that has multiple answer-eligible entries |
| private.vtv_editorial_events | operation, request_id, actor_role, previous/next revision references, input JSON, output JSON, configuration snapshot JSON, timestamp; append-only; import input may reference immutable payload/hash |
| private.vtv_requests | operation + idempotency_key unique, canonical request hash, completed result JSON, event_id FK; transactionally committed with mutation |
| private.vtv_rate_windows | bucket key + operation class + window_start unique, count integer; trusted atomic increments only |
| private.vtv_release_builds | release_id UUID unique, expected_draft_revision, payload/hash, validation report, source/revision/config references; private failed/successful build records |
| public.vtv_releases | id UUID, schema_version literal 1, normalizer_version, configuration_id, attempt_limit, published_at, public_payload JSONB, payload_sha256; only complete published releases inserted; immutable |
| public.vtv_current_release | Singleton id constrained to 1, release_id FK, pointer_revision bigint, updated_at |

- Revisions are immutable; updates only move current revision pointers and draft counters. Imported revisions start pending. Editing spelling/definition creates a pending revision with answer eligibility false; approval must explicitly reaffirm policy. Approval records exclusion checks for guesses and commonness/meaning review for answers. Reject eligibility without approved status, meaningful Vietnamese definition, correct level, or provenance. Definition language/commonness require editorial judgment, not just a nonempty string check.
- Every editorial/configuration/rights/collision/import-finalization mutation increments the singleton draft revision under lock. Review approval covers the exact revision. Entry revision pointers must refer to their own entry; selected answer revisions must remain current and eligible at publication. Use composite FKs or transactional validation plus constrained pointers for these cross-row relationships.
- Accepted guess membership is the distinct normalized set of current approved revisions from finalized imports with cleared rights. Answers are a subset with separate answer eligibility. If multiple eligible answers share a normalized spelling, require explicit answer selection; unresolved selection blocks publication. Alternate senses remain private. All selected answers belong to guess membership.
- Index entry current revision/source/import, revision (level, review), normalized spelling, audit timestamp/id, and finalization status. Private list queries join indexed revision pointers and use stable keyset pagination, never download the entire candidate corpus.
- Audit immutable inputs/outputs/configuration with timestamps for mutations; never passwords, JWTs, authorization headers, or credentials. The actor is a shared admin role, not an identifiable individual. Avoid answer-bearing runtime logs; public answers may exist in persisted release payloads as required game data.

### RLS, grants, and privileged transactions

- Revoke all private schema/table/sequence/function privileges from PUBLIC, anon, and authenticated. No private SELECT/INSERT/UPDATE/DELETE policies for browser roles. RLS default-deny is deliberate. Grant only the trusted Edge database role the required private operations. Never infer admin from a client field or custom JWT in PostgREST.
- Public releases and current pointer grant SELECT to anon/authenticated with SELECT policies permitting those published rows only; revoke INSERT/UPDATE/DELETE/TRUNCATE. No drafts are stored in these tables. Retained prior releases remain publicly readable because already distributed; no deletion/rollback UI.
- Public payload is constructed by an explicit allowlist, never serialized from full source/revision rows. It excludes editorial notes, review status, private import payloads, and internal rights evidence. Public attribution includes required source URLs/revisions/license/modification information, not credentials or private notes.
- Mutation routines are callable only by the privileged Edge role: revoke EXECUTE from PUBLIC/anon/authenticated. Use fixed safe search_path, qualified identifiers, validated parameters, and transactions. Security-definer routines, if necessary, use a dedicated minimal owner; do not expose arbitrary SQL or unbounded generic mutations. Browser access to RPC is denied even when a routine is discoverable.
- Edge service credentials remain in Edge environment configuration and are used only after application authorization. This trusted access does not authorize a Next.js DB client.

### Edge Function wire contracts

One dictionary administration Edge Function exposes a closed operation union in a POST JSON envelope, keeping a single authorization/transaction seam. Logical operation names below are contract identifiers, not additional Next.js routes. All objects are strict and runtime-validated from unknown. IDs are UUIDs unless specified otherwise.

Request headers: browser-safe Supabase `apikey`, `Authorization: Bearer <existing custom admin JWT>`, JSON content type, and an approved application Origin. Configure this function's gateway JWT verification off for this custom token; it independently verifies HS256 signature using the matching trusted admin secret, exact algorithm/type, role admin, finite integer iat/exp, exp > iat, exp > now, iat ≤ now + 30 seconds, and any nbf before accessing private data. Reject missing/malformed/expired tokens. Do not send the JWT to PostgREST as a Supabase session. Test this header/gateway behavior against the deployment target before enabling admin UI.

Allowlisted-origin CORS accepts POST/OPTIONS and only required headers; OPTIONS returns no data without running a private operation. CORS is not authorization. Disallowed origins fail; direct clients still require a valid token. Secrets/configuration missing fail closed with generic 503.

Envelope fields: `operation`, `requestId` UUID, `input` matching that operation. Mutations additionally require `idempotencyKey` UUID; editorial/configuration/publication mutations require `expectedDraftRevision` decimal bigint string. Version counters are decimal strings on the wire to avoid unsafe JavaScript integer conversion.

Success: `ok: true`, `requestId`, `data` per table. Error: `ok: false`, `requestId`, `error` containing `code`, safe `message`, optional `fieldErrors` (max 100), optional `currentRevision`, and optional `retryAfterSeconds`. Never return raw SQL/errors/payloads/token details.

| Operation | Input | Success data |
| --- | --- | --- |
| list | filters: sourceId nullable, level nullable, review nullable, hasDefinition nullable boolean, collisionsOnly boolean; cursor nullable opaque string ≤512; limit integer 1–100 default 50 | items: private current candidate/revision/provenance summaries; nextCursor nullable; draftRevision |
| detail | entryId | current revision, immutable revision history page (max 50), source/rights summary; further history uses cursor through list-history |
| list-history | entryId, cursor nullable, limit 1–50 | revision summaries, nextCursor |
| import-preview | one Import document | valid boolean, entry/duplicate/conflict counts, indexed errors, errorsTruncated; no candidates created |
| import-start | artifactId, artifactRevision, chunkCount | importId, expected chunk count, applied chunk receipts |
| import-apply | importId, one Import document, canonicalHash | chunk receipt: index, hash, created/no-op counts; no reviewed content overwritten |
| import-finalize | importId, expectedDraftRevision | finalized import summary, draftRevision; or structured conflicts without partial finalization |
| review | entryId, expectedEntryRevision positive integer, expectedDraftRevision, original, definitionVi nullable, review pending/approved/rejected, answerEligible boolean, category common/regional/technical/less-common/excluded, rationale ≤2000, exclusionChecks covering names/abbreviations/offensive/malformed/unverified | new immutable revision, draftRevision |
| rights-review | sourceId, expectedDraftRevision, decision, evidence ≤4000, obligations ≤4000 | rightsReviewId, draftRevision |
| select-answer | accent-preserving NFC normalized Vietnamese spelling, length 3/5/7/9, entryRevisionId, expectedDraftRevision | selection, draftRevision |
| configuration | expectedDraftRevision, attemptLimit integer 1–12 | draft configuration/version, draftRevision; not live yet |
| publication-preview | expectedDraftRevision | buildId, content hash, per-level guess/answer counts, validation errors, configuration, source/attribution summary; at most 100 errors plus total count |
| publish | buildId, expectedDraftRevision, expectedCurrentReleaseId UUID or null | releaseId, configurationId, payload hash, publishedAt, current pointer revision |

- Listing cursors encode the filter fingerprint and last (created_at,id); validate them as untrusted and bind to the original filters. Cap cursor length, list text fields, and history sizes. Aggregate coverage is computed in the database, not by sending every candidate to the browser.
- Ordinary requests max 64 KiB; import operations max 512 KiB document plus 8 KiB envelope. Responses max 1 MiB; lists/history use projections and pagination. Public release cap is separate below. Reject streamed oversize bodies before full parse; Content-Length alone is insufficient.
- HTTP mapping: 400 INVALID_INPUT/INVALID_CURSOR/UNSUPPORTED_SCHEMA; 401 UNAUTHORIZED; 403 ORIGIN_DENIED; 404 NOT_FOUND; 409 REVISION_CONFLICT/IDEMPOTENCY_CONFLICT/IMPORT_CONFLICT; 413 PAYLOAD_TOO_LARGE; 422 VALIDATION_FAILED/RIGHTS_UNRESOLVED/RELEASE_INCOMPLETE; 429 RATE_LIMITED with Retry-After; 503 TEMPORARILY_UNAVAILABLE. Duplicate normalized guesses in imports are reported as collisions, not conflated with source identity conflicts.
- Mutations atomically insert/lock idempotency records with normalized request hash (excluding requestId). Same key/operation/hash returns original success even if expected revision is now stale; different content returns 409. Failed validation commits no mutation receipt; retries can revalidate. Keep successful receipts for audit retention. Do not automatically retry non-idempotent requests.
- Atomic database-backed fixed-window limits: 120 private reads/minute, 30 preview calls/minute, 20 import chunk applies/minute, 30 editorial mutations/minute, and 5 publication attempts/minute per shared admin role. Also limit authorization failures to 30/minute per trusted gateway IP when available; never trust an arbitrary forwarded header. Store keyed hashes of network identifiers, no raw tokens. Unauthorized requests do not create dictionary/import/audit mutations; rate-limit bookkeeping is separate. Return 429 consistently across Edge instances.
- Browser mutation handling catches errors, refreshes stale views after conflicts, and invalidates affected Query keys only after success. Never blindly overwrite on 409. Token failure removes private cache and returns to login. Retry transient errors using the same mutation idempotency key.

### Atomic publication and public release contract

- Preview builds from a consistent database snapshot and immutable referenced revisions. Validate all rights/eligibility/provenance, exclusions, definitions, supported characters/lengths, selected collisions, membership, config bounds, and at least one answer and guess for each level. No unresolved import is included.
- Public payload fields: `schemaVersion: 1`, `normalizerVersion: vi-nfc-v2`, `releaseId`, `configurationId`, `attemptLimit`, `levels` containing exactly keys 3/5/7/9, and `attributions`. Each level has lexically sorted unique `guesses: string[]` and `answers` sorted by normalized spelling, each containing `id`, `original`, `normalized`, `level`, `definitionVi`, `attributionIds`. Attribution records contain public ID, source name/entry URL/sense reference, artifact revision, license name/version/URL, required credit/history links, and modification notice. Use one linked attribution per contributed meaning/source as needed.
- No more than 20,000 guesses and 2,000 answers per level, at most 2 MiB serialized public payload overall. Enforce caps at preview and publish; explain oversized releases and require explicit editorial scoping rather than silent truncation. These conservative caps support localStorage snapshots; storage quota failure still remains recoverable.
- Publication transaction locks the draft and current pointer, checks preview draft revision, expected current release, build hash, and all validation conditions, inserts the complete immutable public release, updates the singleton pointer, appends the publication event and idempotency result, then commits. Concurrent mutations/publications produce 409; failed transactions expose neither the new row nor pointer. Edge request timeout after commit is recovered via the same idempotency key.
- Player loading reads the current pointer then fetches the immutable referenced release through browser PostgREST using SELECT only. If pointer changes between requests, the referenced retained release is still consistent; recheck current pointer before starting a new round and retry if it changed. No mixed table/page assembly. Validate the full public payload and hash before caching/selection.
- A new round requires successful online pointer/release validation, including replay. An active round never changes from Query refetches. Offline resume uses only its valid saved snapshot; cached Query data alone cannot start a new offline round. If the current pointer changes immediately after successful validation, the round stays pinned to the release observed at start; linearizing every browser click with publication is outside this casual scope.

### Versioned local round snapshot

- One feature-owned localStorage key `vtv:round:v1` contains a strict schemaVersion 4 envelope. Save the round, its snapshot, and the streak together in one atomic write. Maximum serialized save is 3 MiB; bound input before parse and arrays before allocating Sets. Catch storage access, parsing, serialization, randomness, and remote calls.
- The current envelope contains schema version 4, normalizer version vi-nfc-v2, a save timestamp, local revision, snapshot, round, and streak metadata. Snapshot contains releaseId, configurationId, level, attemptLimit, selected full public answer entry, complete level guess membership, and attribution records referenced by that answer. Round contains id, matching release/configuration/answer IDs, level, attemptLimit, raw editable input, accepted guesses with UUID/raw input/normalized spelling/feedback/submittedAt, status, startedAt, updatedAt, endedAt nullable. These are the gameplay document's domain fields with configurationId mapped consistently to configVersion.
- Restore validates schema/version, UUIDs/timestamps and ordering, configured bounds, valid distinct membership, selected answer membership and level, definition/attribution completeness, matching identifiers, and accepted guess count ≤ attempt limit. Re-normalize each raw input, check membership and disabled-letter legality against prior guesses, and recompute feedback sequentially. Require unique guess IDs, no accepted guess after a terminal outcome, and consistent endedAt. Recompute status/keyboard from history; persisted feedback/status are derived hints and cannot override the recomputed values. Invalid structural history is not repaired into a different round.
- A coherent restored snapshot is sufficient even when its release is no longer current. No network verification, secrecy, or tamper-proof claims; local editing can cheat in this casual game. An unreadable or incompatible round shows the reason and offers one New Round action. The previous save is replaced only after a valid new round starts.
- The reader supports older save versions 1 through 3 with their historical rules. An old snapshot without sufficient result history starts both streak counters at zero. The normalizer must remain vi-nfc-v2. Keep a readable longest streak when replacing an unreadable round and leave unrelated browser storage intact.
- Persist after each accepted transition and committed editable input change; serialize writes so an older render cannot overwrite a newer revision. Storage failure keeps the current in-memory round and persistent warning that refresh recovery is unavailable. Same-device tabs use storage events to detect competing round IDs/revisions and pause persistence, offering explicit load-saved or keep-this-round choice; never silently merge histories.
- Confirm restart/level switch while playing. Build a valid new round before replacing the old save; failed loads/selections retain the old round. Finished rounds may be replayed without discard confirmation, subject to successful online release loading.

### Presentation and recovery

- Use a restrained modern gameshow direction suitable for mixed ages, without an MC or shared-screen dependency. Use deep purple background, dark purple surfaces, bright readable text, and lavender primary actions. Reserve green/yellow/gray for cell feedback. Define semantic feature tokens for surfaces, text, focus, interaction, and feedback; reuse existing component boundaries and font conventions with verified Vietnamese glyph coverage. Do not restyle unrelated games.
- Order content as title and help action, length selection, board, stable validation/result area, submit action, and conventional on-screen keyboard. Make the board the focal point; prioritize board/input on phones. Display all configured attempt rows and all selected-length cells. Accepted rows stay immutable; future rows stay empty. Avoid layout jumps when messages appear.
- Model the visible per-cell entry through one shared IME-compatible input. Begin at the first cell, append into the next cell, and have Backspace remove the last committed letter and move back. Keep IME composition separate from committed cells; do not mutate composition text, move cells prematurely, or submit the Enter event that finishes composition. Device keyboard layouts/input methods continue to work normally. Physical typing, paste, and virtual input share validation and transitions.
- Use a conventional unaccented QWERTY virtual keyboard. Main key presses enter the ordinary letter. A separately operable visible expansion indicator opens a small anchored dialog for every base letter with Vietnamese variants: A, E, I, O, U, Y, and D. Include every valid vowel-shape/tone combination, including Đ under D. The E picker includes e, è, é, ẻ, ẽ, ẹ, ê, ề, ế, ể, ễ, ệ. Variant selection appends one NFC letter to the next cell and closes the dialog. Do not add a separate tone-mark row or emulate a specific IME.
- Pickers must have an accessible name, expanded state, keyboard-operable opening/selection, contained focus while modal, Escape/outside dismissal without edits, and appropriate focus restoration. After selection, restore typing focus; after cancellation, restore focus to the opening control. Do not trap gameplay shortcuts in a picker or unrelated input. Keep expansion actions available even when the base letter is known absent, if other variants remain usable.
- The button and Enter share the round eligibility validator. Settings select mode and letter count before starting a round. Both modes validate supported characters and length. Dictionary mode additionally requires snapshot membership and blocks absent letters. Old saves restore as Dictionary mode. A dictionary-rejected complete guess retains the row, reports the reason in a stable accessible message region, and consumes no attempt. No answer feedback appears while typing.
- Green means exact accented letter and position, yellow means the exact accented letter appears elsewhere within remaining counts, and gray means absent or excess. Show non-color equivalents such as symbols and accessible state labels; unknown cells/keys remain distinguishable from absent states. Use text contrast of at least 4.5:1, visible keyboard focus, restrained announcements, reduced motion, and no horizontal overflow for a nine-letter board at narrow phone widths. Keep controls reachable when the device keyboard is open.
- Display a short instruction and open concise accent and repeated-letter examples on demand in **Cách chơi**. Cells and keys are icon-free. Give each submitted cell an accessible text state and offer visible text feedback. Show source-level attribution during play and entry-level attribution after the round.
- On victory or exhausted attempts, preserve the entire board, lock further input, and show results directly below it. Victory shows Vietnamese congratulations, selected answer's original spelling, reviewed definition, attempts used, and **Chơi lại**. Loss reveals the original answer and replay; definition on loss is optional. Attribution remains available even if the definition is omitted. Replay uses the same length and the latest validated release, selecting a different eligible answer when available. Confirm before abandoning an active round for restart/length change; cancellation restores focus and preserves all state.
- Differentiate no published release, empty/invalid level, malformed data, offline new-round request, corrupt save, and storage failure with actionable recovery. Do not fabricate definitions or select from an invalid release. Rendering definitions/provenance uses escaped text and validated HTTPS links, never imported HTML.

## Testing Decisions

- Confirmed testing seams: browser-level user journeys exercise public gameplay and admin behavior; direct Edge Function/PostgREST integration tests exercise the trusted authorization/database boundary; focused pure tests cover normalization/evaluation where UI tests cannot efficiently enumerate cases. The user approved these seams during specification review.
- Existing Vitest, Node, Playwright, Deno and disposable Supabase/SQL suites provide prior art for these seams. Extend them where observable behavior requires coverage; do not add a deployed Node/Python application server for testing.
- Good tests assert observable outcomes, persisted contracts, and denied access. Avoid component-private state, hook call order, and snapshots mirroring implementation. Use fixed synthetic Vietnamese fixtures with reviewed test definitions and dummy rights; never require live upstream downloads or production credentials.
- Pure fixtures: NFC/NFD, Đ/đ, meaningful spaces/phrases, invalid characters rejected rather than stripped, supported alphabet/lengths, distinct accented collisions, repeated letters (all green before yellow, excess gray), keyboard precedence across guesses, bounds 1/6/12 and invalid 0/13/fractions, guess rejection without attempt or feedback, no post-terminal guesses, deterministic injected random boundary selection and failure.
- Updated normalization fixtures distinguish E/Ê/Ế and D/Đ, equate NFC/NFD and uppercase/lowercase, count “tiếng Việt” as nine letters, preserve spacing-insensitive equality, and keep differently accented accepted guesses distinct. Duplicate source senses can still share an exact normalized spelling. Version tests reject the old accent-stripping contract rather than silently upgrading it.
- Browser journeys: every input method, IME composition Enter, paste disabled letters, repeated Enter/click in one turn, incomplete/not-in-dictionary guesses retaining input, win/loss/replay, selected collision definition, confirmation cancel/accept and focus, mobile nine-letter board, keyboard-only controls, feedback without color, reduced motion, offline resume/new-round refusal, other games and existing login unaffected.
- Exercise sequential fill/Backspace; disabled submission for incomplete/composing input through both click and Enter; complete dictionary rejection retaining the exact row; main-key entry versus expansion; every Vietnamese variant group including D/Đ; selection, Escape/outside cancellation, focus restoration, and absent-base/available-variant behavior. Verify no automatic help dialog, visible text feedback when enabled, inline terminal results with locked input and preserved rows, replay at the same length, and cancellation/failure during restart. Review purple-theme contrast, nine-letter layout at 320px/375px widths, keyboard-visible phone layout, non-color clues, and reduced motion. Use real Vietnamese IME smoke checks where synthetic browser composition events cannot establish OS behavior.
- Persistence tests: roundtrip, corrupt JSON, oversized save, unknown versions, missing snapshots, mismatched release/config IDs, invalid guess membership/history, tampered derived feedback recomputation, terminal-history rejection, inaccessible/quota-full storage with continued play, cross-tab conflict, and publish/configuration changes during a round followed by reload. Current release changes must affect only newly started rounds.
- Authorization integration matrix: missing/malformed/expired/future-iat/wrong-role/wrong-algorithm/bad-signature tokens; missing secrets; default gateway rejection versus configured custom-token success; CORS preflight; direct HTTP without UI; limits across multiple function instances. Assert no private side effects before successful authorization and no secrets/private notes in responses or logs.
- RLS integration: anon and real Supabase authenticated roles cannot read any private table or execute privileged routines; neither can mutate public data. Anon can read complete published releases/current pointer. Inspect payload field allowlists and default function grants. Do not test solely through the privileged role, which bypasses RLS.
- Imports/review: all limits and unknown fields, malformed/duplicate JSON keys, source mismatch, Unicode parity across runtimes, missing rights, identical retry, changed same-key payload, missing/conflicting chunks, partial staging invisibility, superseding reviewed sources without overwrite, pending reset after edits, stale revision conflicts, excluded guesses, answer-specific definition/commonness checks, collision resolution, and audit references.
- Publication: absent level, missing definition, unresolved rights/collision, oversized payload, answer outside membership, failed commit, two concurrent publishes, review/config edit during preview, pointer CAS, and response loss after successful commit. Observe that public clients see either the complete old release or complete new release and retried publication creates one release/event.
- Completion gate: relevant automated suites, strict TypeScript checking, application repository `npm run lint` and `npm run build` pass. Per owner decision, linting scripts inside skill directories is outside this release gate; document the exclusion and do not claim those scripts passed. Recheck build failures rather than assuming they are resolved. Verify deployed custom-JWT gateway/RLS behavior in staging. Report commands and failures honestly; documentation review alone establishes no runtime coverage.
- Verify actual Windows Vietnamese IME and phone software-keyboard behavior in addition to synthetic composition and responsive browser journeys. Attempt available device automation first; request owner assistance if physical device access or interaction cannot be performed. An unverified device check remains an open gate.

## Out of Scope

Player accounts, competition integrity, secret answers, rooms, multiplayer, scoring/leaderboards, realtime gameplay, timers, daily puzzles, hints, social sharing, source scraping at runtime, auto-approved imports, historical rollback/deletion controls, admin identity management, and changes to Quiz/Lucky Draw behavior.

## Further Notes

- Existing implementation and historical verification do not by themselves establish real-data clearance, staging acceptance, or production readiness. Record new evidence with its environment and scope.
- Required deployment inputs: existing Supabase browser URL/key; matching private admin JWT verification secret and privileged DB credentials in Edge configuration; approved CORS origins; function gateway configuration; applied migrations/RLS/grants. Never copy private values into public environment variables or repository fixtures.
- Required release evidence: pinned source ledger/rights decisions, reviewed coverage for all levels, import receipts, publication validation, authorization/RLS test results, lint/build/test results, and accessible browser checks.
- The configured issue tracker is local Markdown. Retain this authoritative specification and link to it from the existing implementation tickets instead of duplicating the spec. A ready-for-agent ticket may still have unresolved dependencies. This revision starts no implementation work and marks no implementation ticket resolved.

## Bổ sung — Quản lý mục từ và chuỗi thắng

Phần bổ sung này quy định hành vi cho đợt nâng cấp tiếp theo. Các quy tắc phát hành, nguồn và quyền sử dụng hiện hành tiếp tục áp dụng.

### Problem Statement

Admin cần tìm và chỉnh sửa một mục từ mà không phải chuẩn bị tệp nhập hàng loạt, đồng thời cần gỡ mục sai và khôi phục khi cần. Người chơi muốn biết mình đã thắng liên tiếp bao nhiêu ván và giữ được tiến độ khi quay lại trình duyệt.

### Solution

Mở rộng màn biên tập từ điển để tìm, thêm, sửa, gỡ và khôi phục từng mục. Cho admin xem trước tác động đến bản phát hành. Hiển thị chuỗi thắng hiện tại và chuỗi thắng dài nhất trên màn chơi, đồng thời tự động nối lại ván đã lưu.

### User Stories

1. Là admin, tôi muốn tìm theo chính tả và kết hợp các bộ lọc hiện có để tìm đúng mục từ.
2. Là admin, tôi muốn thấy mục đã gỡ trong kết quả tìm kiếm để có thể xem lịch sử hoặc khôi phục.
3. Là admin, tôi muốn thêm một từ hoặc cụm từ để bổ sung từ điển mà không cần tệp JSON.
4. Là admin, tôi muốn lưu mục mới ở trạng thái chờ duyệt để có thể bổ sung định nghĩa sau.
5. Là admin, tôi muốn chọn nguồn tự biên soạn đã xác nhận quyền sử dụng hoặc nguồn bên ngoài tương ứng để giữ thông tin xuất xứ.
6. Là admin, tôi muốn thấy các mục có cùng chính tả chuẩn hóa trước khi thêm để có thể sửa mục cũ, khôi phục mục đã gỡ hoặc chủ động thêm nghĩa khác.
7. Là admin, tôi muốn sửa chính tả và định nghĩa, rồi xem các phiên bản trước để kiểm tra thay đổi.
8. Là admin, tôi muốn tắt quyền làm đáp án của một mục mà vẫn giữ từ đó trong danh sách được phép đoán.
9. Là admin, tôi muốn gỡ mục khỏi cả danh sách được phép đoán và danh sách đáp án ở lần phát hành tiếp theo.
10. Là admin, tôi muốn khôi phục một mục đã gỡ về trạng thái chờ duyệt để kiểm tra lại trước khi phát hành.
11. Là admin, tôi muốn xem trước thay đổi giữa bản đang dùng và bản dự kiến phát hành để phát hiện từ bị gỡ hoặc mức chơi bị thiếu đáp án.
12. Là admin, tôi muốn tiếp tục nhập hàng loạt để xử lý các bộ từ lớn theo quy trình hiện có.
13. Là người chơi, tôi muốn ván đang chơi tiếp tục dùng bản từ điển lúc bắt đầu để các lượt đã đoán vẫn nhất quán.
14. Là người chơi, tôi muốn thấy chuỗi thắng hiện tại và chuỗi dài nhất tính chung cho cả bốn độ dài để theo dõi thành tích.
15. Là người chơi, tôi muốn tự động quay lại đúng ván sau khi tải lại, rời trang hoặc đóng trình duyệt để tiếp tục giữ chuỗi.
16. Là người chơi, tôi muốn mỗi ván thắng chỉ cộng một lần để tải lại trang hoặc mở thêm tab không làm sai thành tích.
17. Là người chơi, tôi muốn biết trước khi một ván mới thay thế ván đang chơi rằng chuỗi hiện tại sẽ về 0.
18. Là người chơi, tôi muốn ván và chuỗi đang có được giữ nếu quá trình mở ván khác thất bại.
19. Là người chơi, tôi muốn được thông báo ngay cạnh nút chơi khi bản lưu lỗi để có thể bắt đầu ván mới bằng một thao tác và giữ kỷ lục còn đọc được.

### Implementation Decisions

- Tận dụng luồng biên tập, kiểm tra nguồn, duyệt, xem trước và phát hành hiện có. Các thao tác riêng tư dùng Supabase Edge Function xác thực admin, kiểm tra dữ liệu đầu vào và ghi lịch sử chỉnh sửa. Giữ các bản phát hành bất biến.
- Bắt buộc có chính tả hợp lệ ở độ dài 3, 5, 7 hoặc 9 chữ và thông tin nguồn hợp lệ. Định nghĩa có thể để trống khi tạo mục chờ duyệt. Mục được chọn làm đáp án phải có định nghĩa tiếng Việt đã duyệt.
- Dùng chính tả chuẩn hóa giữ dấu để tìm mục trùng. Nếu có nhiều nghĩa, bản phát hành có tối đa một mục đáp án cho mỗi chính tả. Khi gỡ một mục có nhiều nghĩa, phần xem trước phải cho biết chính tả đó còn được phép đoán qua mục khác hay không. Để gỡ toàn bộ chính tả, admin gỡ các mục còn đủ điều kiện mang chính tả đó.
- Tách hành vi gỡ mục khỏi hành vi tắt quyền làm đáp án. Khi khôi phục, mục quay lại chờ duyệt. Trạng thái và thay đổi chỉ ảnh hưởng tới ván mới sau khi bản phát hành được công bố thành công.
- Phần xem trước đối chiếu bản dự kiến với bản đang dùng, thể hiện từ được thêm hoặc gỡ khỏi danh sách đoán, thay đổi ở đáp án và độ phủ từng mức. Nếu kiểm tra hoặc phát hành thất bại, bản đang dùng vẫn phục vụ ván mới.
- Chuỗi lưu cục bộ theo trình duyệt và dùng chung bốn độ dài. Thắng cộng một vào chuỗi hiện tại và cập nhật kỷ lục nếu vượt. Thua hoặc bỏ ván đưa chuỗi hiện tại về 0. Việc bỏ ván áp dụng cả trước lượt đoán đầu tiên.
- Tự khôi phục ván hợp lệ trong quá trình tải, gồm bản từ điển của ván, độ dài và tiến độ đã lưu. Báo nhẹ cạnh bàn chơi, giữ tiêu điểm và tránh hộp thoại. Mở ván khác khi một ván hợp lệ đang diễn ra vẫn dùng xác nhận hiện có. Chỉ ghi nhận bỏ ván khi ván thay thế bắt đầu thành công.
- Với bản lưu lỗi, tự thử khôi phục. Nếu thất bại, hiển thị lý do và tác động đến chuỗi cạnh nút **Chơi ván mới**. Bấm nút là đủ để thay bản lưu nếu mở ván thành công. Đặt lại chuỗi hiện tại và giữ kỷ lục còn đọc được.
- Chỉ dùng lịch sử cũ để tính chuỗi khi có thể xác định đúng kết quả và thứ tự. Khi thiếu dữ liệu để tính, bắt đầu từ 0. Dùng cơ chế đồng bộ lưu ván giữa các tab để áp dụng mỗi kết quả đúng một lần và tránh ghi đè thành tích khi xảy ra xung đột.

### Testing Decisions

- Kiểm tra qua hai điểm vào hiện có là giao diện admin và giao diện chơi. Các bài kiểm thử khẳng định hành vi nhìn thấy được như trạng thái, kết quả tìm kiếm, bản phát hành và chỉ số sau khi tải lại.
- Mở rộng Playwright dựa trên bài kiểm thử biên tập, phát hành và gameplay. Bao phủ thêm mục hợp lệ, trùng chính tả, khác nghĩa, gỡ, khôi phục, bản xem trước, phát hành và việc ván đang chơi giữ bản cũ.
- Dùng bộ kiểm thử HTTP và SQL từ điển hiện có để kiểm tra quyền admin, kiểm tra dữ liệu, lịch sử, tính nhất quán khi thao tác đồng thời và việc bản đang dùng vẫn hoạt động nếu phát hành thất bại.
- Dùng bộ kiểm thử lưu ván và nhiều tab hiện có để bao phủ chuỗi qua các độ dài, thắng hoặc thua, bỏ ván trước lượt đoán đầu tiên, tải lại, bản lưu lỗi, mở ván mới thất bại, dữ liệu cũ và kết quả được ghi đúng một lần. Kiểm tra trên giao diện rằng khôi phục tự động không lấy tiêu điểm và thông báo lỗi có bước tiếp theo.

### Out of Scope

- Thay đổi Quiz và Lucky Draw, tài khoản người chơi, đồng bộ thành tích giữa thiết bị, thử thách hằng ngày, xếp hạng và nhiều người chơi.
- Xóa vĩnh viễn lịch sử biên tập, xóa bản phát hành đã công bố và thay đổi yêu cầu xác nhận quyền đối với dữ liệu có thật.

### Further Notes

- Ví dụ, từ chuỗi hiện tại 11 và dài nhất 21, khôi phục ván giữ 11 và 21, thắng ván đó cho 12 và 21, còn thua hoặc bỏ ván cho 0 và 21.
- Bản bổ sung mô tả công việc triển khai và điều kiện nghiệm thu. Chưa ghi nhận kết quả kiểm thử cho các chức năng mới.
