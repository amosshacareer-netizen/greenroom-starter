import type { Deal, Expense, TicketSale, Bonus } from "@/db/schema";
import type { ParsedDeal } from "./parseDeal";

export type SettlementCalculation =
  | {
      supported: true;
      grossBoxOffice: number;
      netBoxOffice: number;
      totalExpenses: number;
      totalToArtist: number;
      steps: {
        label: string;
        value: number;
        source?: "ticket_sales" | "expenses" | "deal_terms" | "calculated";
        note?: string;
      }[];
      finalFormula: string;
      bonusesApplied: { label: string; amount: number; reason: string }[];
      bonusesNotTriggered: { label: string; amount: number; reason: string }[];
      expenseBreakdown: { category: string; amount: number; note?: string }[];
    }
  | {
      supported: false;
      reason: string;
      dealType: Deal["dealType"];
    };

interface CalcInput {
  deal: Deal;
  ticketSales: TicketSale[];
  expenses: Expense[];
  venueCapacity?: number;
  ticketsSold?: number;
  parsedTerms?: ParsedDeal;
}

export function parseBonuses(deal: Deal): Bonus[] {
  if (!deal.bonusesJson) return [];
  try {
    const parsed = JSON.parse(deal.bonusesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildExpenseBreakdown(
  expenses: Expense[],
  hospitalityCap?: number | null
): { category: string; amount: number; note?: string }[] {
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    if (e.absorbedByVenue) continue;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }
  return Array.from(byCategory, ([category, amount]) => ({
    category,
    amount,
    note:
      category === "hospitality" &&
      hospitalityCap != null &&
      amount > hospitalityCap
        ? `Over $${hospitalityCap.toLocaleString()} cap by $${(amount - hospitalityCap).toLocaleString()}`
        : undefined,
  }));
}

export function calculateSettlement(input: CalcInput): SettlementCalculation {
  const { deal, ticketSales, expenses, venueCapacity, ticketsSold, parsedTerms } =
    input;

  const grossBoxOffice = ticketSales.reduce((sum, t) => sum + t.gross, 0);
  const totalFees = ticketSales.reduce((sum, t) => sum + t.fees, 0);
  const netBoxOffice = grossBoxOffice - totalFees;
  const totalExpenses = expenses
    .filter((e) => !e.absorbedByVenue)
    .reduce((sum, e) => sum + e.amount, 0);

  const tickets =
    ticketsSold ?? ticketSales.reduce((sum, t) => sum + (t.qty ?? 0), 0);

  const effectiveDealType = parsedTerms?.dealType ?? deal.dealType;
  const effectiveGuarantee = parsedTerms?.guarantee ?? deal.guaranteeAmount;
  const effectivePercentage = parsedTerms?.percentage ?? deal.percentage;
  const effectiveExpenseCap = parsedTerms?.expenseCap ?? deal.expenseCap;
  const effectiveHospitalityCap =
    parsedTerms?.hospitalityCap ?? deal.hospitalityCap;

  const structuredBonuses = parseBonuses(deal);
  const effectiveBonuses =
    structuredBonuses.length > 0
      ? structuredBonuses
      : (parsedTerms?.parsedBonuses ?? []);

  const expenseBreakdown = buildExpenseBreakdown(
    expenses,
    effectiveHospitalityCap
  );

  // ---------- flat guarantee ----------
  if (effectiveDealType === "flat") {
    if (effectiveGuarantee == null) {
      return {
        supported: false,
        reason: "Flat deal is missing a guarantee amount.",
        dealType: deal.dealType,
      };
    }
    const bonusResult = applyBonuses(effectiveBonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: effectiveGuarantee + bonusResult.totalApplied,
      steps: [
        {
          label: "Flat guarantee",
          value: effectiveGuarantee,
          source: "deal_terms",
          note: "No expense deductions. The guarantee is the floor.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          source: "deal_terms" as const,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `flat ${effectiveGuarantee} + bonuses ${bonusResult.totalApplied} = ${(effectiveGuarantee + bonusResult.totalApplied).toFixed(2)}`
        : `flat guarantee = ${effectiveGuarantee}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      expenseBreakdown,
    };
  }

  // ---------- percentage of gross ----------
  if (effectiveDealType === "percentage_of_gross") {
    if (effectivePercentage == null) {
      return {
        supported: false,
        reason: "Percentage-of-gross deal is missing a percentage.",
        dealType: deal.dealType,
      };
    }
    const payout = grossBoxOffice * effectivePercentage;
    const bonusResult = applyBonuses(effectiveBonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist: payout + bonusResult.totalApplied,
      steps: [
        {
          label: `× ${(effectivePercentage * 100).toFixed(0)}%`,
          value: payout,
          source: "calculated",
          note: "Percentage of gross — no expense deductions.",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          source: "deal_terms" as const,
          note: b.reason,
        })),
      ],
      finalFormula: bonusResult.applied.length
        ? `gross × ${effectivePercentage} + bonuses = ${(payout + bonusResult.totalApplied).toFixed(2)}`
        : `gross × ${effectivePercentage} = ${payout.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      expenseBreakdown,
    };
  }

  // ---------- vs deal (guarantee vs %) ----------
  if (effectiveDealType === "vs") {
    if (effectiveGuarantee == null || effectivePercentage == null) {
      return {
        supported: false,
        reason: "Vs deal requires both a guarantee amount and a percentage.",
        dealType: deal.dealType,
      };
    }
    const effectiveBasis = parsedTerms?.percentageBasis ?? deal.percentageBasis ?? "net";
    const isGrossBasis = effectiveBasis === "gross";

    const cappedExpenses = effectiveExpenseCap
      ? Math.min(totalExpenses, effectiveExpenseCap)
      : totalExpenses;
    const net = grossBoxOffice - totalFees - cappedExpenses;
    const pctPayout = isGrossBasis
      ? grossBoxOffice * effectivePercentage
      : net * effectivePercentage;
    const totalBeforeBonuses = Math.max(effectiveGuarantee, pctPayout);
    const guaranteeWins = effectiveGuarantee >= pctPayout;

    const bonusResult = applyBonuses(effectiveBonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    const totalToArtist = totalBeforeBonuses + bonusResult.totalApplied;
    const pctStr = (effectivePercentage * 100).toFixed(0);
    const basisLabel = isGrossBasis ? "gross" : "net";

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist,
      steps: [
        ...(isGrossBasis
          ? []
          : [
              {
                label: effectiveExpenseCap
                  ? `Expenses applied (capped at $${effectiveExpenseCap.toLocaleString()})`
                  : "Expenses applied",
                value: cappedExpenses,
                source: "expenses" as const,
              },
              {
                label: "Net for settlement",
                value: net,
                source: "calculated" as const,
              },
            ]),
        {
          label: `${pctStr}% of ${basisLabel}`,
          value: pctPayout,
          source: "calculated",
        },
        {
          label: "Guarantee",
          value: effectiveGuarantee,
          source: "deal_terms",
        },
        {
          label: guaranteeWins
            ? "→ Guarantee wins"
            : "→ Percentage wins",
          value: totalBeforeBonuses,
          source: "calculated",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          source: "deal_terms" as const,
          note: b.reason,
        })),
      ],
      finalFormula: `vs: max(guarantee $${effectiveGuarantee.toLocaleString()}, ${pctStr}% of ${basisLabel} $${pctPayout.toFixed(2)}) = $${totalToArtist.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      expenseBreakdown,
    };
  }

  // ---------- percentage of net ----------
  if (effectiveDealType === "percentage_of_net") {
    if (effectivePercentage == null) {
      return {
        supported: false,
        reason: "Percentage-of-net deal is missing a percentage.",
        dealType: deal.dealType,
      };
    }
    const cappedExpenses = effectiveExpenseCap
      ? Math.min(totalExpenses, effectiveExpenseCap)
      : totalExpenses;
    const net = grossBoxOffice - totalFees - cappedExpenses;
    const totalBeforeBonuses = net * effectivePercentage;

    const bonusResult = applyBonuses(effectiveBonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    const totalToArtist = totalBeforeBonuses + bonusResult.totalApplied;
    const pctStr = (effectivePercentage * 100).toFixed(0);

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist,
      steps: [
        {
          label: effectiveExpenseCap
            ? `Expenses applied (capped at $${effectiveExpenseCap.toLocaleString()})`
            : "Expenses applied",
          value: cappedExpenses,
          source: "expenses",
        },
        {
          label: "Net for settlement",
          value: net,
          source: "calculated",
        },
        {
          label: `${pctStr}% of net`,
          value: totalBeforeBonuses,
          source: "calculated",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          source: "deal_terms" as const,
          note: b.reason,
        })),
      ],
      finalFormula: `${pctStr}% of net (after expenses) = $${totalToArtist.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      expenseBreakdown,
    };
  }

  // ---------- door deal ----------
  if (effectiveDealType === "door") {
    const cappedExpenses = effectiveExpenseCap
      ? Math.min(totalExpenses, effectiveExpenseCap)
      : totalExpenses;
    const totalBeforeBonuses = grossBoxOffice - totalFees - cappedExpenses;

    const bonusResult = applyBonuses(effectiveBonuses, {
      gross: grossBoxOffice,
      tickets,
      capacity: venueCapacity,
    });

    const totalToArtist = totalBeforeBonuses + bonusResult.totalApplied;

    return {
      supported: true,
      grossBoxOffice,
      netBoxOffice,
      totalExpenses,
      totalToArtist,
      steps: [
        {
          label: effectiveExpenseCap
            ? `Expenses applied (capped at $${effectiveExpenseCap.toLocaleString()})`
            : "Expenses applied",
          value: cappedExpenses,
          source: "expenses",
        },
        {
          label: "Artist takes (door deal)",
          value: totalBeforeBonuses,
          source: "calculated",
          note: "Gross less fees and expenses",
        },
        ...bonusResult.applied.map((b) => ({
          label: b.label,
          value: b.amount,
          source: "deal_terms" as const,
          note: b.reason,
        })),
      ],
      finalFormula: `door: gross − fees − expenses = $${totalToArtist.toFixed(2)}`,
      bonusesApplied: bonusResult.applied,
      bonusesNotTriggered: bonusResult.notTriggered,
      expenseBreakdown,
    };
  }

  // ---------- fallback: not supported ----------
  const friendlyName: Record<Deal["dealType"], string> = {
    flat: "Flat guarantee",
    percentage_of_gross: "Percentage of gross",
    percentage_of_net: "Percentage of net",
    vs: "Vs deal (guarantee vs %)",
    door: "Door deal",
  };

  return {
    supported: false,
    dealType: deal.dealType,
    reason:
      `${friendlyName[deal.dealType]} deals aren't supported in the in-app tool yet. ` +
      `Power users at venues like The Crescent default to spreadsheets for these.`,
  };
}

/**
 * Lightweight amount check for the shows list page.
 * Uses the settlement's pre-computed gross/net/expenses instead of raw arrays.
 * Returns true if the recorded totalToArtist differs from what we'd calculate.
 */
export function quickCheckAmountMismatch(
  deal: Deal,
  settlement: { grossBoxOffice: number | null; netBoxOffice: number | null; totalExpenses: number | null; totalToArtist: number | null },
  parsedTerms?: ParsedDeal,
): boolean {
  if (settlement.totalToArtist == null || settlement.grossBoxOffice == null) return false;

  const gross = settlement.grossBoxOffice;
  const net = settlement.netBoxOffice ?? gross;
  const totalExp = settlement.totalExpenses ?? 0;

  const effectiveDealType = parsedTerms?.dealType ?? deal.dealType;
  const effectiveGuarantee = parsedTerms?.guarantee ?? deal.guaranteeAmount;
  const effectivePercentage = parsedTerms?.percentage ?? deal.percentage;
  const effectiveExpenseCap = parsedTerms?.expenseCap ?? deal.expenseCap;
  const effectiveBasis = parsedTerms?.percentageBasis ?? deal.percentageBasis ?? "net";

  let calculated: number | null = null;

  if (effectiveDealType === "flat" && effectiveGuarantee != null) {
    calculated = effectiveGuarantee;
  } else if (effectiveDealType === "percentage_of_gross" && effectivePercentage != null) {
    calculated = gross * effectivePercentage;
  } else if (effectiveDealType === "percentage_of_net" && effectivePercentage != null) {
    const cappedExp = effectiveExpenseCap != null ? Math.min(totalExp, effectiveExpenseCap) : totalExp;
    calculated = (net - cappedExp) * effectivePercentage;
  } else if (effectiveDealType === "vs" && effectiveGuarantee != null && effectivePercentage != null) {
    const cappedExp = effectiveExpenseCap != null ? Math.min(totalExp, effectiveExpenseCap) : totalExp;
    const pctPayout = effectiveBasis === "gross"
      ? gross * effectivePercentage
      : (net - cappedExp) * effectivePercentage;
    calculated = Math.max(effectiveGuarantee, pctPayout);
  } else if (effectiveDealType === "door") {
    const cappedExp = effectiveExpenseCap != null ? Math.min(totalExp, effectiveExpenseCap) : totalExp;
    calculated = net - cappedExp;
  }

  if (calculated == null) return false;

  const structuredBonuses = parseBonuses(deal);
  const bonuses = structuredBonuses.length > 0 ? structuredBonuses : (parsedTerms?.parsedBonuses ?? []);
  for (const b of bonuses) {
    if (b.type === "gross_threshold" && gross >= b.threshold) calculated += b.amount;
    if (b.type === "sellout" || b.type === "attendance_threshold") return false;
  }

  return Math.abs(settlement.totalToArtist - calculated) > 1;
}

/** Evaluate a list of bonuses against the show's actual numbers. */
function applyBonuses(
  bonuses: Bonus[],
  ctx: { gross: number; tickets: number; capacity?: number },
) {
  const applied: { label: string; amount: number; reason: string }[] = [];
  const notTriggered: { label: string; amount: number; reason: string }[] = [];

  for (const b of bonuses) {
    if (b.type === "gross_threshold") {
      if (ctx.gross >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} ≥ ${b.threshold.toLocaleString()}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `Gross ${ctx.gross.toLocaleString()} < ${b.threshold.toLocaleString()}`,
        });
      }
    } else if (b.type === "sellout") {
      if (ctx.capacity != null && ctx.tickets >= ctx.capacity * 0.95) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} of ${ctx.capacity} sold`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason:
            ctx.capacity != null
              ? `${ctx.tickets} of ${ctx.capacity} sold (sellout = ≥95%)`
              : `Capacity unknown — can't evaluate`,
        });
      }
    } else if (b.type === "attendance_threshold") {
      if (ctx.tickets >= b.threshold) {
        applied.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} ≥ ${b.threshold}`,
        });
      } else {
        notTriggered.push({
          label: b.label,
          amount: b.amount,
          reason: `${ctx.tickets} < ${b.threshold}`,
        });
      }
    } else if (b.type === "tier_ratchet") {
      notTriggered.push({
        label: b.label,
        amount: 0,
        reason: "Tier ratchets need vs-deal or % of net support — not yet handled",
      });
    }
  }

  return {
    applied,
    notTriggered,
    totalApplied: applied.reduce((s, b) => s + b.amount, 0),
  };
}
