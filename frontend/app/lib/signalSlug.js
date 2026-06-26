// Stable slug for a flow signal (AMC + asset class), used to route SignalCard → detail page.
// Works on the full AMC name or the stripped one — both produce the same slug.
export function slugify(name) {
  return String(name || "")
    .replace(/\s*mutual fund/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function signalSlug(amc, asset) {
  return `${slugify(amc)}-${String(asset || "").toLowerCase()}`;
}
