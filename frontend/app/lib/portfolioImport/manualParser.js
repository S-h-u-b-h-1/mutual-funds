// Manual entry doesn't parse a file — it reshapes already-structured input (one object per
// holding, from a form) into the same intermediate row shape every CSV parser produces, so the
// Normalizer never needs to know whether a row came from a file or a form.
export function parseManualEntries(entries) {
  const rows = [];
  const warnings = [];
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) warnings.push("No holdings were entered.");

  list.forEach((e, i) => {
    if (!e || typeof e !== "object") {
      warnings.push(`Entry ${i + 1}: not a valid holding object, skipped.`);
      return;
    }
    rows.push({
      _sourceLine: i + 1,
      schemeName: e.schemeName ?? e.name ?? "",
      isin: e.isin ?? "",
      units: e.units != null ? String(e.units) : "",
      folioNumber: e.folioNumber ?? "",
      avgCost: e.avgCost != null ? String(e.avgCost) : "",
      purchaseValue: e.purchaseValue != null ? String(e.purchaseValue) : "",
      currentValue: "", // always computed from live NAV, never accepted from manual entry
      purchaseDate: e.purchaseDate ?? "",
    });
  });

  return { rows, warnings, source: "manual" };
}
