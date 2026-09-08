const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "../app/data");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "publication.json")));
for (const [file, expected] of Object.entries(manifest.outputs)) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
  if (actual !== expected.sha256) throw Error(`Publication checksum mismatch: ${file}; regenerate the manifest after validating coverage.`);
}
const funds = JSON.parse(fs.readFileSync(path.join(root, "funds.json")));
if (funds.asOf !== manifest.sourceAsOf || Object.keys(funds.funds).length !== manifest.outputRowCounts.funds) throw Error("Publication identity/count mismatch");
console.log(`Verified publication ${manifest.publicationId}`);
