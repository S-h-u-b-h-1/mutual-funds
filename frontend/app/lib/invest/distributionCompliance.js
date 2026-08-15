import "./providers/index.js";
import { getProviderStatus } from "../platform/providerRegistry/core.js";
import { getDefaultDistributorAttribution } from "../platform/distributor/core.js";

export const DISTRIBUTION_SOURCES = [
  { id: "amfi-mfd", label: "AMFI distributor registration, ARN/EUIN and Code of Conduct", publisher: "AMFI", url: "https://www.amfiindia.com/distributor" },
  { id: "amfi-forms", label: "ARN/EUIN, KYC and annual DSC forms", publisher: "AMFI", url: "https://www.amfiindia.com/distributor-quick-access/downloads" },
  { id: "sebi-master", label: "Master Circular for Mutual Funds, 20 March 2026", publisher: "SEBI", url: "https://www.sebi.gov.in/sebi_data/attachdocs/mar-2026/1774024028162.pdf" },
  { id: "sebi-eop", label: "Execution Only Platform framework for Direct plans", publisher: "SEBI", url: "https://www.sebi.gov.in/legal/circulars/jun-2023/regulatory-framework-for-execution-only-platforms-for-facilitating-transactions-in-direct-plans-of-schemes-of-mutual-funds_72479.html" },
  { id: "sebi-2fa", label: "Two-factor authentication for mutual-fund transactions", publisher: "SEBI", url: "https://www.sebi.gov.in/legal/circulars/sep-2022/two-factor-authentication-for-transactions-in-units-of-mutual-funds_63557.html" },
  { id: "sebi-no-pooling", label: "Discontinuation of pooling of client funds and units", publisher: "SEBI", url: "https://www.sebi.gov.in/web/?file=%2Fsebi_data%2Fattachdocs%2Foct-2021%2F1633347821555.pdf" },
  { id: "bse-star", label: "BSE StAR MF distributor registration requirements", publisher: "BSE", url: "https://www.bseindia.com/downloads1/MFD%20Registration%20FAQs.pdf" },
];

const enabled = (value) => String(value || "").toLowerCase() === "true";

function control(id, label, detail, verified, sourceIds, owner = "MF Pulse / Suasion") {
  return { id, label, detail, status: verified ? "verified" : "action_required", sourceIds, owner, requiredForLive: true };
}

export function buildDistributionReadiness({ identity = null, providers = {}, environment = {}, now = new Date() } = {}) {
  const arnExpiry = identity?.arn_valid_until ? new Date(`${identity.arn_valid_until}T23:59:59Z`) : null;
  const arnNotExpired = Boolean(arnExpiry && arnExpiry >= now);
  const controls = [
    control("arn-current", "Current AMFI ARN", "ARN must be active and its validity date recorded—not merely present in a seed file.", Boolean(identity?.arn && arnNotExpired && environment.arnVerified), ["amfi-mfd", "amfi-forms"]),
    control("euin-current", "EUIN mapped to the transaction", "The employee/adviser EUIN must be current and attributable for every distributor-routed order.", Boolean(identity?.euin && environment.euinVerified), ["amfi-mfd", "amfi-forms"]),
    control("annual-dsc", "Annual Declaration of Self Certification", "Keep the applicable AMFI DSC current and retain submission evidence.", environment.dscCurrent, ["amfi-forms"]),
    control("amc-empanelment", "AMC empanelment", "Accept Regular-plan business only for AMCs that have empanelled the distributor.", environment.amcEmpanelmentVerified, ["amfi-mfd"]),
    control("order-rail", "Approved order-routing agreement", "Activate BSE StAR MF, MFU or an AMC/RTA agreement and complete its UAT and production approval.", providers.investment?.mode === "production" && environment.orderRailAgreementVerified, ["bse-star", "sebi-master"]),
    control("kyc-aml", "Production KYC/CKYC, FATCA/CRS and AML controls", "Use approved production verification and manual-review operations; a mock result cannot clear an investor.", providers.kyc?.mode === "production" && environment.kycRailVerified, ["sebi-master", "amfi-forms"]),
    control("payment-no-pooling", "Direct investor payment rail—no pooling", "Investor money must move through an approved direct collection mechanism; MF Pulse must not pool client funds or units.", providers.payment?.mode === "production" && environment.paymentRailVerified, ["sebi-no-pooling", "sebi-master"]),
    control("transaction-2fa", "Transaction two-factor authentication", "Online subscriptions and redemptions require provider-compliant two-factor authentication; systematic mandates require it at registration.", environment.transaction2faVerified, ["sebi-2fa"]),
    control("plan-routing", "Regular-plan-only ARN routing", "ARN/EUIN orders are limited to Regular plans. Direct plans require a separately registered EOP/direct channel and cannot earn distributor commission.", environment.regularPlanControlsVerified, ["sebi-eop", "sebi-master"]),
    control("disclosures", "Risk, cost, commission and conflict disclosures", "Show plan, option, risk-o-meter, loads, TER/commission context and obtain versioned investor consent before submission.", environment.disclosuresVerified, ["sebi-master", "amfi-mfd"]),
    control("grievance-security", "Grievance, record retention, privacy and security sign-off", "Publish escalation routes, retain immutable transaction evidence and complete independent privacy/security review before live PII or money movement.", environment.governanceVerified, ["sebi-master", "amfi-mfd"]),
  ];
  const completed = controls.filter((item) => item.status === "verified").length;
  const liveExecutionReady = environment.executionEnabled && controls.every((item) => item.status === "verified");
  return {
    mode: liveExecutionReady ? "live" : "blocked",
    liveExecutionReady,
    draftOnly: !liveExecutionReady,
    planRoute: "regular_only",
    completed,
    total: controls.length,
    percent: Math.round((completed / controls.length) * 100),
    distributor: identity ? {
      name: identity.distributor_name || null,
      arn: identity.arn || null,
      euin: identity.euin || null,
      arnValidUntil: identity.arn_valid_until || null,
    } : null,
    controls,
    sources: DISTRIBUTION_SOURCES,
    message: liveExecutionReady
      ? "Production transaction controls are verified and live execution is enabled."
      : "Live mutual-fund execution is locked. Research and order history remain available, but no mock provider can move money or units in production.",
  };
}

export async function getDistributionExecutionReadiness() {
  let identity = null;
  try { identity = await getDefaultDistributorAttribution(); } catch { identity = null; }
  return buildDistributionReadiness({
    identity,
    providers: {
      investment: getProviderStatus("investment"),
      payment: getProviderStatus("payment"),
      kyc: getProviderStatus("kyc"),
    },
    environment: {
      executionEnabled: enabled(process.env.INVESTMENT_EXECUTION_ENABLED),
      arnVerified: enabled(process.env.AMFI_ARN_VERIFIED),
      euinVerified: enabled(process.env.AMFI_EUIN_VERIFIED),
      dscCurrent: enabled(process.env.AMFI_DSC_CURRENT),
      amcEmpanelmentVerified: enabled(process.env.AMC_EMPANELMENT_VERIFIED),
      orderRailAgreementVerified: enabled(process.env.ORDER_RAIL_AGREEMENT_VERIFIED),
      kycRailVerified: enabled(process.env.KYC_RAIL_VERIFIED),
      paymentRailVerified: enabled(process.env.PAYMENT_RAIL_VERIFIED),
      transaction2faVerified: enabled(process.env.TRANSACTION_2FA_VERIFIED),
      regularPlanControlsVerified: enabled(process.env.REGULAR_PLAN_CONTROLS_VERIFIED),
      disclosuresVerified: enabled(process.env.MF_DISTRIBUTION_DISCLOSURES_VERIFIED),
      governanceVerified: enabled(process.env.MF_GOVERNANCE_REVIEW_VERIFIED),
    },
  });
}

export async function assertLiveInvestmentExecutionReady() {
  if (process.env.NODE_ENV !== "production") return;
  const readiness = await getDistributionExecutionReadiness();
  if (!readiness.liveExecutionReady) {
    const error = new Error("Live mutual-fund execution is not enabled. Required regulatory agreements and production providers are still pending; no money or units were moved.");
    error.code = "LIVE_EXECUTION_BLOCKED";
    throw error;
  }
}

export function assertDistributorPlanAllowed(fund) {
  if (!fund) {
    const error = new Error("The scheme could not be verified against the current fund catalogue, so it cannot be routed for investment.");
    error.code = "SCHEME_NOT_VERIFIED";
    throw error;
  }
  const planText = String(fund.plan || fund.name || "");
  if (fund.isDirect || /\bdirect\b/i.test(planText)) {
    const error = new Error("This is a Direct-plan scheme. ARN/EUIN distributor orders must use the corresponding Regular plan; Direct-plan execution requires a separately registered EOP/direct channel.");
    error.code = "DIRECT_PLAN_NOT_ALLOWED_FOR_ARN";
    throw error;
  }
  if (fund.plan !== "Regular" && !/\bregular\b/i.test(planText)) {
    const error = new Error("The scheme's Regular-plan status could not be verified, so it cannot be routed through the distributor ARN.");
    error.code = "REGULAR_PLAN_NOT_VERIFIED";
    throw error;
  }
}
