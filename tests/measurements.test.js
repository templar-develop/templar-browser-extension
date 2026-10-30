import test from 'node:test';
import assert from 'node:assert/strict';
import { measureLatency, measureBandwidth } from '../runtime/measurements.js';
test('latency excludes cold connection and uses a median, not one outlier', async () => {
  let clock = 0; const samples = [900, 51, 700, 49];
  const latency = await measureLatency({ now: () => clock, fetcher: async (url, options) => {
    assert.ok(url.startsWith('https://speed.cloudflare.com/__down?bytes=0&')); assert.equal(options.cache, 'no-store');
    clock += samples.shift(); return new Response(null, { status: 200 });
  } });
  assert.equal(latency, 51); assert.equal(samples.length, 0);
});
test('parallel bandwidth divides real transferred bytes by shared wall time and respects its budget', async () => {
  let clock = 0; let transferred = 0; let calls = 0;
  const result = await measureBandwidth('download', { duration: 3000, maxBytes: 12 * 1024 * 1024, now: () => clock,
    fetcher: async url => {
      const bytes = Number(new URL(url).searchParams.get('bytes')); transferred += bytes; calls++;
      return { ok: true, body: { getReader() { let sent = false; return { async read() {
        if (sent) return { done: true }; sent = true; clock += 200; return { done: false, value: new Uint8Array(bytes) };
      }, async cancel() {} }; } } };
    } });
  assert.ok(calls > 4); assert.equal(result.bytes, transferred);
  assert.ok(result.bytes <= 14 * 1024 * 1024);
  const measured = result.bytes - 4 * 512 * 1024;
  assert.equal(result.mbps, Math.round(measured * 8 / result.durationMs / 1000 * 10) / 10);
});
test('truncated or oversized downloads are rejected instead of showing invented throughput', async () => {
  for (const delta of [-1, 1]) await assert.rejects(measureBandwidth('download', { fetcher: async url => {
    const bytes = Number(new URL(url).searchParams.get('bytes'));
    return new Response(new Uint8Array(bytes + delta));
  } }), /INVALID_RESPONSE/);
});

test('measurement rate limiting stays explicit and never produces a partial speed', async () => {
  const fetcher = async () => new Response(null, { status: 429 });
  await assert.rejects(measureLatency({ fetcher }), /RATE_LIMITED/);
  await assert.rejects(measureBandwidth('download', { fetcher }), /RATE_LIMITED/);
});

test('cancellation stops all four open speed-test streams and returns no partial throughput', async () => {
  const abort = new AbortController(); let requests = 0; let cancelled = 0; let ready;
  const began = new Promise(resolve => { ready = resolve; });
  const task = measureBandwidth('download', { signal: abort.signal, fetcher: async () => {
    if (++requests === 4) ready();
    return { ok: true, body: { getReader() {
      let resolveRead;
      return { read: () => new Promise(resolve => { resolveRead = resolve; }), async cancel() { cancelled++; resolveRead?.({ done: true }); } };
    } } };
  } });
  await began; await new Promise(resolve => setImmediate(resolve)); abort.abort();
  await assert.rejects(task, /MEASUREMENT_CANCELLED/);
  assert.equal(requests, 4); assert.ok(cancelled >= 4);
});
