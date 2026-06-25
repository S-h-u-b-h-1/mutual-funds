// Factsheet metadata access. Reads the ingestion bundle (metadata.json). Today it is empty
// — the parsers are implemented + tested but no factsheet PDF could be fetched in this
// environment — so every fund correctly shows "Not yet available from source". The instant
// a real parse populates metadata.json, fund pages display it and the cost score activates.
import data from "../data/metadata.json";

const byCode = {};
// manager (cleaned) -> { name, codes:Set, funds:Set }
const byManager = {};

function splitManagers(raw) {
  return String(raw).split(/&|,|\band\b/).map((s) => s.replace(/\*|Mr\.|Ms\.|Mrs\./g, "").trim()).filter((s) => s.length > 2);
}

export const managerSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

for (const m of data.metadata || []) {
  if (m.scheme_code) byCode[String(m.scheme_code)] = m;
  if (m.fund_manager) {
    for (const mgr of splitManagers(m.fund_manager)) {
      const slug = managerSlug(mgr);
      const e = (byManager[slug] ||= { name: mgr, slug, codes: [], funds: new Set() });
      e.codes.push(String(m.scheme_code));
      e.funds.add(m.scheme_name.split(" - ")[0].trim());
    }
  }
}

export const metadataStatus = {
  parserReady: data.parser_ready || 0,
  succeeded: data.succeeded || 0,
  populated: data.schemes_populated || 0,
};

export function getMetadata(code) {
  return byCode[String(code)] || null;
}

export function getManager(slug) {
  const e = byManager[slug];
  return e ? { name: e.name, slug, codes: e.codes, funds: [...e.funds] } : null;
}

export function allManagers() {
  return Object.values(byManager).map((e) => ({ name: e.name, slug: e.slug, fundCount: e.funds.size, codes: e.codes }));
}
