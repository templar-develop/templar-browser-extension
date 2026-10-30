import { flagMarkup } from '../flags.js';
import { measurementStatus, pingMarkup } from './measurement-ui.js';
import { diagnosticReport } from './diagnostics.js';
import { resumedAuthView } from './auth-view.js';
import { BUILD_VERSION, SOURCE_CODE_URL } from './config.js';
import { readPreferences, savePreferences, addDomain, escapeHTML } from '../preferences.js';
import { renderSettings, SETTINGS_VIEWS, renderRfServicesQuestion } from '../settings-ui.js';
import { startLocalization, setLocale, getLocale } from '../i18n.js';
import { renderSpeedTest, speedTestShortcut } from '../speedtest-ui.js';
import { animateScreen } from '../motion.js';
import { AUTO_PROFILE, protocolLabel, transportLabel } from '../profiles.js';
import { startStarfield } from '../starfield.js';
import { renderAuthChoice } from '../onboarding-ui.js';
import { safeFragment } from './safe-dom.js';

startStarfield(document.querySelector('#stars'));

const api = globalThis.browser || globalThis.chrome;
const nativeExtension = ['chrome-extension:', 'moz-extension:'].includes(location.protocol) && Boolean(api?.runtime?.id);
const screen = document.querySelector('#screen');
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
// Some privacy modes can make localStorage throw while the popup remains
// usable. Keep an in-memory fallback so storage failure cannot block login.
const storage = (() => {
  try { return globalThis.localStorage; }
  catch { return { getItem: () => null, setItem: () => {} }; }
})();
let preferences = readPreferences(storage);
let state = { status: 'disconnected', subscription: null, selectedRegion: 'auto', active: false, serviceConfigured: false };
let view;
let auth = 'link';
let busy = false;
let actionSequence = 0;
let telegramPending = false;
let telegramPollBusy = false;
let telegramTimer;
let speedResult = null;
let lastMessage = '';
let showDiagnostics = false;
let firstRun = storage.getItem('templar-browser-onboarded') !== '1';
view = firstRun ? 'welcome' : 'home';
document.documentElement.dataset.theme = preferences.theme;

const messages = {
  SERVICE_NOT_CONFIGURED: 'Эта сборка не настроена для подключения к серверу расширения.',
  SERVICE_UNAVAILABLE: 'Сервис недоступен. Попробуйте ещё раз.',
  LATENCY_UNAVAILABLE: 'Замер пинга пока недоступен. Можно подключиться без него.',
  ACCESS_DENIED: 'Подписка неактивна или требуется повторный вход.',
  RATE_LIMITED: 'Слишком много попыток. Попробуйте позже.',
  INVALID_RESPONSE: 'Не удалось подтвердить ответ сервера.',
  INVALID_LEASE: 'Не удалось подтвердить защищённое подключение.',
  INVALID_REGION: 'Эта локация недоступна для подписки.',
  INVALID_LINK: 'Проверьте ссылку подписки Templar VPN.',
  INVALID_LOGIN: 'Проверьте email и пароль от личного кабинета.',
  EMAIL_UNVERIFIED: 'Сначала подтвердите email в личном кабинете.',
  DEVICE_LIMIT_REACHED: 'Достигнут лимит устройств. Удалите ненужное устройство в личном кабинете и повторите вход.',
  SUBSCRIPTION_REQUIRED: 'Не удалось выбрать активную подписку. Войдите по её ссылке из личного кабинета.',
  TELEGRAM_EXPIRED: 'Время входа через Telegram истекло. Откройте бота заново.',
  MEASUREMENT_CANCELLED: '',
  MEASUREMENT_BUSY: 'Проверка уже выполняется. Дождитесь завершения или остановите её.',
  MEASUREMENT_TOO_SHORT: 'Замер слишком короткий. Повторите проверку.',
  INVALID_RULES: 'Проверьте правила доменов.',
  PROXY_CONFLICT: 'Настройки подключения заняты другим расширением или политикой браузера.',
};

function acceptState(next) {
  if (next?.status) {
    state = next;
    speedResult = next.speedtest || null;
    if (typeof next.telegramPending === 'boolean') telegramPending = next.telegramPending;
    if (state.rules) preferences = { ...preferences, rfServices: firstRun ? preferences.rfServices : state.rules.rfServices, routing: { mode: state.rules.mode, domains: state.rules.domains } };
  }
}

async function send(type, data = {}) {
  const response = await api.runtime.sendMessage({ type, ...data });
  acceptState(response?.state);
  if (!response?.ok) { const error = new Error(messages[response?.error] ?? messages.SERVICE_UNAVAILABLE); error.code = response?.error; throw error; }
  return response.state;
}

async function act(type, data = {}) {
  if ((busy || state.measurement) && !['DISCONNECT', 'LOGOUT'].includes(type)) return;
  const action = ++actionSequence;
  busy = true; lastMessage = ''; render();
  try { await send(type, data); view = (['IMPORT', 'LOGIN_EMAIL'].includes(type) && (firstRun || preferences.rfServices === null)) ? 'rf-question' : 'home'; }
  catch (error) { lastMessage = error.message; }
  finally { if (action === actionSequence) busy = false; render(); }
}

function regionName() {
  return state.selectedRegion === 'auto' ? AUTO_PROFILE.name : state.subscription?.regions.find(region => region.id === state.selectedRegion)?.name || 'Выберите локацию';
}

function headerText() {
  if (state.status === 'connected') return 'Подключено';
  if (state.status === 'blocked') return 'Трафик заблокирован';
  return 'Готовы к подключению';
}

function connectionDuration() {
  const prefix = getLocale() === 'en' ? 'Connected' : 'Подключено';
  if (!state.connectedAt) return prefix;
  const seconds = Math.max(0, Math.floor((Date.now() - state.connectedAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${prefix} · ${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function home() {
  const connected = state.status === 'connected';
  const connecting = state.status === 'connecting' || state.measurement?.kind === 'connect';
  const region = state.subscription.regions.find(region => region.id === state.selectedRegion);
  const expires = new Intl.DateTimeFormat(getLocale() === 'en' ? 'en-GB' : 'ru-RU', { dateStyle: 'medium' }).format(state.subscription.expiresAt);
  const loadBadge = region?.load ? `<span class="load-dot ${region.load}" aria-label="${region.load === 'high' ? 'Высокая' : region.load === 'medium' ? 'Средняя' : 'Низкая'} нагрузка"></span>` : '';
  return `<div class="connection-hero">
    <div class="power-wrap ${connected ? 'connected' : connecting ? 'busy' : ''}"><button class="power-button ${connected ? 'connected' : ''}" data-command="${state.active ? 'DISCONNECT' : 'CONNECT'}" aria-label="${state.active ? 'Отключить браузер' : 'Подключить браузер'}" ${busy && !connecting ? 'disabled' : ''}>${icon('power')}</button></div>
    <h2 class="hero-title">${connecting ? 'Подключаем…' : headerText()}</h2><p class="hero-subtitle"><span data-connection-time>${connected ? connectionDuration() : state.active ? 'Подключение требует восстановления' : 'Остальные приложения — без изменений'}</span></p></div>
    ${state.status === 'blocked' ? `<div class="recovery-actions"><button class="primary-button" data-command="REFRESH" data-recover-connection ${busy ? 'disabled' : ''}>${icon('refresh')} Восстановить</button><button class="outline-button" data-command="DISCONNECT" data-release-connection>Отключить VPN</button></div>` : ''}
    <div class="location-block"><p class="label-uppercase">ЛОКАЦИЯ</p><button class="location-card" data-view="locations"><img class="flag" src="./assets/emoji/${region?.flag || 'eu'}.svg" alt=""><span class="location-copy"><strong>${escapeHTML(regionName())}</strong><small>${state.selectedRegion === 'auto' ? 'Выбирает самый быстрый сервер' : `${loadBadge}${protocolLabel(region)}`}</small></span>${pingMarkup(state.resolvedRegion || state.selectedRegion, state.latencies, state.measurement)}${icon('chevron')}</button></div>
    ${speedTestShortcut()}<div class="subscription-card"><div class="subscription-top"><span>Подписка</span><strong>до ${expires}</strong></div><div class="traffic-row"><span>${state.subscription.trafficLimitBytes === null ? 'Трафик безлимитный' : `${Math.round(state.subscription.trafficUsedBytes / 1048576)} / ${Math.round(state.subscription.trafficLimitBytes / 1048576)} MiB`}</span><span>${state.subscription.devices.used} / ${state.subscription.devices.limit} устройств</span></div><a class="device-buy-link" href="https://cabinet.templarvpn.com/subscriptions" target="_blank" rel="noopener noreferrer">Докупить устройства ${icon('arrow')}</a></div>
    <div class="bottom-actions account-actions"><button class="text-button" data-command="REFRESH">${icon('refresh')} Обновить подписку</button><button class="text-button" data-view="replace">${icon('link')} Заменить ссылку</button><button class="text-button" data-command="LOGOUT">${icon('logout')} Выйти</button></div>`;
}

function signIn() {
  const disabled = busy || !state.serviceConfigured ? 'disabled' : '';
  return `<section class="onboarding">${state.loginRecoverable ? `<button class="primary-button field-gap" data-command="REFRESH" ${state.measurement ? 'disabled' : ''}>${state.measurement ? 'Восстанавливаем вход…' : 'Восстановить сохранённый вход'}</button>` : ''}${state.active ? '<button class="text-button" data-command="DISCONNECT">Отключить VPN</button>' : ''}<div class="auth-tabs" role="tablist" aria-label="Способ входа">${[['link', 'По ссылке'], ['email', 'Личный кабинет'], ['telegram', 'Telegram']].map(([id, label]) => `<button data-auth="${id}" role="tab" aria-selected="${auth === id}">${label}</button>`).join('')}</div>
    <h2>${auth === 'email' ? 'Войдите в кабинет.' : auth === 'telegram' ? 'Вход через Telegram.' : view === 'replace' ? 'Заменить ссылку' : 'Добавить подписку'}</h2>
    ${!state.serviceConfigured ? `<p class="error-notice">${messages.SERVICE_NOT_CONFIGURED}</p>` : ''}
    ${auth === 'link' ? `<form id="link-form"><label class="input-label" for="real-link">Ссылка подписки</label><input id="real-link" name="link" type="text" inputmode="url" spellcheck="false" autocomplete="off" placeholder="https://sub.templarvpn.com/connect/…" ${disabled}><button class="primary-button field-gap" type="submit" ${disabled}>${view === 'replace' ? 'Заменить ссылку' : 'Добавить подписку'}</button></form>` : auth === 'email' ? `<form id="email-form" autocomplete="off"><label class="input-label" for="real-email">Email</label><input id="real-email" name="email" type="email" autocomplete="off" ${disabled}><label class="input-label field-gap" for="real-password">Пароль</label><input id="real-password" name="password" type="password" autocomplete="off" ${disabled}><button class="primary-button field-gap" type="submit" ${disabled}>Войти</button></form>` : `<button class="primary-button" data-command="TELEGRAM_START" ${disabled}>${icon('telegram')} Войти через Telegram</button>${telegramPending ? '<p class="field-help">Ожидаем подтверждения входа.</p>' : ''}`}
    ${view === 'replace' ? '<button class="demo-example" data-view="home">Отмена</button>' : ''}</section>`;
}

function firstRunView() {
  if (view === 'welcome') return `<section class="onboarding first-run"><div class="onboarding-emblem">${icon('shield')}</div><h2>Добро пожаловать в Templar VPN</h2><p class="field-help">Расширение подключает только браузер и сохраняет выбранную локацию.</p><button class="primary-button" data-first-run="setup">Далее ${icon('arrow')}</button></section>`;
  if (view === 'setup') return `<section class="onboarding first-run"><div class="onboarding-emblem">${icon('settings')}</div><h2>Настроим расширение</h2><p class="field-help">По умолчанию: русский язык и тёмная тема.</p><div class="setup-choice"><h3>Язык</h3><div class="setting-segment">${['ru', 'en'].map(value => `<button data-setup-locale="${value}" aria-pressed="${preferences.locale === value}">${value === 'ru' ? 'Русский' : 'English'}</button>`).join('')}</div><h3>Тема</h3><div class="setting-segment">${['dark', 'light'].map(value => `<button data-setup-theme="${value}" aria-pressed="${preferences.theme === value}">${value === 'dark' ? 'Тёмная' : 'Светлая'}</button>`).join('')}</div></div><button class="primary-button" data-first-run="auth-choice">Продолжить ${icon('arrow')}</button></section>`;
  if (view === 'auth-choice') return renderAuthChoice('data-first-run="setup"');
  if (view === 'rf-question') return renderRfServicesQuestion(preferences, 'data-first-run="complete"');
  return null;
}

function locations() {
  const measuring = busy || Boolean(state.measurement);
  const badge = region => region.load ? `<span class="load-dot ${region.load}" aria-label="${region.load === 'high' ? 'Высокая' : region.load === 'medium' ? 'Средняя' : 'Низкая'} нагрузка"></span>` : '';
  return `<section class="location-view"><button class="back-button" data-view="home">${icon('chevron')} Назад</button><h2>Ваша точка подключения.</h2><button class="primary-button" ${state.measurement?.kind === 'ping' ? 'data-measurement-cancel' : `data-ping-refresh ${measuring ? 'disabled' : ''}`}>${state.measurement?.kind === 'ping' ? 'Остановить проверку' : 'Обновить пинг'}</button><p class="field-help">Задержка HTTPS до www.gstatic.com через каждую локацию. Проверка идёт параллельно и не прерывает VPN.</p><div class="region-list" role="radiogroup" aria-label="Локации">${[AUTO_PROFILE, ...state.subscription.regions].map(region => `<button class="region-option" role="radio" aria-checked="${state.selectedRegion === region.id}" aria-label="${escapeHTML(region.name)}, ${transportLabel(region)}" data-region="${escapeHTML(region.id)}">${flagMarkup(region.flag)}<span class="location-copy"><strong>${escapeHTML(region.name)}</strong><small>${region.id === 'auto' ? 'Выбирает самый быстрый сервер' : `${badge(region)}${protocolLabel(region)}`}</small></span>${region.id !== 'auto' ? pingMarkup(region.id, state.latencies, state.measurement) : ''}${state.selectedRegion === region.id ? icon('check') : ''}</button>`).join('')}</div></section>`;
}

function render() {
  const region = state.subscription?.regions.find(region => region.id === state.selectedRegion);
  const measuring = Boolean(state.measurement);
  const intro = firstRun && ['welcome', 'setup', 'auth-choice', 'rf-question'].includes(view) ? firstRunView() : null;
  screen.classList.toggle('home-view', !intro && view === 'home' && Boolean(state.subscription));
  screen.replaceChildren(safeFragment(intro || (view === 'speedtest' ? renderSpeedTest({ region: regionName(), flag: region?.flag || 'eu', runtime: true, result: speedResult, connected: state.status === 'connected', busy: busy || measuring }) : SETTINGS_VIEWS.includes(view) ? renderSettings(view, preferences, { runtime: true, version: BUILD_VERSION, sourceUrl: SOURCE_CODE_URL }) : view === 'locations' && state.subscription ? locations() : !state.subscription || view === 'replace' ? signIn() : home())));
  if (measuring) screen.prepend(safeFragment(measurementStatus(state.measurement, { active: state.active, locale: getLocale() })));
  if (view === 'about') {
    screen.append(safeFragment(`<button class="outline-button" data-diagnostics>Показать диагностику</button>${showDiagnostics ? '<textarea class="diagnostic-report" readonly aria-label="Диагностика подключения"></textarea>' : ''}`));
    const report = screen.querySelector('.diagnostic-report');
    if (report) report.value = diagnosticReport(state, BUILD_VERSION);
  }
  if (lastMessage) {
    const message = document.createElement('p');
    message.className = 'error-notice'; message.setAttribute('role', 'alert'); message.textContent = lastMessage;
    screen.append(message);
  }
  for (const button of screen.querySelectorAll('[data-command],[data-region]')) button.disabled = (busy || measuring) && !['DISCONNECT', 'LOGOUT'].includes(button.dataset.command);
  const key = firstRun ? `first-run:${view}` : SETTINGS_VIEWS.includes(view) || view === 'locations' ? view : !state.subscription || view === 'replace' ? `auth:${auth}` : 'home';
  animateScreen(screen, { key, phase: busy ? 'connecting' : state.status, region: state.selectedRegion });
}

async function rules(value) {
  // Domain edits must preserve the RF choice instead of relying on the
  // controller's default. An explicit saved choice always wins.
  const candidate = { rfServices: preferences.rfServices === true, ...value };
  try {
    await send('RULES', { rules: candidate });
    preferences = { ...preferences, rfServices: candidate.rfServices, routing: { mode: candidate.mode, domains: candidate.domains } };
    savePreferences(storage, preferences); render();
    return true;
  }
  catch (error) { lastMessage = error.message; render(); return false; }
}

screen.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.target);
  if (event.target.id === 'link-form') act('IMPORT', { link: String(data.get('link') || '') });
  if (event.target.id === 'email-form') {
    const password = String(data.get('password') || '');
    event.target.reset();
    act('LOGIN_EMAIL', { email: String(data.get('email') || ''), password });
  }
  if (event.target.id === 'routing-form') {
    try { rules(addDomain(preferences, data.get('domain') || '').routing); }
    catch (error) { lastMessage = error.message === 'DUPLICATE_DOMAIN' ? 'Этот домен уже есть в списке.' : 'Введите домен, например example.com, без протокола и пути.'; render(); }
  }
});

screen.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-diagnostics')) { showDiagnostics = true; render(); screen.querySelector('.diagnostic-report')?.select(); return; }
  if (button.hasAttribute('data-measurement-cancel')) {
    try { await send('CANCEL_MEASUREMENT'); } catch (error) { lastMessage = error.message; }
    render(); return;
  }
  const interrupt = ['DISCONNECT', 'LOGOUT'].includes(button.dataset.command) && state.measurement;
  if ((busy || state.measurement) && !interrupt) return;
  if (button.hasAttribute('data-ping-refresh')) {
    const action = ++actionSequence;
    busy = true; lastMessage = ''; render();
    try { await send('PING'); } catch (error) { lastMessage = error.message; }
    finally { if (action === actionSequence) busy = false; render(); }
    return;
  }
  if (button.hasAttribute('data-speedtest-run')) {
    const action = ++actionSequence;
    busy = true; lastMessage = ''; render();
    try { const result = await send('SPEEDTEST'); speedResult = result.speedtest; }
    catch (error) { lastMessage = error.message; }
    finally { if (action === actionSequence) busy = false; render(); }
    return;
  }
  const setupLocale = event.target.closest('[data-setup-locale]');
  if (setupLocale) { preferences = { ...preferences, locale: setupLocale.dataset.setupLocale }; setLocale(preferences.locale); savePreferences(storage, preferences); render(); return; }
  const setupTheme = event.target.closest('[data-setup-theme]');
  if (setupTheme) { preferences = { ...preferences, theme: setupTheme.dataset.setupTheme }; document.documentElement.dataset.theme = preferences.theme; savePreferences(storage, preferences); render(); return; }
  if (button.dataset.firstRun === 'complete') {
    const rfServices = preferences.rfServices === true;
    if (nativeExtension && !await rules({ ...preferences.routing, rfServices })) return;
    preferences = { ...preferences, rfServices };
    savePreferences(storage, preferences);
    firstRun = false;
    storage.setItem('templar-browser-onboarded', '1');
    view = 'home'; render(); return;
  }
  const authChoice = event.target.closest('[data-auth-choice]');
  if (authChoice) { auth = authChoice.dataset.authChoice; view = 'home'; render(); screen.querySelector('input, [data-command="TELEGRAM_START"]')?.focus(); return; }
  if (button.dataset.firstRun) { view = button.dataset.firstRun; render(); return; }
  if (button.dataset.settingsView || button.dataset.view) { view = button.dataset.settingsView || button.dataset.view; auth = 'link'; lastMessage = ''; render(); screen.scrollTop = 0; }
  if (button.dataset.auth) { auth = button.dataset.auth; render(); }
  if (button.dataset.region) await act('SELECT', { region: button.dataset.region });
  if (button.dataset.command === 'TELEGRAM_START') {
    try {
      busy = true; render();
      await send('TELEGRAM_START'); resumeTelegram();
    } catch (error) { lastMessage = error.message; }
    finally { busy = false; render(); }
  } else if (button.dataset.command) await act(button.dataset.command);
  if (button.dataset.routingMode) await rules({ ...preferences.routing, mode: button.dataset.routingMode });
  if (button.dataset.removeDomain) await rules({ ...preferences.routing, domains: preferences.routing.domains.filter(domain => domain !== button.dataset.removeDomain) });
  if (button.dataset.preference) {
    const key = button.dataset.preference;
    const value = key === 'rfServices' ? button.dataset.value === 'true' : button.dataset.value;
    preferences = { ...preferences, [key]: value };
    if (key === 'rfServices' && nativeExtension) {
      await rules({ ...preferences.routing, rfServices: value });
      return;
    }
    savePreferences(storage, preferences); document.documentElement.dataset.theme = preferences.theme;
    setLocale(preferences.locale); render();
  }
});

function resumeTelegram() {
  clearInterval(telegramTimer);
  if (!telegramPending) return;
  auth = 'telegram'; view = 'home';
  const poll = async () => {
    if (telegramPollBusy || !telegramPending) return;
    telegramPollBusy = true;
    try {
      await send('TELEGRAM_POLL');
      if (!telegramPending) {
        clearInterval(telegramTimer); lastMessage = '';
        view = firstRun || preferences.rfServices === null ? 'rf-question' : 'home';
      }
    } catch (error) {
      lastMessage = error.message;
      if (!telegramPending) clearInterval(telegramTimer);
    } finally { telegramPollBusy = false; render(); }
  };
  telegramTimer = setInterval(poll, 2500);
  poll();
}

document.querySelector('#settings-button').addEventListener('click', () => { view = 'settings'; render(); screen.scrollTop = 0; });
document.querySelector('#about-button').addEventListener('click', () => { view = 'about'; render(); screen.scrollTop = 0; });
const connectionTimer = setInterval(() => {
  if (state.status !== 'connected') return;
  if (state.leaseExpiresAt && state.leaseExpiresAt <= Date.now()) {
    state = { ...state, status: 'blocked' };
    if (view === 'home') render();
    return;
  }
  const target = screen.querySelector('[data-connection-time]');
  if (target) target.textContent = connectionDuration();
}, 1000);
window.addEventListener('pagehide', () => { clearInterval(telegramTimer); clearInterval(connectionTimer); });
startLocalization(preferences.locale);
if (nativeExtension) api.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== api.runtime.id || message?.type !== 'STATE_UPDATED') return;
  const wasMeasuring = Boolean(state.measurement);
  acceptState(message.state);
  if (!busy || wasMeasuring || state.measurement) {
    if (state.subscription && telegramPending === false && auth === 'telegram') {
      clearInterval(telegramTimer); view = firstRun || preferences.rfServices === null ? 'rf-question' : 'home';
    }
    render();
  }
});
if (nativeExtension) send('GET_STATE').then(() => {
  const resumed = resumedAuthView(state, { firstRun, rfServices: preferences.rfServices });
  if (resumed) { view = resumed.view; if (resumed.auth) auth = resumed.auth; }
  resumeTelegram(); render();
}).catch(error => { lastMessage = error.message; render(); });
else { lastMessage = 'Откройте эту сборку как расширение. Настройки браузера не изменены.'; render(); }
