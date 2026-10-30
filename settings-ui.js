import { escapeHTML } from './preferences.js';
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const SETTINGS_VIEWS = ['settings', 'routing', 'faq', 'about', 'support', 'speedtest'];
const back = (home = false) => `<button class="back-button" data-settings-view="${home ? 'home' : 'settings'}">${icon('chevron')} Назад</button>`;
const choice = (setting, value, label, selected) => `<button data-preference="${setting}" data-value="${value}" aria-pressed="${selected === value}">${label}</button>`;

export function renderRfServicesSwitch(preferences) {
  const enabled = preferences.rfServices === true;
  return `<div class="settings-row settings-row-rf"><span class="settings-row-icon">${icon('routes')}</span><span><strong>Российские сервисы через VPN</strong></span><div class="rf-toggle-control"><span class="rf-toggle-state">${enabled ? 'Да' : 'Нет'}</span><button class="toggle-switch" data-preference="rfServices" data-value="${enabled ? 'false' : 'true'}" role="switch" aria-checked="${enabled}" aria-label="Российские сервисы через VPN"><span></span></button></div></div>`;
}

export function renderRfServicesQuestion(preferences, continueAttribute) {
  return `<section class="onboarding first-run"><div class="onboarding-emblem">${icon('routes')}</div><h2>Российские сервисы</h2><p class="field-help">Да — через VPN. Нет — напрямую, через вашего провайдера.</p>${renderRfServicesSwitch(preferences)}<button class="primary-button rf-continue" ${continueAttribute}>Продолжить ${icon('arrow')}</button><p class="field-help rf-choice-note">Позже: Настройки → Маршрутизация → Российские сервисы через VPN.</p></section>`;
}

export function renderSettings(view, preferences, { runtime = false, version = '', sourceUrl = null, signedIn = false } = {}) {
  let content = renderSettingsContent(view, preferences, sourceUrl);
  if (view === 'settings' && signedIn) content = content.replace('</div></section>', `</div><button class="settings-logout text-button" ${runtime ? 'data-command="LOGOUT"' : 'data-action="remove"'}>${icon('logout')} Выйти</button></section>`);
  if (!runtime) return content;
  return content
    .replace('Демо: правила сохраняются локально, но к реальному трафику пока не применяются.', 'Правила применяются к новым запросам при активном VPN.')
    .replace('0.1.0 · демо', `${escapeHTML(version)} · тестовая сборка`)
    .replace('<div class="about-copy">', '<a class="outline-button about-privacy" href="privacy.html" target="_blank" rel="noopener noreferrer">Данные и подключение</a><div class="about-copy">')
    .replace('Этот макет не отправляет данные, не сохраняет пароли и не собирает историю посещений. Локально сохраняются настройки и выбранная локация.', 'Данные входа передаются только сервису Templar VPN. Пароли и история посещений не сохраняются. Настройки остаются локально.')
    .replace('В макете используйте только демонстрационные данные.', 'Используйте данные своего аккаунта Templar VPN.')
    .replace('В макете выбор и пинг демонстрационные.', 'Автовыбор сравнивает задержку HTTPS до сайта через основные серверы и подключает самый быстрый доступный.')
    .replace('Пока нет. Сейчас показываются тестовые значения. Реальные замеры через подключение появятся на следующем этапе.', 'Да. Измеряется запрос HTTPS до www.gstatic.com через выбранный VLESS-профиль. TCP и XHTTP проверяются отдельно. Это не ICMP-пинг.');
}

function renderSettingsContent(view, preferences, sourceUrl) {
  if (view === 'routing') return routing(preferences);
  if (view === 'faq') return faq();
  if (view === 'about') return about(sourceUrl);
  if (view === 'support') return `<section class="settings-view">${back()}<h2>Поддержка</h2><p class="settings-description">Поможем с подпиской и подключением.</p>${supportContacts()}<p class="field-help">Укажите устройство, браузер и локацию. Не отправляйте пароль или ссылку подписки.</p></section>`;
  const modeNames = { all: 'Все сайты', bypass: 'Кроме выбранных', only: 'Только выбранные' };
  return `<section class="settings-view settings-main">${back(true)}<h2>Настройки</h2><p class="settings-description">Сделайте подключение своим.</p>
    <button class="settings-row" data-settings-view="routing">${icon('routes')}<span><strong>Маршрутизация</strong><small>${modeNames[preferences.routing.mode]}</small></span>${icon('chevron')}</button>
    <button class="settings-row settings-speedtest" data-settings-view="speedtest">${icon('speed')}<span><strong>Проверка скорости</strong><small>Загрузка, отдача и задержка</small></span>${icon('chevron')}</button>
    <div class="setting-group"><h3>Язык</h3><div class="setting-segment" role="group" aria-label="Язык интерфейса">${choice('locale', 'ru', 'Русский', preferences.locale)}${choice('locale', 'en', 'English', preferences.locale)}</div></div>
    <div class="setting-group"><h3>Оформление</h3><div class="setting-segment" role="group" aria-label="Тема оформления">${choice('theme', 'dark', `${icon('moon')} Тёмная`, preferences.theme)}${choice('theme', 'light', `${icon('sun')} Светлая`, preferences.theme)}</div></div>
    <div class="settings-links"><button class="settings-row" data-settings-view="faq">${icon('help')}<span><strong>Вопросы и ответы</strong><small>Коротко о главном</small></span>${icon('chevron')}</button>
    <button class="settings-row" data-settings-view="support">${icon('telegram')}<span><strong>Поддержка</strong><small>Telegram и электронная почта</small></span>${icon('chevron')}</button>
    <button class="settings-row" data-settings-view="about">${icon('info')}<span><strong>О приложении</strong><small>Templar VPN для браузера</small></span>${icon('chevron')}</button></div></section>`;
}

function routing(preferences) {
  const { mode, domains } = preferences.routing;
  const choices = [
    ['all', 'Все сайты', 'Весь браузер через VPN'],
    ['bypass', 'Кроме выбранных', 'Домены из списка — без VPN'],
    ['only', 'Только выбранные', 'VPN только для доменов из списка'],
  ];
  return `<section class="settings-view routing-view">${back()}<h2>Маршрутизация</h2>
    <p class="settings-description">Выберите, какие сайты идут через VPN.</p>
    <div class="rf-routing-section">${renderRfServicesSwitch(preferences)}<p class="field-help">Да — российские сервисы используют VPN по выбранным ниже правилам. Нет — открываются напрямую через вашего провайдера, даже если включён VPN.</p><p class="field-help">Если банк или другой российский сервис не открывается с VPN, попробуйте выбрать «Нет». Остальные сайты продолжат работать по вашим правилам.</p></div>
    <div class="routing-modes" role="radiogroup" aria-label="Режим маршрутизации">${choices.map(([id, title, description]) => `<button class="routing-mode" role="radio" data-routing-mode="${id}" aria-checked="${mode === id}"><span><strong>${title}</strong><small>${description}</small></span>${mode === id ? icon('check') : '<span class="radio-spacer"></span>'}</button>`).join('')}</div>
    ${mode !== 'all' ? `<div class="domain-section"><label class="input-label" for="routing-domain">Домен</label>
      <form class="domain-form" id="routing-form" novalidate><input id="routing-domain" name="domain" type="text" maxlength="253" placeholder="example.com" autocomplete="off" spellcheck="false" aria-describedby="routing-help"><button class="outline-button" type="submit">Добавить</button></form>
      <p class="field-help" id="routing-help" aria-live="polite">Без https:// и пути. Поддомены включаются автоматически.</p>
      <div class="domain-list" aria-label="Список доменов">${domains.length ? domains.map(domain => `<div class="domain-row"><span>${escapeHTML(domain)}</span><button class="icon-button" data-remove-domain="${escapeHTML(domain)}" aria-label="Удалить домен ${escapeHTML(domain)}">${icon('trash')}</button></div>`).join('') : `<p class="empty-domains">${mode === 'only' ? 'Список пуст — VPN не применяется к сайтам.' : 'Список пуст — все сайты идут через VPN.'}</p>`}</div></div>` : '<p class="field-help">Сохранённый список доменов не применяется в этом режиме.</p>'}
    <p class="settings-demo-note">Демо: правила сохраняются локально, но к реальному трафику пока не применяются.</p></section>`;
}

function faq() {
  const questions = [
    ['Что подключается к VPN?', 'Только браузер, в котором установлено расширение. Остальные приложения используют обычное подключение.'],
    ['Как добавить свою подписку?', 'Вставьте ссылку подписки или войдите через личный кабинет либо Telegram. В макете используйте только демонстрационные данные.'],
    ['Что делает автовыбор?', 'Выбирает самый быстрый доступный сервер. Выбранная вручную страна сама не меняется. В макете выбор и пинг демонстрационные.'],
    ['Как работают правила доменов?', '«Кроме выбранных» исключает домены из VPN. «Только выбранные» направляет через VPN только перечисленные домены. Правило включает сам домен и его поддомены.'],
    ['Пинг уже настоящий?', 'Пока нет. Сейчас показываются тестовые значения. Реальные замеры через подключение появятся на следующем этапе.'],
    ['Как сменить аккаунт или выйти?', 'Нажмите значок выхода справа вверху или «Выйти» внизу настроек. Затем войдите в другой аккаунт или добавьте ссылку подписки.'],
    ['Что делать, если подписка закончилась?', 'Продлите подписку в кабинете или боте, затем обновите её в расширении. Обновление само по себе не продлевает срок.'],
  ];
  return `<section class="settings-view">${back()}<h2>Вопросы и ответы</h2><p class="settings-description">Всё, что нужно для начала.</p><div class="faq-list">${questions.map(([question, answer]) => `<details><summary>${question}${icon('chevron')}</summary><p>${answer}</p></details>`).join('')}</div><h3 class="support-title">Не нашли ответ?</h3>${supportContacts()}</section>`;
}

function supportContacts() {
  // These public contacts match the deployed landing and app/config.py.
  return `<div class="support-contacts" aria-label="Контакты поддержки">
    <a class="settings-row" href="https://t.me/TemplarVPN_support" target="_blank" rel="noopener noreferrer">${icon('telegram')}<span><strong>Telegram</strong><small>@TemplarVPN_support</small></span>${icon('arrow')}</a>
    <a class="settings-row" href="mailto:support@templarvpn.com">${icon('mail')}<span><strong>Email</strong><small>support@templarvpn.com</small></span>${icon('arrow')}</a>
  </div>`;
}

function about(sourceUrl) {
  // Only show a configured public repository, never a guessed account URL.
  const sourceLink = typeof sourceUrl === 'string' && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(sourceUrl)
    ? `<a class="outline-button about-source" href="${escapeHTML(sourceUrl)}" target="_blank" rel="noopener noreferrer">Исходный код на GitHub ${icon('arrow')}</a>` : '';
  return `<section class="settings-view about-view">${back()}
    <div class="about-brand"><span class="brand-mark"><img src="./assets/mark.svg" width="24" height="24" alt=""></span><h2>Templar · VPN</h2><p>Свобода в один клик.</p></div>
    <div class="about-version"><span>Версия</span><strong>0.1.0 · демо</strong></div>
    <p class="settings-description">Расширение для вашего браузера.</p>
    <a class="outline-button" href="https://templarvpn.com/" target="_blank" rel="noopener noreferrer">Сайт Templar VPN ${icon('arrow')}</a>
    <a class="outline-button about-bot" href="https://t.me/TemplarVPN_bot" target="_blank" rel="noopener noreferrer">${icon('telegram')} Telegram-бот</a>
    ${sourceLink}
    <h3 class="support-title">Поддержка</h3>${supportContacts()}
    <div class="about-copy"><h3>Конфиденциальность</h3><p>Этот макет не отправляет данные, не сохраняет пароли и не собирает историю посещений. Локально сохраняются настройки и выбранная локация.</p><p>Флаги: <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener noreferrer">Twemoji</a>, Twitter и другие авторы · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>.</p></div></section>`;
}
