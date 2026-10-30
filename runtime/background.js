import { MeasurementJob } from './measurement-job.js';
import { API_BASE, ALLOW_LOCAL_FIXTURE } from './config.js';
import { BrowserApi } from './api.js';
import { Controller } from './controller.js';
import { ProxyDriver } from './proxy-driver.js';
import { authenticationResponse, protectedHost } from './policy.js';
import { checkedSubscriptionLink } from './subscription-link.js';
import { TelegramLogin } from './telegram-login.js';
import { measureLatency, measureSpeed } from './measurements.js';

const api = globalThis.browser || globalThis.chrome;
const remote = new BrowserApi(API_BASE, { allowLocalFixture: ALLOW_LOCAL_FIXTURE });
const driver = new ProxyDriver(api, remote.base ? new URL(remote.base).hostname : 'cabinet.templarvpn.com');
const controller = new Controller({ api: remote, driver, local: api.storage.local, session: api.storage.session,
  probe: options => measureLatency(options) });
const telegram = new TelegramLogin({ remote, session: api.storage.session, deviceId: () => controller.installationId(),
  acceptSession: value => controller.acceptSession(value), openTab: url => api.tabs.create({ url }) });
const jobs = new MeasurementJob(publishState);
const publicState = async () => ({ ...controller.publicState(), measurement: jobs.snapshot(), telegramPending: await telegram.pending().catch(() => false) });
let queue = Promise.resolve();
let renewalAbort = null;
const authAttempts = new Map();
const safeCodes = new Set(['SERVICE_NOT_CONFIGURED', 'SERVICE_UNAVAILABLE', 'ACCESS_DENIED', 'RATE_LIMITED',
  'MEASUREMENT_CANCELLED', 'MEASUREMENT_BUSY', 'DEVICE_LIMIT_REACHED', 'EMAIL_UNVERIFIED', 'SUBSCRIPTION_REQUIRED', 'TELEGRAM_EXPIRED', 'MEASUREMENT_TOO_SHORT',
  'INVALID_RESPONSE', 'INVALID_RULES', 'INVALID_LEASE', 'INVALID_REGION', 'INVALID_LINK', 'INVALID_LOGIN', 'PROXY_CONFLICT', 'LATENCY_UNAVAILABLE']);

const ready = (async () => {
  for (const area of [api.storage.local, api.storage.session]) {
    if (area.setAccessLevel) await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  }
  await controller.init();
})().catch(() => {
  driver.context = { ...driver.context, active: true, lease: null, forceBlocked: true };
  controller.active = true; controller.status = 'blocked'; controller.lastError = 'SERVICE_UNAVAILABLE';
});

function allowedSender(sender) {
  return sender.id === api.runtime.id && sender.url === api.runtime.getURL('popup.html');
}

async function publishState() {
  try { await api.runtime.sendMessage({ type: 'STATE_UPDATED', state: await publicState() }); } catch { /* Closed popup. */ }
}

async function command(message, job) {
  await ready;
  switch (message?.type) {
    case 'GET_STATE': return publicState();
    case 'IMPORT': {
      const subscriptionUrl = checkedSubscriptionLink(message.link);
      await controller.authenticate('/session', { subscriptionUrl });
      await telegram.clear(); return publicState();
    }
    case 'LOGIN_EMAIL': {
      if (typeof message.email !== 'string' || message.email.length > 254 || typeof message.password !== 'string'
        || message.password.length < 1 || new TextEncoder().encode(message.password).length > 72) throw new Error('INVALID_LOGIN');
      await controller.authenticate('/auth/email', { email: message.email.trim(), password: message.password });
      await telegram.clear(); return publicState();
    }
    case 'TELEGRAM_START': await telegram.start(); await syncTelegramAlarm(); return publicState();
    case 'TELEGRAM_POLL': await telegram.poll(); return publicState();
    case 'PING': return jobs.run(job, options => controller.measureRegions(options));
    case 'SELECT': return controller.select(message.region);
    case 'CONNECT': return jobs.run(job, options => controller.connect(options));
    case 'SPEEDTEST': return jobs.run(job, async options => {
      if (controller.publicState().status !== 'connected') throw new Error('ACCESS_DENIED');
      if (!protectedHost('speed.cloudflare.com', controller.rules)) throw new Error('INVALID_RULES');
      const speedtest = await measureSpeed(options);
      if (controller.publicState().status !== 'connected') throw new Error('ACCESS_DENIED');
      await controller.rememberSpeedTest(speedtest);
      return controller.publicState();
    });
    case 'DISCONNECT': return controller.disconnect();
    case 'REFRESH': return jobs.run(job, options => controller.refresh(options));
    case 'RULES': return job ? jobs.run(job, options => controller.updateRules(message.rules, options)) : controller.updateRules(message.rules);
    case 'LOGOUT': await telegram.clear(); return controller.logout();
    default: throw new Error('INVALID_RESPONSE');
  }
}

async function syncRenewalAlarm() {
  await ready;
  if (controller.active && (controller.account || controller.login)) {
    const alarm = await api.alarms.get('templar-renew');
    if (!alarm || alarm.periodInMinutes !== 0.5) {
      await api.alarms.create('templar-renew', { periodInMinutes: 0.5 });
    }
  } else if (api.alarms.clear) {
    await api.alarms.clear('templar-renew');
  }
}

async function syncTelegramAlarm() {
  if (await telegram.pending()) {
    if (!await api.alarms.get('templar-login')) await api.alarms.create('templar-login', { periodInMinutes: 0.5 });
  } else await api.alarms.clear('templar-login');
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!allowedSender(sender)) { sendResponse({ ok: false, error: 'ACCESS_DENIED' }); return false; }
  const respond = async next => {
    try {
      await next;
      await syncRenewalAlarm(); await syncTelegramAlarm();
      sendResponse({ ok: true, state: await publicState() });
    } catch (error) {
      const code = error.code || error.message;
      sendResponse({ ok: false, error: safeCodes.has(code) ? code : 'SERVICE_UNAVAILABLE', state: await publicState() });
    }
  };
  // State reads and cancellation never wait behind network measurements.
  if (message?.type === 'GET_STATE') { void respond(ready); return true; }
  if (message?.type === 'CANCEL_MEASUREMENT') { jobs.cancel(); void respond(ready); return true; }
  if (['DISCONNECT', 'LOGOUT'].includes(message?.type)) { jobs.cancel(true); renewalAbort?.abort(); }
  else if (jobs.current) {
    void respond(Promise.reject(new Error('MEASUREMENT_BUSY'))); return true;
  }
  let job;
  if (['PING', 'SPEEDTEST', 'CONNECT', 'REFRESH'].includes(message?.type)) job = jobs.start({ PING: 'ping', SPEEDTEST: 'speedtest', CONNECT: 'connect', REFRESH: 'connect' }[message.type]);
  if (message?.type === 'RULES' && controller.active && message.rules?.rfServices !== undefined
      && message.rules.rfServices !== controller.rules.rfServices) job = jobs.start('connect');
  const next = queue.then(() => command(message, job));
  queue = next.catch(() => {});
  void respond(next);
  return true;
});

if (driver.firefox) {
  api.proxy.onRequest.addListener(async details => { await ready; return driver.resolveFirefox(details.url); }, { urls: ['<all_urls>'] });
} else {
  api.webRequest.onAuthRequired.addListener((details, callback) => {
    ready.then(() => callback(authenticationResponse(details, driver.context.active && !driver.context.forceBlocked ? driver.context.lease : null, authAttempts)))
      .catch(() => callback(details.isProxy ? { cancel: true } : {}));
  }, { urls: ['<all_urls>'] }, ['asyncBlocking']);
  const forget = details => authAttempts.delete(details.requestId);
  api.webRequest.onCompleted.addListener(forget, { urls: ['<all_urls>'] });
  api.webRequest.onErrorOccurred.addListener(forget, { urls: ['<all_urls>'] });
}

api.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'templar-login') {
    queue = queue.then(async () => {
      await ready;
      if (await telegram.pending()) {
        try { await telegram.poll(); } catch { /* Safe public state and retryable pending flow survive popup closure. */ }
      }
      await syncTelegramAlarm();
      try { await api.runtime.sendMessage({ type: 'STATE_UPDATED', state: await publicState() }); } catch { /* No popup. */ }
    }).catch(() => {});
    return;
  }
  if (alarm.name !== 'templar-renew') return;
  if (renewalAbort) return;
  const abort = new AbortController();
  renewalAbort = abort;
  const renewal = queue.then(async () => {
    await ready;
    if (abort.signal.aborted) return;
    if (controller.active && (controller.account || controller.login)) {
      try {
        await controller.ensureAccount({ signal: abort.signal, remember: true });
        await controller.refresh({ signal: abort.signal });
      } catch (error) {
        if ((error.code || error.message) !== 'MEASUREMENT_CANCELLED') await controller.connectionError(error);
      }
      try { await api.runtime.sendMessage({ type: 'STATE_UPDATED', state: await publicState() }); }
      catch { /* A closed popup has no receiver. */ }
    } else if (api.alarms.clear) await api.alarms.clear('templar-renew');
  });
  queue = renewal.catch(() => {}).finally(() => { if (renewalAbort === abort) renewalAbort = null; });
});
let recoveryQueued = false;
function recover() {
  if (recoveryQueued || jobs.current) return;
  recoveryQueued = true;
  const next = queue.then(async () => {
    await ready;
    const upgrade = Boolean(remote.base && controller.account && !controller.login);
    if (!upgrade && !controller.active && (controller.account || !controller.login)) return;
    const job = jobs.start('connect');
    try {
      await jobs.run(job, async options => {
        await controller.ensureAccount({ ...options, remember: upgrade });
        if (controller.active) await controller.refresh(options);
      });
    } catch (error) {
      if ((error.code || error.message) === 'MEASUREMENT_CANCELLED') await controller.disconnect();
      else await controller.connectionError(error);
    }
    await syncRenewalAlarm(); await syncTelegramAlarm(); await publishState();
  });
  queue = next.catch(() => {}).finally(() => { recoveryQueued = false; });
}
const startup = () => { void Promise.all([syncRenewalAlarm(), syncTelegramAlarm()]).catch(() => {}); recover(); };
api.runtime.onInstalled.addListener(startup);
api.runtime.onStartup.addListener(startup);
globalThis.addEventListener?.('online', recover);
globalThis.navigator?.connection?.addEventListener?.('change', recover);
// Full browser restart empties storage.session. Restore the saved login and
// prior VPN intent immediately; a worker restart also recovers an expired lease.
void ready.then(() => {
  if ((!controller.account && controller.login) || (remote.base && controller.account && !controller.login)
      || (controller.active && controller.publicState().status === 'blocked')) recover();
});
