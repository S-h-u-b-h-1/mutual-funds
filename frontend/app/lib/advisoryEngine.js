const PROFILE_LABELS = {
  conservative: "Cautious",
  balanced: "Balanced",
  growth: "Growth-oriented",
};

export const ADVISORY_DRAFT_KEY = "mfp-advisory-draft-v1";

export const ADVISORY_QUESTIONS = [
  {
    key: "goal",
    title: "What should this money accomplish?",
    detail: "Your goal changes which trade-offs matter most.",
    options: [
      { value: "wealth", label: "Build long-term wealth", hint: "Grow steadily over several years" },
      { value: "retirement", label: "Plan for retirement", hint: "Balance growth with a durable core" },
      { value: "education", label: "Fund a major goal", hint: "Prepare for education or another milestone" },
      { value: "emergency", label: "Protect near-term money", hint: "Prioritize access and stability" },
      { value: "tax", label: "Save tax with ELSS", hint: "Evaluate tax-saving equity options" },
    ],
  },
  {
    key: "horizon",
    title: "When might you need most of this money?",
    detail: "A shorter horizon automatically limits the amount of market risk in the result.",
    options: [
      { value: 1, label: "Within 1 year", hint: "Access matters most" },
      { value: 2, label: "1–3 years", hint: "Limited time to recover from a fall" },
      { value: 3, label: "3–5 years", hint: "Some room for measured growth" },
      { value: 4, label: "More than 5 years", hint: "More time to ride through cycles" },
    ],
  },
  {
    key: "reaction",
    title: "If the portfolio fell 15%, what would you most likely do?",
    detail: "There is no ideal answer—this is about behavior during a real decline.",
    options: [
      { value: 1, label: "Exit immediately", hint: "Avoid further loss" },
      { value: 2, label: "Reduce some exposure", hint: "Lower the discomfort" },
      { value: 3, label: "Stay invested", hint: "Follow the original plan" },
      { value: 4, label: "Add gradually", hint: "Accept volatility for long-term value" },
    ],
  },
  {
    key: "capacity",
    title: "How dependent are you on this money?",
    detail: "Financial capacity and emotional tolerance are different; both matter.",
    options: [
      { value: 1, label: "I may need it soon", hint: "A loss would disrupt essentials" },
      { value: 2, label: "It supports an important goal", hint: "A delay would be difficult" },
      { value: 3, label: "I have a separate safety buffer", hint: "This money can remain invested" },
      { value: 4, label: "It is long-term surplus", hint: "Near-term plans do not depend on it" },
    ],
  },
  {
    key: "experience",
    title: "How familiar are you with market-linked investments?",
    detail: "Experience slightly adjusts the profile; it never overrides horizon or capacity.",
    options: [
      { value: 1, label: "New investor", hint: "Little or no prior exposure" },
      { value: 2, label: "Some experience", hint: "I understand basic fund categories" },
      { value: 3, label: "Experienced", hint: "I have invested through market cycles" },
      { value: 4, label: "Advanced", hint: "I regularly evaluate risk and allocation" },
    ],
  },
];

export function advisoryAnswerLabel(key, value) {
  return ADVISORY_QUESTIONS.find((question) => question.key === key)?.options.find((option) => option.value === value)?.label || "Not recorded";
}

const FAMILY_LABELS = {
  stability: "Capital stability",
  income: "Measured income",
  balanced: "Balanced growth",
  diversified: "Diversified equity",
  growth: "Higher-growth equity",
  tax: "Tax-saving equity",
};

export function categoryFamily(category = "") {
  const value = category.toLowerCase();
  if (/elss|tax saver/.test(value)) return "tax";
  if (/liquid|overnight|money market|ultra short/.test(value)) return "stability";
  if (/corporate bond|banking and psu|short duration|short term|gilt|income|dynamic bond|medium duration/.test(value)) return "income";
  if (/hybrid|balanced|multi asset|equity savings|arbitrage/.test(value)) return "balanced";
  if (/mid cap|small cap/.test(value)) return "growth";
  if (/focused/.test(value)) return null;
  if (/large cap|large & mid|flexi cap|multi cap|value|contra|equity/.test(value)) return "diversified";
  return null;
}

export function buildRiskProfile(answers) {
  const horizon = Number(answers.horizon || 0);
  const reaction = Number(answers.reaction || 0);
  const capacity = Number(answers.capacity || 0);
  const experience = Number(answers.experience || 0);
  let score = Math.round(((horizon - 1) / 3) * 35 + ((reaction - 1) / 3) * 35 + ((capacity - 1) / 3) * 20 + ((experience - 1) / 3) * 10);

  if (answers.goal === "emergency" || horizon === 1) score = Math.min(score, 32);
  if (horizon === 2) score = Math.min(score, 58);

  const key = score < 38 ? "conservative" : score < 68 ? "balanced" : "growth";
  const allocations = {
    conservative: [
      { label: "Stability", value: 60, tone: "bg-info" },
      { label: "Balanced", value: 30, tone: "bg-accent" },
      { label: "Growth", value: 10, tone: "bg-warn" },
    ],
    balanced: [
      { label: "Stability", value: 25, tone: "bg-info" },
      { label: "Balanced", value: 45, tone: "bg-accent" },
      { label: "Growth", value: 30, tone: "bg-warn" },
    ],
    growth: [
      { label: "Stability", value: 10, tone: "bg-info" },
      { label: "Balanced", value: 25, tone: "bg-accent" },
      { label: "Growth", value: 65, tone: "bg-warn" },
    ],
  };

  const summaries = {
    conservative: "Protecting near-term money matters more than maximizing upside. The research set therefore favors liquidity, lower observed volatility, and shallower drawdowns.",
    balanced: "You can accept measured fluctuations for long-term progress, but large losses would still disrupt the plan. The research set blends stabilizers with diversified growth.",
    growth: "Your horizon and loss tolerance can support meaningful equity exposure. The research set emphasizes diversified growth while retaining a stabilizing sleeve.",
  };

  return {
    key,
    label: PROFILE_LABELS[key],
    score,
    summary: summaries[key],
    allocation: allocations[key],
    horizon,
    goal: answers.goal,
  };
}

export function researchProfileFromAdvisoryAnswers(answers) {
  const risk = buildRiskProfile(answers);
  const experience = { 1: "beginner", 2: "intermediate", 3: "advanced", 4: "professional" };
  const horizon = { 1: "0-1", 2: "1-3", 3: "3-5", 4: "5+" };
  const primaryGoal = answers.goal === "tax" ? "compare" : answers.goal === "emergency" ? "research" : "portfolio";
  return {
    role: "individual",
    primaryGoal,
    experience: experience[Number(answers.experience)] || "beginner",
    riskComfort: risk.key === "balanced" ? "moderate" : risk.key === "growth" ? "aggressive" : "conservative",
    horizon: horizon[Number(answers.horizon)] || "",
    aumBand: "not-specified",
    preferredCategories: "",
    advisoryAnswers: { goal: answers.goal, horizon: Number(answers.horizon), reaction: Number(answers.reaction), capacity: Number(answers.capacity), experience: Number(answers.experience) },
    riskScore: risk.score,
    riskProfile: risk.key,
  };
}

function preferredFamilies(profile) {
  if (profile.goal === "tax" && profile.horizon >= 3) {
    return profile.key === "growth" ? ["tax", "diversified", "balanced"] : ["tax", "balanced", "income"];
  }
  if (profile.key === "conservative") return ["stability", "income", "balanced"];
  if (profile.key === "balanced") return ["balanced", "diversified", "income"];
  return ["diversified", "growth", "balanced"];
}

export function rankFundsForProfile(funds, profile) {
  const preferred = preferredFamilies(profile);
  return funds
    .map((fund) => {
      const family = fund.family || categoryFamily(fund.category);
      const familyIndex = preferred.indexOf(family);
      const fit = familyIndex < 0 ? 0 : 46 - familyIndex * 11;
      const percentile = Number.isFinite(fund.catPct) ? fund.catPct * 0.2 : 8;
      const consistency = Number.isFinite(fund.consistency) ? fund.consistency * 0.14 : 5;
      const history = (Number.isFinite(fund.r3y) ? 6 : 0) + (Number.isFinite(fund.r5y) ? 5 : 0);
      const evidence = Math.min(8, Math.max(0, Number(fund.obs || 0) / 12));
      const riskPenalty = profile.key === "conservative" && Number(fund.vol90) > 9 ? 18 : profile.key === "balanced" && Number(fund.vol90) > 16 ? 8 : 0;
      const score = Math.max(0, Math.min(100, Math.round(fit + percentile + consistency + history + evidence - riskPenalty)));
      const reasons = [
        `${FAMILY_LABELS[family] || "Diversified"} role matches this profile`,
        Number.isFinite(fund.consistency) ? `${fund.consistency}/100 observed return consistency` : "Long-term evidence available",
        Number.isFinite(fund.catPct) ? `${fund.catPct}th category percentile in the observed cohort` : "Compared within its category",
      ];
      return { ...fund, family, fitScore: score, reasons };
    })
    .filter((fund) => preferred.includes(fund.family))
    .sort((a, b) => b.fitScore - a.fitScore || (a.vol90 ?? 999) - (b.vol90 ?? 999));
}

export function buildShortlist(funds, profile, limit = 3) {
  const ranked = rankFundsForProfile(funds, profile);
  const selected = [];
  const usedFamilies = new Set();
  for (const fund of ranked) {
    if (selected.length >= limit) break;
    if (!usedFamilies.has(fund.family)) {
      selected.push(fund);
      usedFamilies.add(fund.family);
    }
  }
  for (const fund of ranked) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.code === fund.code)) selected.push(fund);
  }
  return selected;
}

export function answerAdvisoryQuestion(question, { profile, funds }) {
  const normalized = question.toLowerCase();
  const top = funds[0];
  const safest = [...funds].sort((a, b) => (a.vol90 ?? 999) - (b.vol90 ?? 999))[0];
  const strongest = [...funds].sort((a, b) => (b.r3y ?? b.r1y ?? -999) - (a.r3y ?? a.r1y ?? -999))[0];

  if (/risk|safe|steady|steadier|loss|drawdown|volatile/.test(normalized)) {
    return `${safest?.shortName || safest?.name} has the lowest observed 90-day volatility in this shortlist at ${Number(safest?.vol90 || 0).toFixed(2)}%, with a ${Number(safest?.maxdd90 || 0).toFixed(2)}% observed 90-day maximum drawdown. That makes it the steadier comparison candidate—not a guarantee against loss.`;
  }
  if (/return|perform|growth|highest/.test(normalized)) {
    const period = Number.isFinite(strongest?.r3y) ? "3-year annualized" : "1-year";
    const value = Number.isFinite(strongest?.r3y) ? strongest.r3y : strongest?.r1y;
    return `${strongest?.shortName || strongest?.name} has the strongest ${period} return in this shortlist at ${Number(value || 0).toFixed(2)}%. For your ${profile.label.toLowerCase()} profile, that result should be read beside volatility and drawdown—not used as a standalone reason to choose it.`;
  }
  if (/why|match|recommend|pick|choose/.test(normalized)) {
    return `${top?.shortName || top?.name} ranks first because its fund-family role, observed consistency, category-relative standing, and evidence history align most closely with your ${profile.label.toLowerCase()} profile. This is an explainable research shortlist; it does not know your full finances or replace regulated advice.`;
  }
  if (/horizon|year|time/.test(normalized)) {
    return `Your horizon answer materially shaped the result. Short horizons cap the risk score and favor liquid or high-quality debt categories; longer horizons allow diversified equity to carry more weight. Re-run the profile if this money may be needed earlier than planned.`;
  }
  if (/tax|elss/.test(normalized)) {
    return profile.goal === "tax"
      ? "The shortlist includes tax-saving equity only because tax saving is your stated goal and your horizon supports market risk. ELSS has a statutory lock-in; compare tax treatment, risk, and suitability before acting."
      : "Tax saving was not your selected goal, so ELSS was not given special priority. You can change the goal and regenerate the shortlist to evaluate that trade-off explicitly.";
  }
  return `I would compare ${funds.map((fund) => fund.shortName || fund.name).join(", ")} on role in the portfolio, volatility, drawdown, consistency, and category-relative performance. Ask me which is steadier, which has stronger observed returns, or why the first match ranked highest.`;
}
