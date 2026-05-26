# Greenroom Settlement — Thinking Framework

---

## 1. Problem Space

### What is Settlement

Settlement is the post-show process where the venue and artist split revenue. It's not an arithmetic problem — it involves contract interpretation, multi-party trust, a high-pressure conversation at 2am, and an agent's review the next morning.

Four stakeholders, four perspectives:

- **Mariana (Booker)**: The person doing the settlement at 2am. Primary product user. Currently uses Google Sheets because the tool can't handle most of her deals.
- **Diego (Tour Manager)**: Represents the artist at the table. Needs to verify every number before signing. Drives overnight to the next city — can't come back if the math was wrong.
- **Marcus (GM)**: Final signature before money moves. Reviews settlements half-asleep from his couch. Cares about agency relationships and the venue's lease renewal in March 2027.
- **Sarah Kim (Agent)**: Reads the settlement report the next morning. Her trust in the venue's operations directly affects whether she routes premium shows there.

### Four Core Problems

Identified through CEO memo, dispute thread, four stakeholder interviews, and direct database queries:

**A. Tool Capability Gap**
- Only supports Flat and % of Gross deal types
- 63% of shows can't be settled in-app
- 82% of customers bypass the tool entirely and use Google Sheets
- This is a blocker — not "hard to use," but "impossible to use"

**B. Untrustworthy Data**
- Structured fields (deal_type, percentage, guarantee) frequently don't match freetext descriptions
- 22 basis mismatches (freetext says gross, system says net), 1 percentage mismatch (show_0005: prose says 85%, struct says 75%), 1 deal type mislabel (show_0001: prose describes Vs, struct says percentage_of_net)
- Root cause: Mariana records deals as prose because structured fields can't model the actual deals. But the system only reads structured fields.
- Implication: even if the tool supported Vs deals, it would calculate from wrong inputs

**C. Settlement is Opaque**
- No audit trail, no traceability, no shared view between parties
- Agents have questions about 25% of settlements; 10% escalate to multi-day email threads
- Diego: "If I can't see how you got to the number, I'm not signing"
- Sarah Kim's three qualities of a good settlement: Itemization, Provenance, Tone

**D. Disputes Are Frequent and Unresolved**
- Vs deal dispute rate: 6.9% — six times higher than Flat (1.1%)
- Daniel Hwang/WME: 6 repeated marketing recoup disputes — a systemic pattern
- Multiple paid settlements still carry disputed recoups
- 22 disputed settlements have positive sign-off text ("Looks good") — data contradicts itself

**Causal Chain:**
```
A. Can't use the tool
    ↓
B. Even if it worked, inputs are wrong
    ↓
C. Even if inputs were right, nobody trusts the output
    ↓
D. Trust breaks down → disputes → lost relationships ($80K/year)
```

---

## 2. Prioritization

### Core Insight: The Problem Isn't "Settling at 2am" — It's That All the Prep Work Gets Pushed to 2am

| Task | Must wait until after the show? |
|------|-------------------------------|
| Interpret deal terms | No — can be done Wednesday |
| Identify data conflicts | No — can be flagged Wednesday |
| Gather expenses | No — most can be pre-loaded |
| Get final box office numbers | Yes — must wait until show ends |
| Run the calculation | Instant once inputs ready |
| Walk TM through line-by-line | If pre-reviewed, just confirmation |

Validated by Diego: "If I could pre-review settlement on phone during load-out, conversation would be 10 minutes instead of 45."

### The Slice We Chose

**Transparent settlement worksheet with freetext parsing** — turn what Mariana currently does manually in Google Sheets into a transparent, trustworthy in-product experience.

Four components:
1. **Parser reads freetext → extracts structured terms + flags data conflicts** (solves B, prevents D)
2. **Calculation engine handles all 5 deal types including Vs** (solves A)
3. **Line-by-line "show your work" — every number traceable to its source** (solves C)
4. **"Needs review" on shows list shifts awareness upstream**: data conflicts and amount mismatches visible on Wednesday, not discovered at 2am Friday

### What We Cut and Why

| Direction | Why We Cut It |
|-----------|--------------|
| Dispute resolution workflow | Downstream. If settlement is transparent, most disputes don't happen. Coastal Spell's root cause was "no canonical version of the deal" — parsing fixes that. |
| Agent-side collaboration interface | Different user, different auth model. Venue-side first. |
| Full pre-show prediction system | Parser warnings ARE the MVP prediction. A data conflict fired Wednesday is telling Mariana what breaks Friday. |
| Expense auto-collection | Data source integration problem, not settlement experience problem. |
| LLM-based parser | Regex handles all seed data patterns. Zero latency, no API key. LLM is the production path — interface is swappable. |

---

## 3. Design & Implementation

### Technical Approach

**Freetext Parser** (`lib/parseDeal.ts`):
- Regex extracts: deal type, guarantee, percentage, basis, expense cap, hospitality cap, walkout/ratchet flags, freetext bonuses
- Cross-references against structured fields to generate 7 warning types
- Prototype: regex (deterministic, zero latency, no API key)
- Production: Claude API with regex as fast-path fallback for ~70% of notes that follow standard templates. LLM handles abbreviations ("$12k"), written-out numbers ("eighty-five percent"), and semantic ambiguity ("marketing recoup: inside or outside cap?")

**Calculation Engine** (`lib/dealMath.ts`):
- All 5 deal types: flat, vs (gross and net basis), % of net, % of gross, door
- Vs formula: `max(guarantee, percentage × basis)` where basis is gross or (gross - fees - capped_expenses)
- Every step annotated with source (ticket_sales / expenses / deal_terms / calculated)
- Bonus evaluation (gross threshold, sellout, attendance)
- `quickCheckAmountMismatch()` for lightweight list-page amount verification

**Settlement Page** (`app/shows/[id]/settle/page.tsx`):
- Deal terms card: parsed terms alongside original freetext
- Warning cards (amber for data issues, rose for disputes)
- Line-by-line worksheet with source labels
- 72px hero number for artist payout
- Amount verification: calculated vs recorded, difference callout
- Complex deals: "Approximate — verify manually" badge
- Voided: strikethrough + "No payment was made"

**Warning Surface** (shows list + show detail):
- "Needs review" stat card with count, one-click filter, row-level badges
- Show detail: warning banner with pill tags

### "Needs Review" — Definition and Count

A show is flagged if ANY of these are true:
1. **Data conflict** — freetext contradicts system fields (percentage, deal type, basis, or guarantee)
2. **Complex deal** — walkout pot or tier ratchet present; base calculation only
3. **Amount mismatch** — calculated payout ≠ recorded `totalToArtist` (diff > $1)
4. **Disputed or revised** — settlement in active dispute or under revision

Deduplication: set union. Each show counted once.

**Excluded:** expenses over cap (149 shows) and hospitality over cap (35 shows) — operational facts, not data problems. Including them inflated the count to 196; the current 115 is the right signal-to-noise ratio.

**Current count: 115 / 500 shows.**
```
Independent counts:
  A. Data conflict:    23
  B. Complex deal:     53
  C. Amount mismatch:  77
  D. Disputed:         20
  E. Revised:           1

Set union: 23 → 54 → 105 → 115 → 115

Key overlap: A∩C = 23 (all data conflicts also have amount mismatches —
if the terms are wrong, the recorded payment is wrong too)
```

**Why amount mismatches exist:** The database's `totalToArtist` was calculated using structured fields (often wrong). Our engine uses freetext-parsed terms (more accurate). Example: show_0001 (Wet Cement) — system calculated as % of net = $640; freetext says vs deal with $3,500 guarantee floor → we calculate $3,500. The $2,860 gap is because the original used the wrong deal type.

### Data Breadcrumbs

Database queries revealed intentional data quality issues that validated our approach:

- **#5 Hospitality overrun** (35 shows): expenses exceed cap, nothing absorbed by venue
- **#6 Percentage drift** (show_0005 Winter Circle): prose says "85/15 split on net (was 75/25)", struct says 75%. Our parser uses 85%.
- **#9 Deal type mislabel** (show_0001 Wet Cement): freetext describes "$3,500 guarantee vs 85% of net", struct says percentage_of_net. Our parser overrides to vs deal.
- **Basis mismatch** (22 shows): freetext says "of gross", system says "of net" — changes calculation dramatically
- **Amount mismatch** (show with "85% of gross"): system recorded $1,329 (calculated as % of net after expenses); correct calculation is $2,650 (85% × gross, no expense deduction). Venue underpaid artist $1,321.

---

## 4. Deliverables

- [x] Forked GitHub repo with working prototype
- [x] MEMO.md — PRD for transparent settlement worksheet (~2 pages)
- [x] IMPLEMENTATION-SPEC.md — Technical spec with warning logic, breadcrumbs, file summary
- [x] build-session-log.md — Claude Code session log (17 prompts across exploration, design, implementation)
- [x] CLAUDE.md — Project instructions for future sessions
- [x] Clean clone test passed
- [ ] 5-10 minute Loom walkthrough

## 5. Loom Outline

1. **Opening (1 min)**: "I chose to build a transparent settlement worksheet. The goal: turn the 2am settlement from a 45-minute black box into a 10-minute transparent confirmation."
2. **Problem Space (2 min)**: Four core problems, causal chain. Key data point: 63% of deals unsupported, structured fields contradict freetext.
3. **Core Insight (1 min)**: The pain isn't settling at 2am — it's that all prep work gets pushed to 2am. Parser warnings on Wednesday = knowing what breaks Friday.
4. **Demo Walkthrough (4 min)**:
   - Shows list: "Needs review" filter (115 shows), click to see only problematic ones
   - Pick a vs deal: line-by-line worksheet, source annotations, "Percentage wins"
   - Pick show_0005 (Winter Circle): percentage mismatch warning (85% vs 75%), parser uses correct value
   - Pick a show with amount mismatch: calculated vs recorded callout, explain why they differ
   - Voided settlement: strikethrough, "No payment was made"
5. **What I Cut and Why (1 min)**: Dispute resolution (downstream), agent UI (different user), LLM parser (regex for now, LLM in production)
6. **What's Next (1 min)**: LLM parser for real-world notes, severity tiers for warnings, walkout/ratchet calculation, bidirectional data trust
