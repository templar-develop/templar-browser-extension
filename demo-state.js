// Stage 2 only. This module never makes a request or changes browser settings.
import { AUTO_PROFILE } from './profiles.js';
export const DEMO_LINK = 'https://sub.templarvpn.com/connect/demo-only/json';
export const DEMO_LOGIN = Object.freeze({ email: 'demo@templarvpn.test', password: 'demo-templar' });
// A fixed demonstration result, not a measured server speed.
export const DEMO_AUTO_REGION = 'ch';
export const DEMO_LATENCY_MS = Object.freeze({ msk: 62, ch: 48, 'ch-xhttp': 55, se: 74, 'se-xhttp': 79, nl: 69, 'nl-xhttp': 76 });
export const REGIONS = Object.freeze([
  { ...AUTO_PROFILE, country: 'Европейский союз', load: null },
  { id: 'msk', name: 'Москва [Youtube без рекламы]', country: 'Россия', flag: 'ru', load: 'low', transport: 'tcp' },
  { id: 'ch', name: 'Швейцария', country: 'Швейцария', flag: 'ch', load: 'low', transport: 'tcp' },
  { id: 'ch-xhttp', name: 'Швейцария — Дополнительный', country: 'Швейцария', flag: 'ch', load: 'low', transport: 'xhttp' },
  { id: 'se', name: 'Швеция', country: 'Швеция', flag: 'se', load: 'low', transport: 'tcp' },
  { id: 'se-xhttp', name: 'Швеция — Дополнительный', country: 'Швеция', flag: 'se', load: 'low', transport: 'xhttp' },
  { id: 'nl', name: 'Нидерланды', country: 'Нидерланды', flag: 'nl', load: 'medium', transport: 'tcp' },
  { id: 'nl-xhttp', name: 'Нидерланды — Дополнительный', country: 'Нидерланды', flag: 'nl', load: 'medium', transport: 'xhttp' },
]);
export const SCENARIOS = Object.freeze(['welcome', 'setup', 'auth-choice', 'onboarding', 'login', 'telegram', 'rf-question', 'ready', 'connected', 'expired', 'error', 'conflict']);

export function validateSubscriptionLink(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname === 'sub.templarvpn.com'
      && !url.username && !url.password && !url.port && !url.search && !url.hash
      && /^\/connect\/[a-zA-Z0-9_-]{8,128}(?:\/json)?\/?$/.test(url.pathname);
  } catch { return false; }
}

export function demoSubscription(now = Date.now()) {
  return { expiresAt: now + 30 * 24 * 60 * 60 * 1000, plan: 'Базовый', trafficUnlimited: true, devices: { used: 1, limit: 1 } };
}

export function createState(scenario = 'ready', selectedRegion = 'msk', now = Date.now()) {
  if (!SCENARIOS.includes(scenario)) throw new Error('Unknown demo scenario');
  if (!REGIONS.some(region => region.id === selectedRegion)) throw new Error('Unknown region');
  return {
    scenario,
    selectedRegion,
    subscription: ['welcome', 'setup', 'auth-choice', 'onboarding', 'login', 'telegram', 'rf-question'].includes(scenario) ? null : demoSubscription(now),
    authMethod: scenario === 'login' ? 'cabinet' : scenario === 'telegram' ? 'telegram' : 'link',
    signedIn: false,
    telegramPending: false,
    connectedAt: null,
    view: 'home',
    busy: false,
    refreshing: false,
    pingBusy: false,
  };
}

// Store only the non-sensitive region preference; pasted links are never stored.
export function readPreference(storage) {
  try {
    const value = storage.getItem('templar-browser-demo-region');
    return REGIONS.some(region => region.id === value) ? value : 'msk';
  } catch { return 'msk'; }
}

export function savePreference(storage, id) {
  if (!REGIONS.some(region => region.id === id)) return;
  try { storage.setItem('templar-browser-demo-region', id); } catch { /* Private mode can disable storage. */ }
}
