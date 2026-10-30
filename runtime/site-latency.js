import { checkedLatencyHost } from './gateway-latency.js';
import { throwIfCancelled } from './measurement-job.js';

export function checkedSiteProbe(value, region, now = Date.now()) {
  if (!value || Object.keys(value).sort().join(',') !== 'expiresAt,host,regionId,ticket'
      || value.regionId !== region.id || value.host !== region.latencyHost
      || typeof value.ticket !== 'string' || !/^bp_[A-Za-z0-9_-]{43}$/.test(value.ticket)
      || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + 16000) throw new Error('INVALID_RESPONSE');
  checkedLatencyHost(value.host);
  return value;
}

export async function measureSite(probe, { signal, fetcher = globalThis.fetch.bind(globalThis), now = () => performance.now() } = {}) {
  const deadline = AbortSignal.timeout(3500);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const values = [];
  // The responder waits for an actual HTTPS 204 through this issued VLESS
  // profile. Warm both TLS legs once; never add separate RTT estimates.
  for (let i = 0; i < 3; i++) {
    throwIfCancelled(signal);
    const start = now();
    const response = await fetcher(`https://${checkedLatencyHost(probe.host)}:9441/site-latency?nonce=${crypto.randomUUID()}`, {
      signal: combined, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      headers: { Authorization: 'Bearer ' + probe.ticket },
    });
    if (response.status !== 204) throw new Error('SERVICE_UNAVAILABLE');
    const ms = now() - start;
    if (!Number.isFinite(ms) || ms <= 0) throw new Error('INVALID_RESPONSE');
    if (i) values.push(ms);
  }
  throwIfCancelled(signal);
  return Math.max(1, Math.round((values[0] + values[1]) / 2));
}

export async function measureSites(regions, probes, { signal, probe = measureSite, onResult = async () => {} } = {}) {
  if (!probes || typeof probes !== 'object' || Array.isArray(probes)
      || Object.keys(probes).some(id => !regions.some(region => region.id === id))) throw new Error('INVALID_RESPONSE');
  const pending = [...regions];
  await Promise.all(Array.from({ length: Math.min(8, pending.length) }, async () => {
    while (pending.length) {
      throwIfCancelled(signal);
      const region = pending.shift();
      let ms = null;
      if (probes[region.id]) {
        const ticket = checkedSiteProbe(probes[region.id], region);
        try {
          ms = await probe(ticket, { signal });
          if (!Number.isFinite(ms) || ms <= 0 || ms >= 60000) ms = null;
        } catch { throwIfCancelled(signal); }
      }
      throwIfCancelled(signal);
      await onResult([region.id], ms === null ? null : Math.round(ms));
    }
  }));
  throwIfCancelled(signal);
}
