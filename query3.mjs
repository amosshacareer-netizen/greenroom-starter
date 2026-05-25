import { createClient } from "@libsql/client";
const db = createClient({ url: "file:./data/greenroom.db" });

// Get diverse samples of freetext
const vs = await db.execute("SELECT deal_notes_freetext FROM deals WHERE deal_type='vs' ORDER BY RANDOM() LIMIT 15");
console.log("=== VS DEALS (15 random) ===");
vs.rows.forEach((r, i) => console.log((i+1) + ". " + r.deal_notes_freetext));

const pn = await db.execute("SELECT deal_notes_freetext FROM deals WHERE deal_type='percentage_of_net' ORDER BY RANDOM() LIMIT 10");
console.log("\n=== PCT OF NET (10 random) ===");
pn.rows.forEach((r, i) => console.log((i+1) + ". " + r.deal_notes_freetext));

const door = await db.execute("SELECT deal_notes_freetext FROM deals WHERE deal_type='door' ORDER BY RANDOM() LIMIT 5");
console.log("\n=== DOOR (5 random) ===");
door.rows.forEach((r, i) => console.log((i+1) + ". " + r.deal_notes_freetext));

const flat = await db.execute("SELECT deal_notes_freetext FROM deals WHERE deal_type='flat' ORDER BY RANDOM() LIMIT 5");
console.log("\n=== FLAT (5 random) ===");
flat.rows.forEach((r, i) => console.log((i+1) + ". " + r.deal_notes_freetext));

// Count patterns
const all = await db.execute("SELECT deal_notes_freetext FROM deals WHERE deal_notes_freetext IS NOT NULL");
let stats = { total: 0, vs: 0, flat: 0, pctNet: 0, walkout: 0, ratchet: 0, door: 0, recoup: 0, gtee: 0, vsGross: 0, bonus: 0 };
for (const r of all.rows) {
  const t = (r.deal_notes_freetext || "").toLowerCase();
  stats.total++;
  if (t.includes(" vs ") || t.includes("whichever")) stats.vs++;
  if (t.includes("flat")) stats.flat++;
  if (t.includes("% of net") && !t.includes(" vs ")) stats.pctNet++;
  if (t.includes("walkout")) stats.walkout++;
  if (t.includes("ratchet")) stats.ratchet++;
  if (t.includes("door")) stats.door++;
  if (t.includes("recoup")) stats.recoup++;
  if (t.includes("g'tee") || t.includes("g’tee")) stats.gtee++;
  if (t.includes("% gross") || t.includes("vs gross")) stats.vsGross++;
  if (t.includes("bonus") || t.includes("sellout")) stats.bonus++;
}
console.log("\n=== PATTERN COUNTS ===");
console.log(JSON.stringify(stats, null, 2));

process.exit(0);
