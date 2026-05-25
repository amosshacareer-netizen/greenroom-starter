import { createClient } from "@libsql/client";
const db = createClient({ url: "file:./data/greenroom.db" });

// 1. Total shows
const total = await db.execute("SELECT COUNT(*) as cnt FROM shows");
console.log("=== TOTAL SHOWS ===", total.rows[0].cnt);

// 2. Deal type distribution with settlement status
console.log("\n=== DEAL TYPE x SETTLEMENT STATUS ===");
const dtStatus = await db.execute(`
  SELECT d.deal_type, se.status, COUNT(*) as cnt
  FROM deals d
  JOIN shows s ON d.show_id = s.id
  LEFT JOIN settlements se ON se.show_id = s.id
  GROUP BY d.deal_type, se.status
  ORDER BY d.deal_type, cnt DESC
`);
for (const row of dtStatus.rows) {
  console.log(`  ${row.deal_type} | ${row.status} | ${row.cnt}`);
}

// 3. Dispute rate by deal type
console.log("\n=== DISPUTE RATE BY DEAL TYPE ===");
const disputeByType = await db.execute(`
  SELECT d.deal_type,
    COUNT(*) as total,
    SUM(CASE WHEN se.status = 'disputed' THEN 1 ELSE 0 END) as disputed,
    ROUND(100.0 * SUM(CASE WHEN se.status = 'disputed' THEN 1 ELSE 0 END) / COUNT(*), 1) as dispute_pct
  FROM deals d
  JOIN shows s ON d.show_id = s.id
  LEFT JOIN settlements se ON se.show_id = s.id
  GROUP BY d.deal_type
  ORDER BY dispute_pct DESC
`);
for (const row of disputeByType.rows) {
  console.log(`  ${row.deal_type}: ${row.disputed}/${row.total} (${row.dispute_pct}%)`);
}

// 4. Recoup stats
console.log("\n=== RECOUP STATS ===");
const recoups = await db.execute(`
  SELECT COUNT(*) as total_settlements,
    SUM(CASE WHEN recoups_json IS NOT NULL AND recoups_json != '[]' AND recoups_json != 'null' THEN 1 ELSE 0 END) as has_recoups
  FROM settlements
`);
console.log(`  Settlements with recoups: ${recoups.rows[0].has_recoups}/${recoups.rows[0].total_settlements}`);

const recoupDetails = await db.execute(`
  SELECT recoups_json FROM settlements
  WHERE recoups_json IS NOT NULL AND recoups_json != '[]' AND recoups_json != 'null'
`);
let totalRecoups = 0, agreedCount = 0, disputedCount = 0, withdrawnCount = 0;
let totalRecoupValue = 0, disputedRecoupValue = 0;
let recoupCategories = {};
for (const row of recoupDetails.rows) {
  try {
    const recoups = JSON.parse(row.recoups_json);
    for (const r of recoups) {
      totalRecoups++;
      totalRecoupValue += r.amount;
      recoupCategories[r.category] = (recoupCategories[r.category] || 0) + 1;
      if (r.status === 'agreed') agreedCount++;
      if (r.status === 'disputed') { disputedCount++; disputedRecoupValue += r.amount; }
      if (r.status === 'withdrawn') withdrawnCount++;
    }
  } catch(e) {}
}
console.log(`  Total recoup line items: ${totalRecoups}`);
console.log(`  Agreed: ${agreedCount}, Disputed: ${disputedCount}, Withdrawn: ${withdrawnCount}`);
console.log(`  Total recoup value: $${totalRecoupValue.toLocaleString()}`);
console.log(`  Disputed recoup value: $${disputedRecoupValue.toLocaleString()}`);
console.log(`  Recoup categories:`, JSON.stringify(recoupCategories));

// 5. Freetext vs structured field mismatches
console.log("\n=== FREETEXT vs STRUCTURED MISMATCHES ===");

// 5a. Deal type mismatch
const typeMismatch = await db.execute(`
  SELECT COUNT(*) as cnt FROM deals
  WHERE (deal_notes_freetext LIKE '%versus%' OR deal_notes_freetext LIKE '% vs %' OR deal_notes_freetext LIKE '%whichever greater%')
    AND deal_type != 'vs'
`);
console.log(`  Deal type mismatch (prose=vs, struct!=vs): ${typeMismatch.rows[0].cnt}`);

// 5b. Percentage mismatch - check for 85 in text but not 85 in struct
const pctMismatch = await db.execute(`
  SELECT COUNT(*) as cnt FROM deals
  WHERE deal_notes_freetext LIKE '%85%' AND percentage IS NOT NULL AND CAST(percentage * 100 AS INTEGER) != 85
`);
console.log(`  Percentage mismatch (prose mentions 85, struct != 85): ${pctMismatch.rows[0].cnt}`);

// 5c. Deals where freetext exists but structured fields are empty/null
const emptyStruct = await db.execute(`
  SELECT COUNT(*) as cnt FROM deals
  WHERE deal_notes_freetext IS NOT NULL AND deal_notes_freetext != ''
    AND deal_type IN ('vs', 'percentage_of_net')
    AND (guarantee_amount IS NULL OR percentage IS NULL)
`);
console.log(`  Vs/PctNet deals with missing struct fields: ${emptyStruct.rows[0].cnt}`);

// 6. Expense data
console.log("\n=== EXPENSE STATS ===");
const expenseStats = await db.execute(`
  SELECT COUNT(*) as total_expenses,
    COUNT(DISTINCT show_id) as shows_with_expenses,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    SUM(CASE WHEN absorbed_by_venue = 1 THEN amount ELSE 0 END) as absorbed_total,
    SUM(CASE WHEN absorbed_by_venue = 1 THEN 1 ELSE 0 END) as absorbed_count
  FROM expenses
`);
const es = expenseStats.rows[0];
console.log(`  Total expenses: ${es.total_expenses} across ${es.shows_with_expenses} shows`);
console.log(`  Total amount: $${Math.round(es.total_amount).toLocaleString()}`);
console.log(`  Absorbed by venue: ${es.absorbed_count} items ($${Math.round(es.absorbed_total).toLocaleString()})`);

// 6b. Expense categories
const expCat = await db.execute(`
  SELECT category, COUNT(*) as cnt, SUM(amount) as total
  FROM expenses GROUP BY category ORDER BY total DESC
`);
console.log("  By category:");
for (const row of expCat.rows) {
  console.log(`    ${row.category}: ${row.cnt} items, $${Math.round(row.total).toLocaleString()}`);
}

// 6c. Shows where expenses exceed cap
console.log("\n=== EXPENSES EXCEEDING CAP ===");
const overCap = await db.execute(`
  SELECT s.id, a.name as artist, s.date, d.expense_cap,
    SUM(e.amount) as total_expenses,
    SUM(e.amount) - d.expense_cap as overage
  FROM shows s
  JOIN deals d ON d.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
  JOIN expenses e ON e.show_id = s.id
  WHERE d.expense_cap IS NOT NULL AND d.expense_cap > 0
  GROUP BY s.id
  HAVING SUM(e.amount) > d.expense_cap
  LIMIT 10
`);
console.log(`  Shows where expenses > cap (first 10 of total):`);
for (const row of overCap.rows) {
  console.log(`    ${row.artist} (${row.date}): expenses=$${Math.round(row.total_expenses)} vs cap=$${row.expense_cap} (over by $${Math.round(row.overage)})`);
}
const overCapCount = await db.execute(`
  SELECT COUNT(*) as cnt FROM (
    SELECT s.id FROM shows s
    JOIN deals d ON d.show_id = s.id
    JOIN expenses e ON e.show_id = s.id
    WHERE d.expense_cap IS NOT NULL AND d.expense_cap > 0
    GROUP BY s.id
    HAVING SUM(e.amount) > d.expense_cap
  )
`);
console.log(`  Total shows exceeding expense cap: ${overCapCount.rows[0].cnt}`);

// 7. Hospitality cap overruns
console.log("\n=== HOSPITALITY CAP OVERRUNS ===");
const hospOver = await db.execute(`
  SELECT COUNT(*) as cnt FROM (
    SELECT s.id FROM shows s
    JOIN deals d ON d.show_id = s.id
    JOIN expenses e ON e.show_id = s.id
    WHERE d.hospitality_cap IS NOT NULL AND d.hospitality_cap > 0
      AND e.category = 'hospitality'
    GROUP BY s.id
    HAVING SUM(e.amount) > d.hospitality_cap
  )
`);
console.log(`  Shows where hospitality > cap: ${hospOver.rows[0].cnt}`);

// 8. Bonuses analysis
console.log("\n=== BONUSES ANALYSIS ===");
const bonusStats = await db.execute(`
  SELECT COUNT(*) as total,
    SUM(CASE WHEN bonuses_json IS NOT NULL AND bonuses_json != 'null' AND bonuses_json != '[]' THEN 1 ELSE 0 END) as has_structured_bonus,
    SUM(CASE WHEN deal_notes_freetext LIKE '%bonus%' OR deal_notes_freetext LIKE '%sellout%' OR deal_notes_freetext LIKE '%ratchet%' OR deal_notes_freetext LIKE '%walkout%' THEN 1 ELSE 0 END) as mentions_bonus_in_text
  FROM deals
`);
const bs = bonusStats.rows[0];
console.log(`  Deals with structured bonuses: ${bs.has_structured_bonus}/${bs.total}`);
console.log(`  Deals mentioning bonus/sellout/ratchet/walkout in text: ${bs.mentions_bonus_in_text}/${bs.total}`);

// Bonus in text but not in structured
const bonusMismatch = await db.execute(`
  SELECT COUNT(*) as cnt FROM deals
  WHERE (deal_notes_freetext LIKE '%bonus%' OR deal_notes_freetext LIKE '%sellout%' OR deal_notes_freetext LIKE '%ratchet%' OR deal_notes_freetext LIKE '%walkout%')
    AND (bonuses_json IS NULL OR bonuses_json = 'null' OR bonuses_json = '[]')
`);
console.log(`  Bonus in text but NOT in structured field: ${bonusMismatch.rows[0].cnt}`);

// 9. Settlement amounts and financial impact
console.log("\n=== FINANCIAL OVERVIEW ===");
const financials = await db.execute(`
  SELECT
    SUM(gross_box_office) as total_gross,
    SUM(total_to_artist) as total_to_artist,
    SUM(total_expenses) as total_expenses,
    AVG(total_to_artist) as avg_to_artist,
    MIN(total_to_artist) as min_to_artist,
    MAX(total_to_artist) as max_to_artist
  FROM settlements
`);
const f = financials.rows[0];
console.log(`  Total gross: $${Math.round(f.total_gross).toLocaleString()}`);
console.log(`  Total to artists: $${Math.round(f.total_to_artist).toLocaleString()}`);
console.log(`  Total expenses: $${Math.round(f.total_expenses).toLocaleString()}`);
console.log(`  Avg payout to artist: $${Math.round(f.avg_to_artist).toLocaleString()}`);

// 10. Daniel Hwang pattern - how many disputes involve his artists?
console.log("\n=== DANIEL HWANG / WME PATTERN ===");
const hwang = await db.execute(`
  SELECT se.recoups_json, a.name as artist, s.date, ag.name as agent_name, agency.name as agency_name
  FROM settlements se
  JOIN shows s ON se.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
  JOIN agents ag ON a.agent_id = ag.id
  JOIN agencies agency ON ag.agency_id = agency.id
  WHERE se.recoups_json LIKE '%hwang_pattern%'
`);
console.log(`  Settlements with hwang_pattern recoups: ${hwang.rows.length}`);
for (const row of hwang.rows) {
  console.log(`    ${row.artist} (${row.date}) — agent: ${row.agent_name} @ ${row.agency_name}`);
}

// 11. Duplicate expenses
console.log("\n=== DUPLICATE EXPENSES ===");
const dupes = await db.execute(`
  SELECT e1.show_id, e1.description, e1.amount, e1.entered_at, e2.entered_at as entered_at_2,
    a.name as artist, s.date
  FROM expenses e1
  JOIN expenses e2 ON e1.show_id = e2.show_id AND e1.description = e2.description AND e1.id < e2.id
  JOIN shows s ON e1.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
`);
console.log(`  Potential duplicate expenses: ${dupes.rows.length}`);
for (const row of dupes.rows) {
  console.log(`    ${row.artist} (${row.date}): "${row.description}" $${row.amount} — entered ${row.entered_at} and ${row.entered_at_2}`);
}

// 12. Comps that count toward gross
console.log("\n=== COMPS COUNTING TOWARD GROSS ===");
const compsGross = await db.execute(`
  SELECT COUNT(*) as cnt, SUM(count * face_value) as total_value
  FROM comps WHERE counts_toward_gross = 1
`);
console.log(`  Comps counting toward gross: ${compsGross.rows[0].cnt} entries, $${Math.round(compsGross.rows[0].total_value || 0).toLocaleString()}`);

// 13. Shows count by supported vs unsupported deal types
console.log("\n=== SUPPORTED vs UNSUPPORTED ===");
const supported = await db.execute(`
  SELECT
    SUM(CASE WHEN d.deal_type IN ('flat', 'percentage_of_gross') THEN 1 ELSE 0 END) as supported,
    SUM(CASE WHEN d.deal_type NOT IN ('flat', 'percentage_of_gross') THEN 1 ELSE 0 END) as unsupported,
    COUNT(*) as total
  FROM deals d
`);
const sup = supported.rows[0];
console.log(`  Supported (flat + pct_gross): ${sup.supported}/${sup.total} (${Math.round(100*sup.supported/sup.total)}%)`);
console.log(`  Unsupported (vs + pct_net + door): ${sup.unsupported}/${sup.total} (${Math.round(100*sup.unsupported/sup.total)}%)`);

// 14. Time between settlement stages (how long do disputes take?)
console.log("\n=== DISPUTE RESOLUTION TIME ===");
const disputeTime = await db.execute(`
  SELECT a.name as artist, s.date, se.status,
    se.disputed_at, se.revised_at, se.finalized_at, se.paid_at,
    se.signed_at, se.submitted_at
  FROM settlements se
  JOIN shows s ON se.show_id = s.id
  JOIN artists a ON s.artist_id = a.id
  WHERE se.disputed_at IS NOT NULL
  LIMIT 10
`);
for (const row of disputeTime.rows) {
  console.log(`  ${row.artist} (${row.date}): status=${row.status}, disputed=${row.disputed_at}, revised=${row.revised_at}, paid=${row.paid_at}`);
}

process.exit(0);
