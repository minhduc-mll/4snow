# AGENTS.md — AI Execution Rules (Strict Mode)

## 1. Purpose

Defines non-negotiable rules for AI agents.

- Follow all rules exactly
- Do not improvise beyond constraints
- This document overrides conflicting instructions

---

## 2. Architecture Constraints

<!-- ### Client-Only System

- ALL logic runs in browser
- NO server-side logic -->

### Forbidden

- Next.js API routes
- Route handlers
- Server Actions
- Node.js / Python servers
- ORMs (Prisma, Drizzle)
- Server-side DB clients

### Allowed

- localStorage / sessionStorage / IndexedDB
- Supabase (browser-safe):
  - Auth, Realtime, Storage, PostgREST
  - Edge Functions (restricted use)

### Edge Functions

Use ONLY for:

- fairness validation
- rate limiting
- audit integrity

Must be:

- stateless
- no secrets exposed

---

## 3. Tech Stack

- Next.js App Router
- TypeScript (strict)
- Tailwind + Shadcn/ui
- TanStack Query (server state)
- Zustand (UI state only)
- Framer Motion (minimal)
- lucide-react
- xlsx (browser only)

---

## 4. TypeScript Rules

- NEVER use `any`
- Use `unknown`, unions, narrowing

MUST define:

- props types
- domain models
- API responses

---

## 5. React Rules

- Functional components only
- Logic in hooks
- Separate UI vs logic
- Memoize subscriptions

---

## 6. Component System

### Structure

- atoms/
- molecules/
- organisms/

### Atom Rule

- MUST wrap Shadcn components
- MUST NOT use raw HTML if equivalent exists

### Import Rule

- ALWAYS import from atoms/molecules
- NEVER import from ui/ directly

---

## 7. State Management

### TanStack Query

- Source of truth
- Use invalidation

### Zustand

ONLY for:

- UI state
- animation
- local interaction

FORBIDDEN:

- storing server data

---

## 8. Realtime Rules

### Channels

- Host
- Participant
- Leaderboard

### Rules

- DO NOT broadcast every action
- DO broadcast aggregated state
- Throttle: 250–500ms
- Avoid animation spam

---

## 9. Time Sync

- Use:
  - startedAt
  - duration

- DO NOT rely on setTimeout

---

## 10. Security

- NEVER trust client input
- Validate all inputs

Supabase:

- RLS REQUIRED
- anon/user keys only
- NEVER expose service keys

---

## 11. Data Integrity

- Prefer append-only data
- MUST store:
  - timestamps
  - inputs
  - outputs
  - config

---

## 12. Performance

- Target 60fps
- Virtualize large lists
- Avoid unnecessary re-renders

---

## 13. Error Handling

MUST wrap:

- parsing
- random logic
- storage
- edge calls

Use try-catch

---

## 14. Workflow

1. Plan (pseudo-code + types)
2. Implement within constraints
3. Clean (no logs, no dead code)
4. Verify (build + lint pass)

---

## 15. Exceptions

Allowed ONLY if:

- necessary
- documented

NEVER break:

- client-only architecture
- security rules
- type safety
