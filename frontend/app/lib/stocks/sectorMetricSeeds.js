// Worked examples for the two sectors the mission spec itself calls out (Section 11) as proof
// that operating-metric templates are genuinely sector-specific, not one generic shape reused
// everywhere — a bank's page needs NIM/GNPA/NNPA/CASA, none of which a P&L/balance-sheet line
// item captures, and a cement page needs capacity/utilization/realization/fuel cost instead.
//
// Plain data only — NOT inserted into the database by this file. A future seed/ingestion script
// resolves each `sectorSlug` to a real company_sectors.id and calls
// upsertSectorOperatingMetricTemplate({ sectorId, metricKey, label, unit, description }) for each
// row below (see ./sectors.js).
export const SECTOR_METRIC_SEEDS = [
  // Banks — deposit-funded lenders. These four numbers are what a bank's page actually needs;
  // "revenue" isn't even a meaningful line for a bank the way it is for an FMCG company (see
  // migration 035's comment on company_financial_line_items).
  {
    sectorSlug: "banks",
    metricKey: "net_interest_margin",
    label: "Net Interest Margin (NIM)",
    unit: "PERCENT",
    description: "Net interest income as a percentage of average interest-earning assets.",
  },
  {
    sectorSlug: "banks",
    metricKey: "gross_npa_ratio",
    label: "Gross NPA (GNPA)",
    unit: "PERCENT",
    description: "Gross non-performing assets as a percentage of gross advances.",
  },
  {
    sectorSlug: "banks",
    metricKey: "net_npa_ratio",
    label: "Net NPA (NNPA)",
    unit: "PERCENT",
    description: "Net non-performing assets, after provisioning, as a percentage of net advances.",
  },
  {
    sectorSlug: "banks",
    metricKey: "casa_ratio",
    label: "CASA Ratio",
    unit: "PERCENT",
    description: "Current and savings account deposits as a percentage of total deposits — a proxy for low-cost funding.",
  },
  // Cement — capacity-constrained manufacturing. These operating levers explain a cement
  // company's margin quarter to quarter far more directly than any single P&L line.
  {
    sectorSlug: "cement",
    metricKey: "installed_capacity",
    label: "Installed Capacity",
    unit: "MILLION_TONNES_PER_ANNUM",
    description: "Total clinker/cement installed production capacity.",
  },
  {
    sectorSlug: "cement",
    metricKey: "capacity_utilization",
    label: "Capacity Utilization",
    unit: "PERCENT",
    description: "Actual production as a percentage of installed capacity.",
  },
  {
    sectorSlug: "cement",
    metricKey: "realization_per_tonne",
    label: "Realization per Tonne",
    unit: "INR_PER_TONNE",
    description: "Average net sales realization per tonne of cement sold.",
  },
  {
    sectorSlug: "cement",
    metricKey: "fuel_power_cost_per_tonne",
    label: "Fuel & Power Cost per Tonne",
    unit: "INR_PER_TONNE",
    description: "Combined fuel and power cost incurred per tonne of cement produced — the sector's single largest variable cost driver.",
  },
];
