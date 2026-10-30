import { DEMO_LINK, DEMO_LOGIN, DEMO_AUTO_REGION, DEMO_LATENCY_MS, REGIONS, SCENARIOS, createState, demoSubscription, readPreference, savePreference, validateSubscriptionLink } from './demo-state.js';
import { ROUTING_MODES, readPreferences, savePreferences, addDomain } from './preferences.js';
import { SETTINGS_VIEWS, renderSettings, renderRfServicesQuestion } from './settings-ui.js';
import { getLocale, setLocale, startLocalization } from './i18n.js';
import { renderSpeedTest, speedTestShortcut } from './speedtest-ui.js';
import { animateScreen } from './motion.js';
import { protocolLabel, transportLabel } from './profiles.js';
import { startStarfield } from './starfield.js';
import { renderAuthChoice } from './onboarding-ui.js';

startStarfield(document.querySelector('#stars'));

const screen = document.querySelector('#screen');
const scenarios = document.querySelector('#scenarios');
const toast = document.querySelector('#toast');
let storage;
try { storage = window.localStorage; } catch { storage = null; }
let preferences = readPreferences(storage);
document.documentElement.dataset.theme = preferences.theme;
let firstRun = storage?.getItem('templar-browser-onboarded') !== '1';
let state = createState(firstRun ? 'welcome' : 'ready', readPreference(storage));
let generation = 0;
let toastTimeout;
let returnFocus;
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function flag(country) {
  return `<img class="flag" src="./assets/emoji/${country}.svg" alt="" width="31" height="31">`;
}

function latency(regionId) {
  const resolvedId = regionId === 'auto' ? DEMO_AUTO_REGION : regionId;
  return `<span class="latency" aria-label="Демонстрационный пинг: ${state.pingBusy ? 'обновляется' : `${DEMO_LATENCY_MS[resolvedId]} миллисекунд`}"><strong>${state.pingBusy ? '…' : `${DEMO_LATENCY_MS[resolvedId]} <span>мс</span>`}</strong><small>демо</small></span>`;
}

function notify(message) {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.hidden = false;
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 4000);
}

function setScenario(scenario) {
  if (!SCENARIOS.includes(scenario)) return;
  generation++;
  state = createState(scenario, state.selectedRegion);
  render();
}

function date(value) {
  return new Intl.DateTimeFormat(getLocale() === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Moscow' }).format(value);
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

function regionCard() {
  const region = REGIONS.find(region => region.id === state.selectedRegion);
  const autoDescription = state.scenario === 'connected'
    ? `Сейчас: ${REGIONS.find(region => region.id === DEMO_AUTO_REGION).name}`
    : 'Выбирает самый быстрый сервер';
  return `<div class="location-block"><p class="label-uppercase">ЛОКАЦИЯ</p>
    <button class="location-card" data-action="locations" ${state.busy ? 'disabled' : ''} aria-label="Выбрать локацию, сейчас ${region.name}">
      ${flag(region.flag)}<span class="location-copy"><strong>${region.name}</strong><small>${region.id === 'auto' ? autoDescription : `${loadBadge(region.load)}${protocolLabel(region)}`}</small></span>${latency(region.id)}${icon('chevron')}
    </button></div>`;
}

function subscriptionCard() {
  return `<div class="subscription-card"><div class="subscription-top"><span class="plan-badge">${icon('shield')} ${state.subscription.plan}</span><strong>до ${date(state.subscription.expiresAt)}</strong></div>
    <div class="traffic-row"><span>Трафик безлимитный</span><span>${state.subscription.devices.used} / ${state.subscription.devices.limit} устройств</span></div><a class="device-buy-link" href="https://cabinet.templarvpn.com/subscriptions" target="_blank" rel="noopener noreferrer">Докупить устройства ${icon('arrow')}</a></div>
    ${accountActions(true)}`;
}

function accountActions(includeRefresh = false) {
  return `<div class="bottom-actions account-actions">
    ${includeRefresh ? `<button class="text-button" data-action="refresh" ${state.refreshing || state.busy ? 'disabled' : ''}>${state.refreshing ? '<span class="spinner" aria-hidden="true"></span>' : icon('refresh')} ${state.refreshing ? 'Обновляем…' : 'Обновить подписку'}</button>` : ''}
    <button class="text-button" data-action="replace-link" ${state.busy || state.refreshing ? 'disabled' : ''}>${icon('link')} Заменить ссылку</button>
    <button class="text-button secondary" data-action="remove">${icon('logout')} Выйти</button>
  </div>`;
}

function loadBadge(load) {
  if (!load) return '';
  const label = load === 'high' ? 'Высокая нагрузка' : load === 'medium' ? 'Средняя нагрузка' : 'Низкая нагрузка';
  return `<span class="load-dot ${load}" aria-label="${label}" title="${label}"></span>`;
}

function welcome() {
  return `<section class="onboarding first-run"><div class="onboarding-emblem">${icon('shield')}</div><h2>Добро пожаловать в Templar VPN</h2><p class="field-help">Расширение подключает только браузер и сохраняет выбранную локацию.</p><button class="primary-button" data-action="welcome-next">Далее ${icon('arrow')}</button></section>`;
}

function setup() {
  return `<section class="onboarding first-run"><div class="onboarding-emblem">${icon('settings')}</div><h2>Настроим расширение</h2><p class="field-help">По умолчанию: русский язык и тёмная тема.</p><div class="setup-choice"><h3>Язык</h3><div class="setting-segment">${['ru','en'].map(value => `<button data-setup-locale="${value}" aria-pressed="${preferences.locale === value}">${value === 'ru' ? 'Русский' : 'English'}</button>`).join('')}</div><h3>Тема</h3><div class="setting-segment">${['dark','light'].map(value => `<button data-setup-theme="${value}" aria-pressed="${preferences.theme === value}">${value === 'dark' ? 'Тёмная' : 'Светлая'}</button>`).join('')}</div></div><button class="primary-button" data-action="setup-next">Продолжить ${icon('arrow')}</button></section>`;
}

function rfQuestion() {
  return renderRfServicesQuestion(preferences, 'data-action="rf-continue"');
}

function home() {
  const connected = state.scenario === 'connected';
  const error = state.scenario === 'error';
  const title = state.busy ? 'Подключаем…' : connected ? 'Подключено' : error ? 'Не удалось подключиться' : 'Готовы к подключению';
  const subtitle = state.busy ? (state.selectedRegion === 'auto' ? 'Выбираем самый быстрый сервер' : 'Настраиваем выбранную локацию') : connected ? 'Остальные приложения — без изменений' : error ? 'Выбранная локация временно недоступна' : 'Одно нажатие — и вы в сети';
  screen.classList.toggle('error-view', error);
  return `<div class="connection-hero">
    <div class="power-wrap ${connected ? 'connected' : ''} ${state.busy ? 'busy' : ''}"><button class="power-button ${connected ? 'connected' : ''}" data-action="power" aria-label="${connected ? 'Отключить браузер' : 'Подключить браузер'}" ${state.busy ? 'disabled' : ''}>${icon('power')}</button></div>
    <h2 class="hero-title">${title}</h2><p class="hero-subtitle"><span data-connection-time>${connected ? connectionDuration() : subtitle}</span></p></div>
    ${error ? `<div class="error-notice">${icon('info')}<span>Другую страну не включаем автоматически. Можно повторить попытку или выбрать локацию.</span></div>` : ''}
    ${regionCard()}${speedTestShortcut()}${subscriptionCard()}`;
}

function onboarding() {
  const title = state.authMethod === 'cabinet' ? 'Войдите в кабинет.' : state.authMethod === 'telegram' ? 'Вход через Telegram.' : 'Всё начинается<br>с вашей подписки.';
  const intro = state.authMethod === 'cabinet' ? 'Email и пароль от вашего личного кабинета.<br>В макете используйте только демоданные.' : state.authMethod === 'telegram' ? 'Подписка из Telegram появится здесь<br>после подтверждения входа.' : 'Добавьте ссылку Templar VPN.<br>Ту же, которой пользуетесь в Happ.';
  const content = state.authMethod === 'cabinet' ? cabinetForm() : state.authMethod === 'telegram' ? telegramForm() : linkForm();
  return `<section class="onboarding auth-${state.authMethod}"><button class="back-button" data-action="auth-choice">${icon('chevron')} Способы входа</button><div id="auth-content">
    <div class="onboarding-emblem">${icon(state.authMethod === 'cabinet' ? 'user' : state.authMethod === 'telegram' ? 'telegram' : 'link')}</div>
    <h2 id="onboard-title">${title}</h2><p class="field-help">${intro}</p>${content}</div>
    <div class="privacy-note">${icon('lock')} Демо · данные не сохраняются и не отправляются</div></section>`;
}

function linkForm() {
  return `
    <form id="subscription-form" novalidate><label class="input-label" for="subscription-link">Ссылка подписки</label>
      <input id="subscription-link" name="subscription-link" type="url" autocomplete="off" spellcheck="false" placeholder="https://sub.templarvpn.com/connect/…" aria-describedby="link-help" ${state.busy ? 'disabled' : ''}>
      <p class="field-help" id="link-help">В макете используйте тестовую ссылку.<br>Настоящая подписка не нужна.</p>
      <button class="primary-button" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Проверяем в демо…' : `Добавить подписку ${icon('arrow')}`}</button>
    </form>
    <button class="demo-example" data-action="example" ${state.busy ? 'disabled' : ''}>Попробовать на примере ${icon('arrow')}</button>`;
}

function cabinetForm() {
  return `<form id="cabinet-form" autocomplete="off" novalidate>
    <label class="input-label" for="cabinet-email">Email</label><input id="cabinet-email" name="email" type="email" autocomplete="off" spellcheck="false" placeholder="demo@templarvpn.test" aria-describedby="cabinet-help" ${state.busy ? 'disabled' : ''}>
    <label class="input-label field-gap" for="cabinet-password">Пароль</label><input id="cabinet-password" name="password" type="password" autocomplete="off" placeholder="Пароль от кабинета" aria-describedby="cabinet-help" ${state.busy ? 'disabled' : ''}>
    <div class="demo-credentials">Для макета: <code>demo@templarvpn.test</code><br>Пароль: <code>demo-templar</code></div>
    <p class="field-help" id="cabinet-help" aria-live="polite">Настоящие логин и пароль здесь не нужны.</p>
    <button class="primary-button" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Входим в демо…' : `Войти ${icon('arrow')}`}</button>
    </form><button class="demo-example" data-action="cabinet-example" ${state.busy ? 'disabled' : ''}>Войти с демоаккаунтом ${icon('arrow')}</button>`;
}

function telegramForm() {
  if (state.telegramPending) {
    return `<div class="telegram-wait"><span class="spinner" aria-hidden="true"></span><p role="status">Ожидаем подтверждения входа.<br>Это демонстрация: Telegram не открывался.</p>
      <button class="primary-button" data-action="telegram-confirm" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Входим в демо…' : 'Подтвердить вход в демо'}</button>
      <button class="demo-example" data-action="telegram-cancel">Отменить</button></div>`;
  }
  return `<div class="demo-credentials">В рабочей версии откроется наш Telegram-бот. Пароль и код из Telegram вводить здесь не потребуется.</div>
    <button class="primary-button" data-action="telegram-start">${icon('telegram')} Войти через Telegram</button>
    <p class="field-help">Сейчас кнопка покажет только макет подтверждения.</p>`;
}

function locations() {
  return `<section class="location-view" aria-labelledby="locations-title"><button class="back-button" data-action="back">${icon('chevron')} Назад</button>
    <h2 id="locations-title">Ваша точка подключения.</h2><p>Выберите страну или доверьтесь автовыбору.<br>В макете все подключения тестовые.</p>
    <div class="ping-toolbar"><span>ЗАДЕРЖКА В ДЕМО</span><button class="text-button" data-action="refresh-ping" ${state.pingBusy ? 'disabled' : ''}>${state.pingBusy ? '<span class="spinner" aria-hidden="true"></span>' : icon('refresh')} ${state.pingBusy ? 'Обновляем…' : 'Обновить пинг'}</button></div>
    <div class="region-list" role="radiogroup" aria-label="Локации">${REGIONS.map(region => `<button class="region-option" role="radio" aria-checked="${region.id === state.selectedRegion}" data-region="${region.id}" aria-label="${region.name}, ${transportLabel(region)}${region.id === 'auto' ? ', самый быстрый сервер' : ''}, демонстрационный пинг ${DEMO_LATENCY_MS[region.id === 'auto' ? DEMO_AUTO_REGION : region.id]} мс">${flag(region.flag)}<span class="location-copy"><strong>${region.name}</strong><small>${region.id === 'auto' ? 'Выбирает самый быстрый сервер' : `${loadBadge(region.load)}${protocolLabel(region)}`}</small></span>${latency(region.id)}${region.id === state.selectedRegion ? icon('check') : '<span class="radio-spacer"></span>'}</button>`).join('')}</div>
    <p class="selection-note">${icon('lock')}<span>Выбор сохраняется. При обновлении подписки локация сама не переключается.</span></p></section>`;
}

function problem() {
  const expired = state.scenario === 'expired';
  const title = expired ? 'Подписка закончилась' : 'Подключение занято';
  const description = expired ? 'Продлите подписку и вернитесь сюда.<br>Ваш выбор локации сохранится.' : 'Настройки прокси контролирует другое<br>расширение или политика браузера.';
  return `<div class="problem-hero"><div class="problem-icon">${icon(expired ? 'lock' : 'browser')}</div><h2>${title}</h2><p>${description}</p></div>
    <div class="problem-detail"><span>${expired ? 'Доступ завершился' : 'Выбранная локация'}</span><strong>${expired ? date(Date.now() - 86400000) : REGIONS.find(region => region.id === state.selectedRegion).name}</strong></div>
    <div class="problem-actions"><button class="primary-button" data-action="${expired ? 'renew' : 'check-conflict'}">${expired ? 'Продлить подписку' : 'Проверить ещё раз'} ${icon(expired ? 'arrow' : 'refresh')}</button>
    <button class="outline-button" data-action="${expired ? 'refresh' : 'conflict-help'}">${expired ? `${icon('refresh')} Я уже продлил` : `${icon('info')} Как освободить подключение`}</button></div>
    <p class="problem-status">${expired ? 'Доступ отключён' : 'Прокси-настройки не изменены'} · демонстрация</p>
    ${accountActions()}`;
}

function render() {
  screen.classList.remove('error-view');
  screen.classList.toggle('home-view', state.view === 'home' && ['ready', 'connected', 'error', 'connecting'].includes(state.scenario));
  screen.setAttribute('aria-busy', String(state.busy));
  const region = REGIONS.find(region => region.id === state.selectedRegion);
  screen.innerHTML = state.view === 'speedtest' ? renderSpeedTest({ region: region.name, flag: region.flag }) : SETTINGS_VIEWS.includes(state.view) ? renderSettings(state.view, preferences) : state.view === 'locations' ? locations() : state.scenario === 'welcome' ? welcome() : state.scenario === 'setup' ? setup() : state.scenario === 'auth-choice' ? renderAuthChoice(firstRun ? 'data-action="auth-back-setup"' : '') : state.scenario === 'rf-question' ? rfQuestion() : ['onboarding', 'login', 'telegram'].includes(state.scenario) ? onboarding() : ['expired', 'conflict'].includes(state.scenario) ? problem() : home();
  for (const button of scenarios.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.scenario === state.scenario));
  const key = state.view !== 'home' ? state.view : ['welcome', 'setup', 'auth-choice', 'onboarding', 'login', 'telegram', 'rf-question'].includes(state.scenario) ? `auth:${state.scenario}:${state.authMethod}` : ['expired', 'conflict'].includes(state.scenario) ? state.scenario : 'home';
  animateScreen(screen, { key, phase: state.busy ? 'connecting' : state.scenario, region: state.selectedRegion });
}

async function importDemo(link) {
  if (!validateSubscriptionLink(link)) {
    const input = document.querySelector('#subscription-link');
    const help = document.querySelector('#link-help');
    input.setAttribute('aria-invalid', 'true');
    help.classList.add('error');
    help.textContent = 'Нужна HTTPS-ссылка подписки Templar VPN. Можно нажать «Попробовать на примере».';
    input.focus();
    return;
  }
  // The input is deliberately discarded, not persisted or used as a request URL.
  const current = ++generation;
  state.busy = true;
  render();
  await wait(600);
  if (current !== generation) return;
  state = createState(firstRun || preferences.rfServices === null ? 'rf-question' : 'ready', state.selectedRegion);
  state.subscription = demoSubscription();
  render();
  notify('Добавлена тестовая подписка. Настоящие данные не проверялись.');
}

async function connect() {
  if (state.scenario === 'connected') {
    const { signedIn, authMethod } = state;
    setScenario('ready');
    Object.assign(state, { signedIn, authMethod, connectedAt: null });
    render();
    notify('Демонстрационное подключение отключено.');
    return;
  }
  if (!['ready', 'error'].includes(state.scenario) || state.busy) return;
  const current = ++generation;
  state.busy = true;
  render();
  await wait(900);
  if (generation !== current) return;
  state.scenario = 'connected';
  state.connectedAt = Date.now();
  state.busy = false;
  render();
  notify('Демонстрация подключения. Настройки браузера не изменились.');
}

function selectAuth(method) {
  if (!['link', 'cabinet', 'telegram'].includes(method)) return;
  generation++;
  state = createState(method === 'cabinet' ? 'login' : method === 'telegram' ? 'telegram' : 'onboarding', state.selectedRegion);
  render();
  screen.querySelector('input, [data-action="telegram-start"]')?.focus();
}

async function signInDemo(method, credentials = null) {
  if (state.busy) return;
  if (method === 'cabinet' && (credentials?.email !== DEMO_LOGIN.email || credentials?.password !== DEMO_LOGIN.password)) {
    const help = screen.querySelector('#cabinet-help');
    help.textContent = 'В макете работают только указанные демоданные. Настоящий аккаунт не проверялся.';
    help.classList.add('error');
    const password = screen.querySelector('#cabinet-password');
    password.value = '';
    screen.querySelector('#cabinet-email').setAttribute('aria-invalid', 'true');
    screen.querySelector('#cabinet-email').focus();
    return;
  }
  if (method === 'telegram' && !state.telegramPending) return;
  const current = ++generation;
  state.busy = true;
  render();
  await wait(600);
  if (generation !== current) return;
  state = createState(firstRun || preferences.rfServices === null ? 'rf-question' : 'ready', state.selectedRegion);
  state.subscription = demoSubscription();
  state.signedIn = true;
  state.authMethod = method;
  render();
  notify(method === 'telegram' ? 'Демовход через Telegram завершён. Настоящий аккаунт не использовался.' : 'Демовход в кабинет завершён. Настоящий аккаунт не проверялся.');
}

async function refresh() {
  if (state.refreshing || state.busy) return;
  const current = ++generation;
  state.refreshing = true;
  render();
  await wait(600);
  if (generation !== current) return;
  state.refreshing = false;
  if (state.scenario === 'expired') {
    // A refresh must never silently renew an expired subscription.
    notify('В демо подписка по-прежнему истекла. Для просмотра выберите состояние «Отключено».');
  } else {
    state.subscription = demoSubscription();
    notify('Тестовые данные обновлены. Выбранная локация сохранена.');
  }
  render();
}

async function refreshPings() {
  if (state.pingBusy) return;
  const current = ++generation;
  state.pingBusy = true;
  render();
  await wait(600);
  if (current !== generation) { state.pingBusy = false; return; }
  state.pingBusy = false;
  render();
  notify('Показаны демонстрационные значения пинга. Запросы к серверам не отправлялись.');
}

scenarios.addEventListener('click', event => {
  const button = event.target.closest('[data-scenario]');
  if (button) setScenario(button.dataset.scenario);
});

screen.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.target);
  if (event.target.id === 'routing-form') {
    try {
      preferences = addDomain(preferences, data.get('domain') || '');
      persistPreferences('Домен добавлен.');
      render();
      screen.querySelector('#routing-domain').focus();
    } catch (error) {
      const help = screen.querySelector('#routing-help');
      help.textContent = error.message === 'DUPLICATE_DOMAIN' ? 'Этот домен уже есть в списке.' : error.message === 'DOMAIN_LIMIT' ? 'Можно добавить до 100 доменов.' : 'Введите домен, например example.com, без протокола и пути.';
      help.classList.add('error');
      screen.querySelector('#routing-domain').setAttribute('aria-invalid', 'true');
      screen.querySelector('#routing-domain').focus();
    }
    return;
  }
  if (event.target.id === 'subscription-form') importDemo(data.get('subscription-link') || '');
  if (event.target.id === 'cabinet-form') signInDemo('cabinet', { email: String(data.get('email') || '').trim(), password: String(data.get('password') || '') });
});

screen.addEventListener('click', event => {
  const navigation = event.target.closest('[data-settings-view]');
  if (navigation) {
    const view = navigation.dataset.settingsView;
    if (view === 'home' || SETTINGS_VIEWS.includes(view)) {
      state.view = view;
      render();
      screen.scrollTop = 0;
      if (view === 'home') document.querySelector('#settings-button').focus();
    }
    return;
  }
  const preference = event.target.closest('[data-preference]');
  if (preference) {
    const { preference: key, value } = preference.dataset;
    if ((key === 'locale' && ['ru', 'en'].includes(value)) || (key === 'theme' && ['dark', 'light'].includes(value)) || key === 'rfServices') {
      preferences = { ...preferences, [key]: key === 'rfServices' ? value === 'true' : value };
      document.documentElement.dataset.theme = preferences.theme;
      setLocale(preferences.locale);
      persistPreferences();
      render();
      screen.querySelector(key === 'rfServices' ? '[data-preference="rfServices"]' : `[data-preference="${key}"][data-value="${value}"]`)?.focus();
    }
    return;
  }
  const setupLocale = event.target.closest('[data-setup-locale]');
  if (setupLocale) { preferences = { ...preferences, locale: setupLocale.dataset.setupLocale }; setLocale(preferences.locale); persistPreferences(); render(); return; }
  const setupTheme = event.target.closest('[data-setup-theme]');
  if (setupTheme) { preferences = { ...preferences, theme: setupTheme.dataset.setupTheme }; document.documentElement.dataset.theme = preferences.theme; persistPreferences(); render(); return; }
  const routing = event.target.closest('[data-routing-mode]');
  if (routing && ROUTING_MODES.includes(routing.dataset.routingMode)) {
    preferences = { ...preferences, routing: { ...preferences.routing, mode: routing.dataset.routingMode } };
    persistPreferences();
    render();
    screen.querySelector(`[data-routing-mode="${preferences.routing.mode}"]`).focus();
    return;
  }
  const removeDomain = event.target.closest('[data-remove-domain]');
  if (removeDomain) {
    preferences = { ...preferences, routing: { ...preferences.routing, domains: preferences.routing.domains.filter(domain => domain !== removeDomain.dataset.removeDomain) } };
    persistPreferences('Домен удалён.');
    render();
    screen.querySelector('#routing-domain').focus();
    return;
  }
  const auth = event.target.closest('[data-auth-choice]');
  if (auth) { selectAuth(auth.dataset.authChoice === 'email' ? 'cabinet' : auth.dataset.authChoice); return; }
  const region = event.target.closest('[data-region]');
  if (region) {
    const wasConnected = state.scenario === 'connected';
    generation++;
    state.pingBusy = false;
    state.selectedRegion = region.dataset.region;
    state.view = 'home';
    // No automatic connection when changing the selected region.
    if (wasConnected) state.scenario = 'ready';
    savePreference(storage, state.selectedRegion);
    render();
    screen.querySelector('[data-action="locations"]')?.focus();
    if (wasConnected) notify('Новая локация выбрана. Нажмите кнопку подключения.');
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  switch (button.dataset.action) {
    case 'welcome-next': state.scenario = 'setup'; render(); break;
    case 'setup-next': setScenario('auth-choice'); break;
    case 'auth-choice': setScenario('auth-choice'); break;
    case 'auth-back-setup': setScenario('setup'); break;
    case 'rf-continue':
      preferences = { ...preferences, rfServices: preferences.rfServices === true };
      persistPreferences();
      firstRun = false;
      storage?.setItem('templar-browser-onboarded', '1');
      state.subscription ||= demoSubscription();
      state.scenario = 'ready';
      state.view = 'home';
      render();
      break;
    case 'power': connect(); break;
    case 'locations':
      state.view = 'locations'; render(); screen.querySelector('[data-action="back"]').focus(); break;
    case 'back':
      state.view = 'home'; render(); screen.querySelector('[data-action="locations"]').focus(); break;
    case 'example': importDemo(DEMO_LINK); break;
    case 'cabinet-example': signInDemo('cabinet', DEMO_LOGIN); break;
    case 'telegram-start': state.telegramPending = true; render(); break;
    case 'telegram-cancel': generation++; state.busy = false; state.telegramPending = false; render(); break;
    case 'telegram-confirm': signInDemo('telegram'); break;
    case 'refresh': refresh(); break;
    case 'refresh-ping': refreshPings(); break;
    case 'replace-link': document.querySelector('#replace-link-dialog').showModal(); break;
    case 'remove': {
      document.querySelector('#remove-title').textContent = state.signedIn ? 'Выйти из демоаккаунта?' : 'Выйти из подписки?';
      document.querySelector('#confirm-remove').textContent = 'Выйти';
      document.querySelector('#remove-dialog').showModal(); break;
    }
    case 'renew': notify('В рабочей версии здесь откроется покупка подписки в кабинете Templar VPN.'); break;
    case 'check-conflict': notify('Тестовый конфликт ещё активен. Для просмотра выберите состояние «Отключено».'); break;
    case 'conflict-help': notify('Отключите другое прокси-расширение. Если браузером управляет организация, обратитесь к администратору.'); break;
  }
  if (button.dataset.setupLocale) { preferences = { ...preferences, locale: button.dataset.setupLocale }; setLocale(preferences.locale); savePreferences(storage, preferences); render(); return; }
  if (button.dataset.setupTheme) { preferences = { ...preferences, theme: button.dataset.setupTheme }; document.documentElement.dataset.theme = preferences.theme; savePreferences(storage, preferences); render(); return; }
});

screen.addEventListener('keydown', event => {
  const current = event.target.closest('[data-region]');
  if (!current || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...screen.querySelectorAll('[data-region]')];
  const index = buttons.indexOf(current);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus();
});

const about = document.querySelector('#about-dialog');
document.querySelector('#about-button').addEventListener('click', () => about.showModal());
document.querySelector('#settings-button').addEventListener('click', () => {
  state.view = 'settings'; render(); screen.scrollTop = 0;
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => about.close()));

const remove = document.createElement('dialog');
remove.id = 'remove-dialog';
remove.setAttribute('aria-labelledby', 'remove-title');
remove.innerHTML = `<div class="dialog-header">${icon('logout')}<button class="icon-button" id="cancel-remove-icon" aria-label="Закрыть">${icon('close')}</button></div><h2 id="remove-title">Выйти из подписки?</h2><p>Тестовое подключение отключится, и откроется экран входа. Настоящая подписка останется без изменений.</p><button class="primary-button" id="confirm-remove">Выйти</button><button class="demo-example" id="cancel-remove">Остаться</button>`;
document.body.append(remove);
remove.addEventListener('close', () => { returnFocus?.focus(); });
remove.addEventListener('cancel', () => { returnFocus = screen.querySelector('[data-action="remove"]'); });
remove.querySelectorAll('#cancel-remove, #cancel-remove-icon').forEach(button => button.addEventListener('click', () => { returnFocus = screen.querySelector('[data-action="remove"]'); remove.close(); }));
remove.querySelector('#confirm-remove').addEventListener('click', () => {
  returnFocus = null;
  remove.close();
  setScenario('onboarding');
  screen.querySelector('#subscription-link').focus();
  notify('Вы вышли из макета. Можно добавить другую подписку или войти в аккаунт.');
});

const replaceLink = document.createElement('dialog');
replaceLink.id = 'replace-link-dialog';
replaceLink.setAttribute('aria-labelledby', 'replace-link-title');
replaceLink.innerHTML = `<div class="dialog-header">${icon('link')}<button class="icon-button" id="close-replace" aria-label="Закрыть">${icon('close')}</button></div>
  <h2 id="replace-link-title">Заменить ссылку</h2>
  <p>Текущая подписка останется, пока вы не добавите новую. После замены подключитесь заново.</p>
  <form id="replace-link-form" novalidate><label class="input-label" for="replacement-link">Новая ссылка подписки</label>
    <input id="replacement-link" name="replacement-link" type="url" autocomplete="off" spellcheck="false" placeholder="https://sub.templarvpn.com/connect/…" aria-describedby="replacement-help">
    <p class="field-help" id="replacement-help" aria-live="polite">В макете используйте тестовую ссылку. Данные никуда не отправляются.</p>
    <button class="primary-button" type="submit" id="save-replacement">Заменить ссылку</button>
  </form>
  <button class="demo-example" id="replace-example">Попробовать на примере ${icon('arrow')}</button>
  <button class="outline-button" id="cancel-replace">Отмена</button>`;
document.body.append(replaceLink);
let replacementSequence = 0;

function resetReplacement() {
  replacementSequence++;
  const input = replaceLink.querySelector('#replacement-link');
  input.value = '';
  input.disabled = false;
  input.removeAttribute('aria-invalid');
  replaceLink.querySelector('#replacement-help').classList.remove('error');
  replaceLink.querySelector('#replacement-help').textContent = 'В макете используйте тестовую ссылку. Данные никуда не отправляются.';
  const button = replaceLink.querySelector('#save-replacement');
  button.disabled = false;
  button.textContent = 'Заменить ссылку';
  replaceLink.querySelector('#replace-example').disabled = false;
}

async function replaceDemoSubscription(link) {
  const input = replaceLink.querySelector('#replacement-link');
  const saveButton = replaceLink.querySelector('#save-replacement');
  if (saveButton.disabled) return;
  if (!validateSubscriptionLink(link)) {
    input.setAttribute('aria-invalid', 'true');
    const help = replaceLink.querySelector('#replacement-help');
    help.textContent = 'Нужна HTTPS-ссылка Templar VPN. Текущая подписка не изменена.';
    help.classList.add('error');
    input.focus();
    return;
  }
  const sequence = ++replacementSequence;
  const current = ++generation;
  input.disabled = true;
  input.value = '';
  saveButton.disabled = true;
  saveButton.textContent = 'Заменяем в демо…';
  replaceLink.querySelector('#replace-example').disabled = true;
  await wait(600);
  if (!replaceLink.open || sequence !== replacementSequence || current !== generation) return;
  state = createState('ready', state.selectedRegion);
  replaceLink.close();
  render();
  screen.querySelector('[data-action="replace-link"]').focus();
  notify('Тестовая ссылка заменена. Локация сохранена — подключитесь заново.');
}

replaceLink.addEventListener('close', () => {
  resetReplacement();
  screen.querySelector('[data-action="replace-link"]')?.focus();
});
replaceLink.querySelectorAll('#close-replace, #cancel-replace').forEach(button => button.addEventListener('click', () => replaceLink.close()));
replaceLink.querySelector('#replace-link-form').addEventListener('submit', event => {
  event.preventDefault();
  replaceDemoSubscription(replaceLink.querySelector('#replacement-link').value);
});
replaceLink.querySelector('#replace-example').addEventListener('click', () => replaceDemoSubscription(DEMO_LINK));

function persistPreferences(message = 'Настройки сохранены.') {
  notify(savePreferences(storage, preferences) ? message : 'Хранилище недоступно. Настройки действуют до закрытия макета.');
}

const connectionTimer = setInterval(() => {
  if (state.scenario !== 'connected') return;
  const target = screen.querySelector('[data-connection-time]');
  if (target) target.textContent = connectionDuration();
}, 1000);
window.addEventListener('pagehide', () => clearInterval(connectionTimer));

startLocalization(preferences.locale);
render();
