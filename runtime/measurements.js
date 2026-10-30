import { throwIfCancelled } from './measurement-job.js';

const ENDPOINT = 'https://speed.cloudflare.com';
const MIB = 1024 * 1024;
const options = { cache: 'no-store', credentials: 'omit', redirect: 'error' };
const median = values => { const v = [...values].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };

function checkResponse(response) {
  if (!response.ok) throw new Error(response.status === 429 ? 'RATE_LIMITED' : 'SERVICE_UNAVAILABLE');
}

export async function measureLatency({ fetcher = globalThis.fetch.bind(globalThis), now = () => performance.now(), samples = 3, signal } = {}) {
  const values = [];
  // Discard DNS, proxy authentication, TLS and connection warm-up.
  for (let i = 0; i <= samples; i++) {
    throwIfCancelled(signal);
    const start = now();
    const response = await fetcher(ENDPOINT + '/__down?bytes=0&templar=' + crypto.randomUUID(), { ...options, signal: requestSignal(signal, 6000) });
    checkResponse(response);
    await response.arrayBuffer();
    throwIfCancelled(signal);
    const ms = now() - start;
    if (!Number.isFinite(ms) || ms <= 0) throw new Error('INVALID_RESPONSE');
    if (i) values.push(ms);
  }
  return Math.round(median(values));
}

function requestSignal(signal, timeout) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

async function transfer(fetcher, direction, bytes, now, signal, onBytes = async () => {}) {
  throwIfCancelled(signal);
  const start = now();
  const response = await fetcher(ENDPOINT + (direction === 'download' ? '/__down?bytes=' + bytes : '/__up?') + '&templar=' + crypto.randomUUID(),
    { ...options, signal: requestSignal(signal, 12000), ...(direction === 'upload' ? { method: 'POST', body: new Uint8Array(bytes) } : {}) });
  checkResponse(response);
  if (!response.body) throw new Error('SERVICE_UNAVAILABLE');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  let received = 0;
  try {
    while (true) {
      throwIfCancelled(signal);
      const { done, value } = await reader.read();
      throwIfCancelled(signal);
      if (done) break;
      received += value.byteLength;
      if (direction === 'download') await onBytes(value.byteLength);
      if (received > (direction === 'download' ? bytes : 64 * 1024)) throw new Error('INVALID_RESPONSE');
    }
  } finally { signal?.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); }
  if (direction === 'download' && received !== bytes) throw new Error('INVALID_RESPONSE');
  if (direction === 'upload') await onBytes(bytes);
  return { bytes, ms: Math.max(1, now() - start) };
}

export async function measureBandwidth(direction, { fetcher = globalThis.fetch.bind(globalThis), now = () => performance.now(), duration = 6000, streams = 4,
  onSample = async () => {}, maxBytes = direction === 'download' ? 96 * MIB : 64 * MIB, signal } = {}) {
  throwIfCancelled(signal);
  const group = new AbortController();
  const sharedSignal = signal ? AbortSignal.any([signal, group.signal]) : group.signal;
  const initial = direction === 'download' ? MIB : 256 * 1024;
  // Four warmed streams approximate a sustained browser download/upload.
  // Report all completed bytes over the shared wall clock, never sum per-stream Mbps.
  try {
    await Promise.all(Array.from({ length: streams }, () => transfer(fetcher, direction, initial / 2, now, sharedSignal).catch(error => { group.abort(); throw error; })));
  } catch (error) { throwIfCancelled(signal); throw error; }
  const start = now(); let reserved = 0; let total = 0; let observed = 0; let lastReport = start; let reporting = false; let failure = null;
  const observe = async bytes => {
    observed += bytes;
    const elapsed = now() - start;
    if (reporting || elapsed < 250 || now() - lastReport < 250) return;
    lastReport = now(); reporting = true;
    try { await onSample({ mbps: Math.round(observed * 8 / elapsed / 1000 * 10) / 10, bytes: observed, durationMs: Math.round(elapsed) }); }
    finally { reporting = false; }
  };
  await Promise.all(Array.from({ length: streams }, async () => {
    let size = initial;
    while (!failure && !sharedSignal.aborted && now() - start < duration && reserved < maxBytes) {
      const bytes = Math.min(size, maxBytes - reserved); reserved += bytes;
      try {
        const result = await transfer(fetcher, direction, bytes, now, sharedSignal, observe); total += result.bytes;
        size = Math.max(64 * 1024, Math.min(direction === 'download' ? 8 * MIB : 2 * MIB, Math.round(bytes * 1000 / result.ms)));
      } catch (error) { failure ||= error; group.abort(); }
    }
  }));
  throwIfCancelled(signal);
  if (failure) throw failure;
  const elapsed = now() - start;
  if (elapsed < 1000 || !total) throw new Error('MEASUREMENT_TOO_SHORT');
  return { mbps: Math.round(total * 8 / elapsed / 1000 * 10) / 10, bytes: total + streams * initial / 2, durationMs: Math.round(elapsed) };
}

export async function measureSpeed(options = {}) {
  const onProgress = options.onProgress || (async () => {});
  await onProgress({ stage: 'latency', completed: 0, total: 3, speed: {} });
  const latency = await measureLatency(options);
  await onProgress({ stage: 'download', completed: 1, total: 3, speed: { latency } });
  const download = await measureBandwidth('download', { ...options,
    onSample: sample => onProgress({ stage: 'download', completed: 1, total: 3, speed: { latency, mbps: sample.mbps } }) });
  await onProgress({ stage: 'upload', completed: 2, total: 3, speed: { latency, download: download.mbps } });
  const upload = await measureBandwidth('upload', { ...options,
    onSample: sample => onProgress({ stage: 'upload', completed: 2, total: 3, speed: { latency, download: download.mbps, mbps: sample.mbps } }) });
  return { latency, download: download.mbps, upload: upload.mbps, bytes: download.bytes + upload.bytes,
    durationMs: download.durationMs + upload.durationMs, method: 'https-4-streams' };
}
