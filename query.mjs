import { createClient } from "@libsql/client";
const db = createClient({ url: "file:./data/greenroom.db" });

// 1. List all tables
const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
console.log("=== TABLES ===");
console.log(tables.rows.map(r => r.name).join(", "));

// 2. Show 5 deals: freetext vs structured fields
console.log("\n=== DEALS: freetext vs structured (5 examples) ===");
const deals = await db.execute(`
  SELECT d.id, d.deal_type, d.guarantee_amount, d.percentage, d.percentage_basis,
         d.expense_cap, d.hospitality_cap, d.deal_notes_freetext, d.bonuses_json,
         s.date, a.name as artist
  FROM deals d
  JOIN shows s ON d.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
  WHERE d.deal_notes_freetext IS NOT NULL AND d.deal_notes_freetext != ''
  LIMIT 5
`);
for (const row of deals.rows) {
  console.log(`\n--- ${row.artist} (${row.date}) ---`);
  console.log(`  deal_type: ${row.deal_type}`);
  console.log(`  guarantee: $${row.guarantee_amount}, pct: ${row.percentage}%, basis: ${row.percentage_basis}`);
  console.log(`  expense_cap: $${row.expense_cap}, hospitality_cap: $${row.hospitality_cap}`);
  console.log(`  bonuses_json: ${row.bonuses_json}`);
  console.log(`  FREETEXT: ${row.deal_notes_freetext}`);
}

// 3. Settlements where status is "disputed" but signoff_text sounds positive
console.log("\n=== BREADCRUMB: Disputed status but positive signoff ===");
const disputed = await db.execute(`
  SELECT se.id, se.status, se.signoff_text, se.notes, s.date, a.name as artist
  FROM settlements se
  JOIN shows s ON se.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
  WHERE se.status = 'disputed' AND se.signoff_text IS NOT NULL AND se.signoff_text != ''
`);
for (const row of disputed.rows) {
  console.log(`\n  ${row.artist} (${row.date}): status=${row.status}`);
  console.log(`  signoff: "${row.signoff_text}"`);
  console.log(`  notes: "${row.notes}"`);
}

// 4. Percentage drift: prose vs structured
console.log("\n=== BREADCRUMB: Percentage mismatch (prose vs struct) ===");
const allDeals = await db.execute(`
  SELECT d.id, d.deal_type, d.percentage, d.deal_notes_freetext, a.name as artist, s.date
  FROM deals d
  JOIN shows s ON d.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
  WHERE d.deal_notes_freetext LIKE '%85%' AND d.percentage != 85
     OR d.deal_notes_freetext LIKE '%75%' AND d.percentage != 75
  LIMIT 10
`);
for (const row of allDeals.rows) {
  console.log(`\n  ${row.artist} (${row.date}): struct pct=${row.percentage}%`);
  console.log(`  freetext: ${row.deal_notes_freetext?.substring(0, 200)}`);
}

// 5. Paid settlements with disputed recoups
console.log("\n=== BREADCRUMB: Paid settlement + disputed recoup ===");
const paidDisputed = await db.execute(`
  SELECT se.id, se.status, se.recoups_json, a.name as artist, s.date
  FROM settlements se
  JOIN shows s ON se.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
  WHERE se.status = 'paid' AND se.recoups_json LIKE '%disputed%'
`);
for (const row of paidDisputed.rows) {
  console.log(`\n  ${row.artist} (${row.date}): status=${row.status}`);
  console.log(`  recoups: ${row.recoups_json?.substring(0, 300)}`);
}

// 6. Reversed timestamps
console.log("\n=== BREADCRUMB: Reversed timestamps (signed before submitted) ===");
const reversed = await db.execute(`
  SELECT se.id, se.submitted_at, se.signed_at, a.name as artist, s.date
  FROM settlements se
  JOIN shows s ON se.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
  WHERE se.signed_at IS NOT NULL AND se.submitted_at IS NOT NULL AND se.signed_at < se.submitted_at
`);
for (const row of reversed.rows) {
  console.log(`  ${row.artist} (${row.date}): submitted=${row.submitted_at}, signed=${row.signed_at}`);
}

// 7. Deal type mismatch (prose says vs, struct says something else)
console.log("\n=== BREADCRUMB: Deal type mismatch ===");
const typeMismatch = await db.execute(`
  SELECT d.id, d.deal_type, d.deal_notes_freetext, a.name as artist, s.date
  FROM deals d
  JOIN shows s ON d.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
  WHERE (d.deal_notes_freetext LIKE '%versus%' OR d.deal_notes_freetext LIKE '%vs %' OR d.deal_notes_freetext LIKE '%vs.%')
    AND d.deal_type != 'vs'
  LIMIT 5
`);
for (const row of typeMismatch.rows) {
  console.log(`\n  ${row.artist} (${row.date}): struct type=${row.deal_type}`);
  console.log(`  freetext: ${row.deal_notes_freetext?.substring(0, 200)}`);
}

// 8. Overall deal type distribution
console.log("\n=== DEAL TYPE DISTRIBUTION ===");
const dist = await db.execute("SELECT deal_type, COUNT(*) as cnt FROM deals GROUP BY deal_type ORDER BY cnt DESC");
for (const row of dist.rows) {
  console.log(`  ${row.deal_type}: ${row.cnt}`);
}

// 9. Settlement status distribution
console.log("\n=== SETTLEMENT STATUS DISTRIBUTION ===");
const statusDist = await db.execute("SELECT status, COUNT(*) as cnt FROM settlements GROUP BY status ORDER BY cnt DESC");
for (const row of statusDist.rows) {
  console.log(`  ${row.status}: ${row.cnt}`);
}

process.exit(0);
