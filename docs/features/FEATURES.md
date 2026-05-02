# FEATURE.md - Product Feature Index

## Purpose

This file is only an index for feature requirements. Keep detailed business logic, database schemas, API contracts, validation rules, UI flows, and animation rules inside each feature document.

## Reading Order for Codex

For any implementation task, read:

1. `AGENTS.md`
2. `docs/features/shared.md`
3. The target feature document

Examples:

```txt
AGENTS.md
docs/features/shared.md
docs/features/lucky-draw.md
```

```txt
AGENTS.md
docs/features/shared.md
docs/features/quiz.md
```

## Feature Documents

| Feature    | Requirement Document          |
| ---------- | ----------------------------- |
| Lucky Draw | `docs/features/lucky-draw.md` |
| Quiz       | `docs/features/quiz.md`       |

## Feature Boundaries

Lucky Draw and Quiz are separate domains. Do not mix their models, state, UI flows, tables, or business logic unless a future cross-feature requirement explicitly says so.

Feature-specific requirements belong in the feature document. Shared rules belong in `shared.md` only when they apply to more than one feature and are not already covered by `AGENTS.md`.

## Important Note

Lucky Draw requires server-side winner generation in a Supabase Edge Function. If this conflicts with a general client-only rule in `AGENTS.md`, add an explicit Lucky Draw exception to `AGENTS.md` before implementation. Do not move winner generation into the browser.

## Maintenance

Update this file only when adding, removing, renaming, or moving feature requirement documents.
