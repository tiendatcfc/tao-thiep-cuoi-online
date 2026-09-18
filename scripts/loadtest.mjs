// Minimal load generator. Deliberately not autocannon: adding a dependency
// to measure once is worse than 40 lines that say exactly what they do.
const url = process.argv[2];
const concurrency = Number(process.argv[3] ?? 20);
const total = Number(process.argv[4] ?? 500);

const latencies = [];
let sent = 0, ok = 0, failed = 0;
const started = Date.now();

async function worker() {
  while (sent < total) {
    sent++;
    const t0 = performance.now();
    try {
      const res = await fetch(url);
      await res.arrayBuffer();
      if (res.ok) ok++; else failed++;
    } catch {
      failed++;
    }
    latencies.push(performance.now() - t0);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

const elapsed = (Date.now() - started) / 1000;
latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))].toFixed(0);
console.log(JSON.stringify({
  concurrency, requests: total, ok, failed,
  seconds: Number(elapsed.toFixed(1)),
  rps: Number((total / elapsed).toFixed(1)),
  p50_ms: Number(pct(0.5)), p95_ms: Number(pct(0.95)), p99_ms: Number(pct(0.99)),
  max_ms: Number(latencies[latencies.length - 1].toFixed(0)),
}));
