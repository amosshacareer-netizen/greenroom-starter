# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Greenroom — settlement tool for independent music venues. Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS 4 + Drizzle ORM + libsql (SQLite). No auth — always logged in as Mariana Reyes, booker at The Crescent (Nashville, 650 cap).

## Commands

```
npm run dev              # Start dev server on :3000
npm run build            # Production build (catches type errors)
npm run lint             # ESLint (next/core-web-vitals + typescript)
npm run db:reset         # Drop DB, re-migrate, re-seed (deterministic)
npm run db:studio        # Drizzle Studio at local.drizzle.studio
```

## Architecture

- `lib/parseDeal.ts` — Regex parser extracts deal terms from `dealNotesFreetext`. Generates warnings when parsed values contradict structured fields.
- `lib/dealMath.ts` — Calculation engine for all 5 deal types (flat, vs, % of net, % of gross, door). `quickCheckAmountMismatch()` for lightweight list-page checks.
- `lib/queries.ts` — Server-side data fetching. `getAllShows()` for list page, `getShowById()` for detail/settlement.
- `db/schema.ts` — Full schema with detailed comments on each table.
- `db/seed.ts` — Deterministic 24-month synthetic dataset (501 past shows). Contains intentional data contradictions (breadcrumbs).
- `app/shows/` — Shows list with "Needs review" filter. `[id]/` for detail, `[id]/settle/` for settlement worksheet.

## Key Conventions

- **Freetext is the source of truth.** `deal.dealNotesFreetext` is what the booker trusts. Structured fields (`dealType`, `percentage`, `guaranteeAmount`) are often wrong. Parser overrides structured fields with freetext values when they conflict.
- **"Needs review" criteria:** data conflict (freetext vs structured fields) OR complex deal (walkout/ratchet) OR amount mismatch (calculated ≠ recorded) OR disputed/revised settlement. Expense/hospitality overruns are excluded — they're operational facts, not data problems.
- Path alias: `@/*` maps to project root (e.g., `@/lib/queries`, `@/db/schema`).
- UI colors: amber for warnings, rose for disputes, brand for positive states.
- All user-facing text in plain language — no "freetext", "structured field", "bonuses_json".
- Monospace tabular numerals for all monetary values.

## Data

Database at `data/greenroom.db`. Context materials at `data/ceo-memo.md`, `data/dispute-thread.md`, `data/transcripts/*.md`. The seed data is static and deterministic — `npm run db:reset` reproduces identical data.
