// Local-only UI QA proxy. Never imported by the app or deployed.
// Start `npm start -- --hostname 127.0.0.1 --port 3100`, then run this file.
// Port 3101 serves the real UI with an explicitly labelled mocked completion.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { handleChat } from "../app/lib/ai/service.mjs";
import { MODEL } from "../app/lib/ai/provider.mjs";
const daily = JSON.parse(
  await readFile(new URL("../app/data/daily.json", import.meta.url)),
);
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/ai/chat" && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request("http://127.0.0.1:3101/api/ai/chat", {
      method: "POST",
      headers: req.headers,
      body: Buffer.concat(chunks),
    });
    const result = await handleChat(request, {
      configFor: () => ({ model: MODEL }),
      slot: () => () => {},
      contextFor: async (input) => {
        const sample =
          input.pageContext.type === "signal" ||
          /signal|flow/i.test(input.message);
        return {
          intent: "market",
          asOf: [daily.asOf],
          isSampleDataIncluded: sample,
          limitations: [],
          evidence: [
            {
              id: "MF-001",
              asOf: daily.asOf,
              freshness: "stale",
              href: sample ? "/signals" : "/",
              isSample: sample,
              type: sample ? "sample_disclosure" : "market_breadth",
              source: sample
                ? "MF Pulse methodology · SAMPLE"
                : "MF Pulse calculation · AMFI NAV",
              text: sample
                ? "Flow signals use SAMPLE data. No live flow conclusion can be drawn."
                : `Breadth was ${daily.breadth1d}% with ${daily.advancers} advancers as of ${daily.asOf}.`,
            },
          ],
        };
      },
      generate: async (messages) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const e = JSON.parse(messages[1].content).evidence_data_only[0];
        return `Local QA fixture — mocked provider. ${e.text} [MF-001]`;
      },
    });
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(await result.text());
    return;
  }
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: 3100,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: "127.0.0.1:3100" },
    },
    (reply) => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502);
    res.end("Start the local app on port 3100 first.");
  });
  req.pipe(upstream);
});
server.listen(3101, "127.0.0.1", () =>
  console.log(
    "LOCAL QA ONLY: http://127.0.0.1:3101/ai — mocked provider; no external inference.",
  ),
);
