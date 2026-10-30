export const ROUTING_MODES = Object.freeze(['all', 'bypass', 'only']);
export const MAX_DOMAINS = 100;
const KEY = 'templar-browser-demo-preferences';

export function normalizeDomain(value) {
  let candidate = String(value).trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
  if (!candidate || /[\s/@:?#[\]\\]/.test(candidate)) throw new Error('INVALID_DOMAIN');
  try { candidate = new URL(`https://${candidate}`).hostname; } catch { throw new Error('INVALID_DOMAIN'); }
  if (candidate.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(candidate)) throw new Error('INVALID_DOMAIN');
  return candidate;
}

export function readPreferences(storage) {
  const defaults = { locale: 'ru', theme: 'dark', rfServices: false, routing: { mode: 'all', domains: [] } };
  try {
    const value = JSON.parse(storage.getItem(KEY) || '{}');
    const domains = Array.isArray(value.routing?.domains) ? value.routing.domains : [];
    const valid = [];
    for (const domain of domains.slice(0, MAX_DOMAINS)) {
      try { valid.push(normalizeDomain(domain)); } catch { /* Reject corrupted preferences. */ }
    }
    return {
      locale: value.locale === 'en' ? 'en' : 'ru',
      theme: value.theme === 'light' ? 'light' : 'dark',
      rfServices: value.rfServices === true,
      routing: { mode: ROUTING_MODES.includes(value.routing?.mode) ? value.routing.mode : 'all', domains: [...new Set(valid)] },
    };
  } catch { return defaults; }
}

export function savePreferences(storage, preferences) {
  try { storage.setItem(KEY, JSON.stringify(preferences)); return true; } catch { return false; }
}

export function addDomain(preferences, value) {
  const domain = normalizeDomain(value);
  if (preferences.routing.domains.includes(domain)) throw new Error('DUPLICATE_DOMAIN');
  if (preferences.routing.domains.length >= MAX_DOMAINS) throw new Error('DOMAIN_LIMIT');
  return { ...preferences, routing: { ...preferences.routing, domains: [...preferences.routing.domains, domain] } };
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
