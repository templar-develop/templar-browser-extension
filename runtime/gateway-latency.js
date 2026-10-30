import { throwIfCancelled } from './measurement-job.js';

export function checkedLatencyHost(value) {
  if (typeof value !== 'string' || !/^browser-[a-z0-9-]{1,32}\.platina300\.org$/.test(value)) throw new Error('INVALID_RESPONSE');
  return value;
}

export async function measureGateway(host, { signal, fetcher = globalThis.fetch.bind(globalThis), now = () => performance.now() } = {}) {
  host = checkedLatencyHost(host);
  const deadline = AbortSignal.timeout(2500);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const values = [];
  // Warm DNS/TLS once, then measure two small round trips over the reused TLS
  // connection. This is browser-to-gateway RTT, not an ICMP or VPN egress ping.
  for (let i = 0; i < 3; i++) {
    throwIfCancelled(signal);
    const start = now();
    const response = await fetcher(`https://${host}:9442/latency?nonce=${crypto.randomUUID()}`, {
      signal: combined, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
    });
    if (response.status !== 204) throw new Error('SERVICE_UNAVAILABLE');
    const ms = now() - start;
    if (!Number.isFinite(ms) || ms <= 0) throw new Error('INVALID_RESPONSE');
    if (i) values.push(ms);
  }
  throwIfCancelled(signal);
  return Math.max(1, Math.round(values.reduce((a, b) => a + b) / values.length));
}

export async function measureGateways(regions, { signal, probe = measureGateway, onResult = async () => {} } = {}) {
  const groups = new Map();
  for (const region of regions) {
    if (!region.latencyHost) { await onResult([region.id], null); continue; }
    const host = checkedLatencyHost(region.latencyHost);
    groups.set(host, [...(groups.get(host) || []), region.id]);
  }
  const pending = [...groups];
  await Promise.all(Array.from({ length: Math.min(8, pending.length) }, async () => {
    while (pending.length) {
      throwIfCancelled(signal);
      const [host, ids] = pending.shift();
      let ms = null;
      try {
        ms = await probe(host, { signal });
        if (!Number.isFinite(ms) || ms <= 0 || ms >= 60000) ms = null;
      } catch { throwIfCancelled(signal); }
      throwIfCancelled(signal);
      await onResult(ids, ms === null ? null : Math.round(ms));
    }
  }));
  throwIfCancelled(signal);
}
