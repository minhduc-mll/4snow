# Ticket 10 verification — 2026-11-14

Historical rounds now persist at `vtv:round:v1` as one schemaVersion 1 / vi-nfc-v2 envelope, bounded at 3 MiB. Restore validates public provenance and chosen-level membership, references, timestamps, revisions and sequential accepted inputs. Feedback/status/keyboard evidence are rebuilt from inputs. Invalid or incompatible saves remain untouched until the player explicitly deletes the feature save. Storage failures retain playable memory state with a persistent warning.

Writes happen synchronously at the committed transition boundary. Rejected inputs and provisional IME drafts do not write. New/replay rounds still validate the current online release; a failed replacement retains the historical round. Cross-tab conflict choices remain ticket 11.

The public player shell is prepared through `/vtv-round-worker.js`, scoped to `/vua-tieng-viet`. Only the public player document, same-origin Next static assets and the two locale files are cached. Dictionary/API/admin requests are excluded. Offline readiness is explicit; cache denial/quota failures cannot replace successful online responses. Existing language preference reads now fall back safely so denied localStorage access cannot prevent the recovery UI from mounting.

## Checks

- `npm.cmd test`: 48 Node tests and 2 Vitest tests passed, including historical save and cache failure regressions.
- `npm.cmd run test:browser`: 33 passed; 2 skipped. The production-only offline case runs separately below; the optional native IME check remains ticket 09's manual requirement.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run lint`: passed. An earlier concurrent lint attempt raced Playwright's replacement of `test-results`; the sequential rerun passed.
- `npm.cmd run build`: passed with synthetic public Supabase fixture settings, no production credentials or environment file edits. Existing Google font downloads required network access.
- `npx.cmd playwright test --config playwright.offline.config.ts`: 1 passed, exit 0. Real `context.setOffline(true)` followed by refresh restores the raw input, finishes the saved round, and refuses replay offline. The task-owned production test server needed explicit shutdown after the test to release Playwright's output pipe.

The first fully offline development refresh exposed Next dev's HMR hydration dependency. This is why the real offline check uses the production build, while normal browser journeys keep using the established development configuration.

Reproduce the production check in PowerShell:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='https://test-supabase.invalid'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key'
$env:NEXT_PUBLIC_VTV_IMPORT_ENABLED='true'
npm.cmd run build
npx.cmd playwright test --config playwright.offline.config.ts
```

Offline recovery requires a previously prepared page on a secure origin (HTTPS or localhost), supported service workers, and available browser storage. The UI reports preparation failure; eviction or explicit browser data clearing can remove cached assets/saves. No release or rights-clearance claims follow from synthetic local tests.

## Standards

Independent review found one cache failure handling issue: cache denial/quota could interfere with a successful online response. Fixed by separating network success from best-effort cache writes; the public fetch adapter regression passes. Final review: 0 remaining findings.

## Spec

Independent review found literal fully offline refresh was initially missing. Added the scoped public shell and a real offline production journey. Final review: 0 remaining findings. The additional readiness paragraph uses a plain polite live region, preserving the existing gameplay status region.

Totals: Standards 0 remaining (one fixed storage handling issue); Spec 0 remaining (one fixed offline shell gap).
