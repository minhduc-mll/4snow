# Shared Feature Requirements

## Purpose

This file contains only cross-feature product requirements that apply to both Lucky Draw and Quiz.

Do not duplicate rules already defined in `AGENTS.md`. Do not place feature-specific logic here.

## Shared Rules

- Only authenticated admins can manage feature configuration and results.
- Persisted feature data is stored in Supabase.
- Each feature owns its own tables, domain models, state, validation, and UI flow.
- Shared components and utilities must stay generic and must not contain Lucky Draw or Quiz business logic.
- Use the existing design system and component structure defined in `AGENTS.md`.
- Feature-specific schemas, API contracts, error cases, persistence details, and acceptance criteria must live in the relevant feature document.

## Conflict Resolution

When documents overlap, use this order:

1. `AGENTS.md` for global implementation rules.
2. The target feature document for feature-specific behavior.
3. `shared.md` for cross-feature product rules not covered elsewhere.
4. `FEATURE.md` for navigation only.

## Lucky Draw Exception Note

Lucky Draw requires server-side winner generation in a Supabase Edge Function. This exception should be documented explicitly in `AGENTS.md` or followed from `lucky-draw.md` before implementation.
