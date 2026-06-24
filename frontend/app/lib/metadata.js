// Factsheet metadata access. Reads the ingestion bundle (metadata.json). Today it is empty
// — the parsers are implemented + tested but no factsheet PDF could be fetched in this
// environment — so every fund correctly shows "Not yet available from source". The instant
// a real parse populates metadata.json, fund pages display it and the cost score activates.
import data from "../data/metadata.json";

const byCode = {};
for (const m of data.metadata || []) {
  if (m.scheme_code) byCode[String(m.scheme_code)] = m;
}

export const metadataStatus = {
  parserReady: data.parser_ready || 0,
  succeeded: data.succeeded || 0,
  populated: data.schemes_populated || 0,
};

export function getMetadata(code) {
  return byCode[String(code)] || null;
}
