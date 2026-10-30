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

test('live bandwidth progress uses only observed payload and stays within the final measurement', async () => {
  for (const direction of ['download', 'upload']) {
    let clock = 0; const samples = [];
    const result = await measureBandwidth(direction, { duration: 3000, maxBytes: 12 * 1024 * 1024, now: () => clock,
      onSample: async sample => samples.push(sample), fetcher: async (url, options) => {
        const bytes = direction === 'download' ? Number(new URL(url).searchParams.get('bytes')) : options.body.byteLength;
        return { ok: true, body: { getReader() { let read = false; return { async read() {
          if (read) return { done: true }; read = true; clock += 200;
          return { done: false, value: new Uint8Array(direction === 'download' ? bytes : 2) };
        }, async cancel() {} }; } } };
      } });
    assert.ok(samples.length > 1);
    for (const sample of samples) {
      assert.ok(sample.bytes <= result.bytes);
      assert.equal(sample.mbps, Math.round(sample.bytes * 8 / sample.durationMs / 1000 * 10) / 10);
    }
    assert.ok(samples.length < 25, 'progress must be throttled');
  }
});

test('speed gauge bounds untrusted progress and follows the measured phase', async () => {
  const { speedPresentation, renderSpeedTest } = await import('../speedtest-ui.js');
  const progress = speedPresentation({ busy: true, job: { kind: 'speedtest', stage: 'upload', speed: { latency: 43, download: 82.4, mbps: 31.7 } } });
  assert.equal(progress.stage, 'upload'); assert.equal(progress.reading, '31.7'); assert.equal(progress.download, '82.4'); assert.equal(progress.upload, '—');
  assert.ok(progress.angle > -120 && progress.angle < 120);
  const invalid = speedPresentation({ busy: true, job: { kind: 'speedtest', stage: '<script>', speed: { mbps: Infinity, download: '<img>', latency: -1 } } });
  assert.equal(invalid.reading, '—'); assert.equal(invalid.angle, -120); assert.equal(invalid.download, '—');
  const html = renderSpeedTest({ runtime: true, connected: true, busy: true, job: { kind: 'speedtest', stage: 'download', speed: { mbps: 82.4 } } });
  assert.match(html, /data-measurement-cancel/); assert.match(html, /data-speed-reading>82.4/);
});
