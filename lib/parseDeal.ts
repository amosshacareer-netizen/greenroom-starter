import type { Deal, Expense, Bonus } from "@/db/schema";

export type ParsedDeal = {
  dealType: "flat" | "vs" | "percentage_of_net" | "percentage_of_gross" | "door" | null;
  guarantee: number | null;
  percentage: number | null;
  percentageBasis: "net" | "gross" | null;
  expenseCap: number | null;
  hospitalityCap: number | null;
  hasWalkoutPot: boolean;
  hasRatchet: boolean;
  parsedBonuses: Bonus[];
};

export type Warning = {
  type:
    | "percentage_mismatch"
    | "deal_type_mismatch"
    | "expenses_over_cap"
    | "hospitality_over_cap"
    | "complex_deal"
    | "basis_mismatch"
    | "guarantee_mismatch";
  message: string;
  detail?: string;
};

function parseNum(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function parseDeal(freetext: string): ParsedDeal {
  let dealType: ParsedDeal["dealType"] = null;
  let guarantee: number | null = null;
  let percentage: number | null = null;
  let percentageBasis: ParsedDeal["percentageBasis"] = null;
  let expenseCap: number | null = null;
  let hospitalityCap: number | null = null;

  const hasWalkoutPot = /walkout/i.test(freetext);
  const hasRatchet = /ratchet/i.test(freetext);

  const expCapMatch = freetext.match(/expenses?\s+cap(?:ped)?\s+\$?([\d,]+)/i);
  if (expCapMatch) expenseCap = parseNum(expCapMatch[1]);

  const hospCapMatch = freetext.match(
    /hosp(?:itality)?\s+(?:cap\s+)?\$?([\d,]+)/i
  );
  if (hospCapMatch) hospitalityCap = parseNum(hospCapMatch[1]);

  if (
    /(?:vs\s+\d+%?\s+(?:of\s+)?gross|%\s+(?:of\s+)?gross)/i.test(freetext)
  ) {
    percentageBasis = "gross";
  }

  const vsMatch = freetext.match(
    /\$?([\d,]+)\s+(?:guaranteed?\s+|g'tee\s+)?(?:vs|versus)/i
  );
  if (vsMatch) {
    dealType = "vs";
    guarantee = parseNum(vsMatch[1]);
    const pctMatch = freetext.match(/(?:vs|versus)\s+(\d+)\s*[/%]/i);
    if (pctMatch) percentage = Number(pctMatch[1]) / 100;
    if (!percentageBasis) percentageBasis = "net";
  } else if (/flat/i.test(freetext)) {
    dealType = "flat";
    const flatMatch = freetext.match(/flat\s+(?:guarantee\s+)?\$?([\d,]+)/i);
    if (flatMatch) guarantee = parseNum(flatMatch[1]);
  } else if (/door\s+deal/i.test(freetext)) {
    dealType = "door";
  } else {
    const pctNetMatch = freetext.match(/(\d+)%\s+of\s+net/i);
    if (pctNetMatch) {
      dealType = "percentage_of_net";
      percentage = Number(pctNetMatch[1]) / 100;
      percentageBasis = "net";
    } else {
      const pctGrossMatch = freetext.match(/(\d+)%\s+of\s+gross/i);
      if (pctGrossMatch) {
        dealType = "percentage_of_gross";
        percentage = Number(pctGrossMatch[1]) / 100;
        percentageBasis = "gross";
      }
    }
  }

  const parsedBonuses: Bonus[] = [];

  for (const m of freetext.matchAll(
    /\+?\$?([\d,]+)\s+(?:bonus\s+)?if\s+gross\s*(?:>|over|exceeds?)\s+\$?([\d,]+)/gi
  )) {
    parsedBonuses.push({
      type: "gross_threshold",
      label: `+${fmt(parseNum(m[1]))} if gross > ${fmt(parseNum(m[2]))}`,
      threshold: parseNum(m[2]),
      amount: parseNum(m[1]),
    });
  }

  const selloutMatch = freetext.match(
    /(?:\$?([\d,]+)\s+(?:if\s+)?sellout|sellout\s+(?:bonus\s+)?\$?([\d,]+))/i
  );
  if (selloutMatch) {
    const amt = parseNum(selloutMatch[1] || selloutMatch[2]);
    parsedBonuses.push({
      type: "sellout",
      label: `Sellout bonus ${fmt(amt)}`,
      amount: amt,
    });
  }

  for (const m of freetext.matchAll(
    /\$?([\d,]+)\s+if\s+(?:over|attendance\s*>)\s*(\d+)\s*(?:sold|tickets|attendance)/gi
  )) {
    parsedBonuses.push({
      type: "attendance_threshold",
      label: `+${fmt(parseNum(m[1]))} if over ${m[2]} sold`,
      threshold: Number(m[2]),
      amount: parseNum(m[1]),
    });
  }

  return {
    dealType,
    guarantee,
    percentage,
    percentageBasis,
    expenseCap,
    hospitalityCap,
    hasWalkoutPot,
    hasRatchet,
    parsedBonuses,
  };
}

export function generateWarnings(
  parsed: ParsedDeal,
  deal: Deal,
  expenses: Expense[]
): Warning[] {
  const warnings: Warning[] = [];

  if (
    parsed.percentage != null &&
    deal.percentage != null &&
    Math.abs(parsed.percentage - deal.percentage) > 0.001
  ) {
    const pPct = (parsed.percentage * 100).toFixed(0);
    const sPct = (deal.percentage * 100).toFixed(0);
    warnings.push({
      type: "percentage_mismatch",
      message: "Percentage mismatch",
      detail: `Deal notes say ${pPct}%, but the system records ${sPct}%. This worksheet uses the deal notes value (${pPct}%).`,
    });
  }

  if (parsed.dealType != null && parsed.dealType !== deal.dealType) {
    const friendly: Record<string, string> = {
      flat: "flat guarantee",
      percentage_of_gross: "percentage of gross",
      percentage_of_net: "percentage of net",
      vs: "vs deal",
      door: "door deal",
    };
    warnings.push({
      type: "deal_type_mismatch",
      message: "Deal type mismatch",
      detail: `Deal notes describe a ${friendly[parsed.dealType] ?? parsed.dealType}, but the system records ${friendly[deal.dealType] ?? deal.dealType}. This worksheet follows the deal notes.`,
    });
  }

  if (parsed.expenseCap != null) {
    const total = expenses
      .filter((e) => !e.absorbedByVenue)
      .reduce((s, e) => s + e.amount, 0);
    if (total > parsed.expenseCap) {
      warnings.push({
        type: "expenses_over_cap",
        message: "Expenses over cap",
        detail: `Total passed-through expenses (${fmt(total)}) exceed the ${fmt(parsed.expenseCap)} cap by ${fmt(total - parsed.expenseCap)}. The cap is applied in the calculation.`,
      });
    }
  }

  if (parsed.hospitalityCap != null) {
    const hospTotal = expenses
      .filter((e) => e.category === "hospitality" && !e.absorbedByVenue)
      .reduce((s, e) => s + e.amount, 0);
    if (hospTotal > parsed.hospitalityCap) {
      warnings.push({
        type: "hospitality_over_cap",
        message: "Hospitality over cap",
        detail: `Hospitality expenses (${fmt(hospTotal)}) exceed the ${fmt(parsed.hospitalityCap)} cap by ${fmt(hospTotal - parsed.hospitalityCap)}.`,
      });
    }
  }

  if (
    parsed.percentageBasis &&
    deal.percentageBasis &&
    parsed.percentageBasis !== deal.percentageBasis
  ) {
    warnings.push({
      type: "basis_mismatch",
      message: "Gross vs net mismatch",
      detail: `Deal notes say percentage of ${parsed.percentageBasis}, but the system records ${deal.percentageBasis}. This changes the calculation significantly — verify which is correct.`,
    });
  }

  if (
    parsed.guarantee != null &&
    deal.guaranteeAmount != null &&
    Math.abs(parsed.guarantee - deal.guaranteeAmount) > 1
  ) {
    warnings.push({
      type: "guarantee_mismatch",
      message: "Guarantee amount mismatch",
      detail: `Deal notes say ${fmt(parsed.guarantee)}, but the system records ${fmt(deal.guaranteeAmount)}. Verify which is correct.`,
    });
  }

  if (parsed.hasWalkoutPot || parsed.hasRatchet) {
    const parts = [];
    if (parsed.hasWalkoutPot) parts.push("walkout pot");
    if (parsed.hasRatchet) parts.push("tier ratchet");
    warnings.push({
      type: "complex_deal",
      message: "Complex deal structure",
      detail: `Contains ${parts.join(" / ")} — showing base terms only.`,
    });
  }

  return warnings;
}
