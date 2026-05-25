# PRD — Transparent Settlement Worksheet

Amos Sha · May 2026

---

## Problem

Greenroom's settlement tool only supports flat and percentage-of-gross deals — about 38% of a typical venue's book. The rest (versus, percentage of net, door deals) get a "not supported" screen, and the booker opens a Google Sheet. 82% of customers settle off-platform.

The deeper problem is data trust. Venues enter deal terms in two places: structured fields (deal type, percentage, guarantee) and freetext notes. These frequently disagree. A deal described as "85% of gross" in the notes might show "75% of net" in the system fields. The structured fields are what the tool reads; the freetext is what the booker actually trusts. When they conflict, the tool produces wrong numbers with full confidence.

This creates a chain reaction: opaque math erodes trust with the artist's team, disputes increase, and agents start routing shows away from venues with unreliable settlements. The CEO has identified settlement as the company's biggest craft gap and the Q1 2026 priority.

## Solution

A transparent settlement worksheet that reads deal terms from freetext, calculates all deal types, shows every step with its data source, and flags data problems before they reach the 2am settlement conversation.

### Deal Types to Support

The calculation engine needs to handle five deal structures:

**Flat guarantee.** Artist receives a fixed amount regardless of ticket sales. Simplest case — no variables.

**Versus (guarantee vs percentage).** Artist receives whichever is higher: the guaranteed amount, or a percentage of revenue. This is the most common complex type (~33% of deals) and the biggest gap in the current tool. The percentage can be against gross or net, which changes the calculation significantly.

**Percentage of net.** Artist receives a percentage of revenue after expenses are deducted. Expense caps and hospitality caps affect the deduction amount.

**Percentage of gross.** Artist receives a percentage of gross box office. No expense deduction — simpler math but riskier for the venue.

**Door deal.** Artist takes the door revenue minus fees and expenses. Common for smaller or developing acts.

Each deal type can have additional structures: expense caps, hospitality caps, bonuses (gross thresholds, sellout bonuses, attendance triggers), and complex variants like walkout pots and tier ratchets.

### Freetext Parsing

The core of the product is a parser that extracts structured deal terms from the booker's freetext notes. This is necessary because the structured fields are unreliable — the freetext is what the booker reads and trusts, and it's what the artist's agent will reference if there's a dispute.

**Prototype approach: regex.** Pattern matching covers the common deal note formats (e.g., "$5,000 vs 85% of net, expenses capped $2,000, hosp $400"). This works for structured, template-like notes and has the advantage of being deterministic, zero-latency, and requiring no API key.

**Production approach: LLM with regex fallback.** Real-world deal notes include abbreviations ("$12k"), written-out numbers ("eighty-five percent"), references to external documents ("per the deal memo"), and implicit terms that require industry knowledge. A Claude-based parser handles these cases with high accuracy. The regex parser serves as a fast path for known patterns, reducing latency and API cost for the ~70% of notes that follow standard templates. When the LLM parser detects ambiguity (e.g., "marketing recoup: inside or outside the expense cap?"), it surfaces this as a warning rather than guessing.

### Data Conflict Detection

When the parser extracts terms from freetext, it cross-references them against the structured fields and flags contradictions:

- **Percentage mismatch** — the notes say one percentage, the system records another
- **Deal type mismatch** — the notes describe a different deal structure than what's coded
- **Basis mismatch** — the notes say "of gross" but the system says "of net" (this changes the calculation dramatically)
- **Guarantee mismatch** — the guarantee amount in the notes differs from the system field
- **Amount mismatch** — the calculated payout, using the correct (freetext) terms, differs from what was actually recorded or paid

These aren't edge cases. In the prototype dataset, 23% of shows trigger at least one flag. The most common scenario: a deal was renegotiated (percentage changed, deal type changed from flat to vs), the booker updated the notes, but the structured fields were never corrected.

### Warning Surface

Warnings need to be visible before the booker reaches the settlement page. A warning buried three clicks deep is invisible. The shows list displays a "Needs review" count with a one-click filter — this is how the booker knows on Wednesday which shows will be complicated on Friday. The show detail page surfaces warnings as a banner before any other content.

### Settlement Worksheet

The settlement page itself is a transparent, line-by-line worksheet:

- Parsed deal terms displayed alongside the original freetext, so the booker can verify what the parser extracted
- Every calculation step annotated with its data source (ticket sales, expenses, deal terms, calculated)
- For versus deals: both sides shown with which one wins
- Expense breakdown by category, with cap overrun notes
- A prominent payout number designed for 2am: large, monospace, unambiguous
- When the calculated amount differs from what was previously recorded, a clear callout showing both numbers and the difference

## What We Cut

**Dispute resolution workflow.** Downstream of the root cause. The Coastal Spell dispute happened because there was "no canonical version of the deal." If deal terms are parsed, confirmed, and visible to both sides, that class of dispute doesn't happen. Prevention over resolution.

**Agent-side UI.** Different user, different auth model, different interaction pattern. The agent's need for "structured collaboration" is real but is a separate product surface. The transparent worksheet already makes the settlement statement agent-readable.

**Pre-show prediction.** The parser's warning system already functions as lightweight prediction. When a data conflict fires on Wednesday, that's telling the booker what will be messy on Friday.

## Risks

**Parser coverage.** Regex handles structured note formats. Real-world notes need the LLM parser for abbreviations, implied terms, and semantic ambiguity. The parser interface is designed to be swappable without touching UI or calculation code.

**Warning volume.** In the prototype, 23% of shows are flagged. Most are old. The list is sorted recent-first so old flags scroll off naturally. Production should add severity tiers (data conflict vs informational) and time-based de-emphasis.

**Complex deal structures.** Walkout pots and tier ratchets are flagged but not fully calculated. The base calculation still runs; the warning says "showing base terms only." Visibly incomplete is better than silently wrong. Full calculation support is a follow-on.

**One-directional freetext trust.** The parser always prefers freetext. If someone updates the system field but not the notes, we'd use stale data. Production should compare edit timestamps on both sources.
