import { normalizeDomain, ROUTING_MODES, MAX_DOMAINS } from '../preferences.js';
import { RF_DOMAINS, RF_SUFFIXES, russianService } from './russian-services.js';

export const BLOCK_PROXY = 'PROXY 127.0.0.1:9';

export function checkedRules(value) {
  if (!value || !ROUTING_MODES.includes(value.mode) || !Array.isArray(value.domains) || value.domains.length > MAX_DOMAINS) throw new Error('INVALID_RULES');
  return { mode: value.mode, domains: [...new Set(value.domains.map(normalizeDomain))], rfServices: value.rfServices === true };
}

export function protectedHost(host, rules) {
  const normalized = host.toLowerCase().replace(/\.$/, '');
  if (rules.rfServices === false && russianService(normalized)) return false;
  const matched = rules.domains.some(domain => normalized === domain || normalized.endsWith('.' + domain));
  return rules.mode === 'all' || (rules.mode === 'bypass' ? !matched : matched);
}

export function checkedLease(value, now = Date.now()) {
  const port = value?.proxy?.port;
  const host = value?.proxy?.host;
  if (typeof host !== 'string' || !/^[a-z0-9][a-z0-9-]*\.platina300\.org$/.test(host)
      || !Number.isInteger(port) || (![443, 2053, 8443].includes(port) && !(port >= 9443 && port <= 9460))
      || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + 5 * 60_000
      || typeof value.username !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.username)
      || typeof value.password !== 'string' || !/^[A-Za-z0-9._~-]{16,4096}$/.test(value.password)) throw new Error('INVALID_LEASE');
  return { proxy: { host, port }, username: value.username, password: value.password, expiresAt: value.expiresAt };
}

export function pacScript({ rules, lease = null, controlHost, forceBlocked = false }) {
  rules = checkedRules(rules);
  if (lease) lease = checkedLease(lease);
  if (!/^[a-z0-9.-]+$/.test(controlHost)) throw new Error('INVALID_CONTROL_HOST');
  const config = JSON.stringify({ rules, controlHost, rfDomains: RF_DOMAINS, rfSuffixes: RF_SUFFIXES, expiresAt: lease?.expiresAt || 0,
    proxy: lease && !forceBlocked ? `HTTPS ${lease.proxy.host}:${lease.proxy.port}` : BLOCK_PROXY });
  // PAC contains no password, subscription link or account token, and performs no DNS lookup.
  return `var config = ${config};
function FindProxyForURL(url, host) {
  host = host.toLowerCase().replace(/\\.$/, '');
  if (host === config.controlHost) return 'DIRECT';
  // Chromium removes HTTPS paths before calling PAC. The dedicated responder
  // port accepts only bounded nonce requests and cannot relay browser traffic.
  if (new RegExp('^https://browser-[a-z0-9-]{1,32}[.]platina300[.]org:9442/(latency[?]nonce=[a-f0-9-]{36})?$').test(url)) return 'DIRECT';
  if (new RegExp('^https://browser-[a-z0-9-]{1,32}[.]platina300[.]org:9441/(site-latency[?]nonce=[a-f0-9-]{36})?$').test(url)) return 'DIRECT';
  if (config.rules.rfServices === false) {
    var rf = config.rfDomains.concat(config.rfSuffixes);
    for (var j = 0; j < rf.length; j++) {
      if (host === rf[j] || host.slice(-(rf[j].length + 1)) === '.' + rf[j]) return 'DIRECT';
    }
  }
  var matched = false;
  for (var i = 0; i < config.rules.domains.length; i++) {
    var domain = config.rules.domains[i];
    if (host === domain || host.slice(-(domain.length + 1)) === '.' + domain) { matched = true; break; }
  }
  var useProxy = config.rules.mode === 'all' || (config.rules.mode === 'bypass' ? !matched : matched);
  if (!useProxy) return 'DIRECT';
  if (Date.now() >= config.expiresAt) return '${BLOCK_PROXY}';
  return config.proxy;
}`;
}

export function firefoxProxy(url, { rules, lease, controlHost, active, forceBlocked = false }, now = Date.now()) {
  if (!active) return []; // Leave the user's existing browser proxy policy in place.
  let host;
  try { host = new URL(url).hostname; }
  catch { return [{ type: 'http', host: '127.0.0.1', port: 9 }, null]; }
  if (host === controlHost || /^https:\/\/browser-[a-z0-9-]{1,32}\.platina300\.org:9442\/latency\?nonce=[a-f0-9-]{36}$/.test(url)
      || /^https:\/\/browser-[a-z0-9-]{1,32}\.platina300\.org:9441\/site-latency\?nonce=[a-f0-9-]{36}$/.test(url)
      || !protectedHost(host, rules)) return { type: 'direct' };
  if (forceBlocked || !lease || now >= lease.expiresAt) return [{ type: 'http', host: '127.0.0.1', port: 9 }, null];
  return [{ type: 'https', host: lease.proxy.host, port: lease.proxy.port,
    proxyAuthorizationHeader: 'Basic ' + btoa(lease.username + ':' + lease.password),
    connectionIsolationKey: lease.username }, null]; // null explicitly disables Firefox's default-proxy fallback.
}

export function authenticationResponse(details, lease, attempts, now = Date.now()) {
  if (!details.isProxy) return {}; // Never send proxy credentials to a website's 401 challenge.
  if (!lease || now >= lease.expiresAt || details.challenger?.host !== lease.proxy.host || details.challenger?.port !== lease.proxy.port) return { cancel: true };
  const previous = attempts.get(details.requestId);
  let count = typeof previous === 'number' ? previous : previous?.count || 0;
  if (previous && typeof previous === 'object' && now - previous.seenAt > 60_000) { attempts.delete(details.requestId); count = 0; }
  if (count >= 1) return { cancel: true };
  if (attempts.size >= 2048) attempts.delete(attempts.keys().next().value);
  attempts.set(details.requestId, { count: count + 1, seenAt: now });
  return { authCredentials: { username: lease.username, password: lease.password } };
}
