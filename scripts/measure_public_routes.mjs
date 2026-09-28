// Bounded read-only latency sample, not a load test or a Core Web Vitals measurement.
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) throw Error("Pass the verified base URL to measure");
const rows = [];
for (const path of ["/", "/api/search?q=100033", "/api/freshness", "/fund/100033", "/funds", "/compare"]) {
  const samples = [];
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    try {
      const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
      const headersMs = performance.now() - start;
      const body = await response.text();
      samples.push({ status: response.status, responseHeadersMs: Math.round(headersMs), totalMs: Math.round(performance.now() - start), bytes: Buffer.byteLength(body), cache: response.headers.get("x-vercel-cache"), applicationError: body.includes("Application error: a server-side exception") });
    } catch (error) { samples.push({ error: error.name }); }
  }
  rows.push({ path, samples });
}
console.log(JSON.stringify({ base, measuredAt: new Date().toISOString(), scope: "Three sequential fetches per route; response-header time approximates TTFB. Different local and hosted environments are not directly comparable.", rows }, null, 2));
