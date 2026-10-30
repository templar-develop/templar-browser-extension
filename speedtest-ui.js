import { flagMarkup } from './flags.js';
import { escapeHTML } from './preferences.js';

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function speedTestShortcut() {
  return `<button class="speedtest-shortcut" data-settings-view="speedtest">${icon('speed')}<span>Проверка скорости</span>${icon('chevron')}</button>`;
}

// Shared UI for real measurements and the non-network prototype.
// Keep this shared by the prototype and the installable extension.
export function renderSpeedTest({ region = 'Автовыбор', flag = 'eu', runtime = false, result = null, connected = false, busy = false } = {}) {
  const display = busy ? null : result;
  const phase = busy ? 'measuring' : result ? 'result' : 'idle';
  return `<section class="settings-view speedtest-view" data-speedtest-state="${phase}" aria-busy="${busy}" aria-labelledby="speedtest-title">
    <button class="back-button" data-settings-view="home">${icon('chevron')} Назад</button>
    <h2 id="speedtest-title">Проверка скорости</h2><p class="settings-description">Узнайте, как работает ваше подключение.</p>
    <div class="speedtest-location">${flagMarkup(flag)}<span>${escapeHTML(region)}</span><span class="speedtest-route-label">Выбранная локация</span></div>
    <div class="speedtest-gauge" aria-label="${busy ? 'Идёт замер скорости' : result ? 'Результаты проверки' : 'Скорость ещё не измерена'}">
      <svg viewBox="0 0 220 160" aria-hidden="true"><path class="gauge-track" d="M38 137a87 87 0 1 1 144 0"/><path class="gauge-sweep" pathLength="100" d="M38 137a87 87 0 1 1 144 0"/><path class="gauge-inner" d="M49 128a73 73 0 1 1 122 0"/><path class="gauge-ticks" d="m34 111 5-2m-9-27 6 1m4-29 5 3m14-26 3 5m24-17 1 6m28-8-1 6m28 1-3 5m26 9-5 4m19 20-6 2m12 25-6-1m2 29-5-2"/></svg>
      <div class="speedtest-reading"><strong>${display?.download ?? "—"}</strong><span>Мбит/с</span><small>${busy ? "Измеряем…" : result ? "Загрузка" : "Нет замера"}</small></div>
    </div>
    <dl class="speedtest-metrics" aria-label="Результаты проверки">
      <div><dt>${icon('download')} Загрузка</dt><dd>${display?.download ?? "—"} <small>Мбит/с</small></dd></div>
      <div><dt>${icon('upload')} Отдача</dt><dd>${display?.upload ?? "—"} <small>Мбит/с</small></dd></div>
      <div><dt>${icon('latency')} Задержка</dt><dd>${display?.latency ?? "—"} <small>мс</small></dd></div>
    </dl>
    <button class="primary-button speedtest-start" type="button" data-speedtest-run ${!runtime || !connected || busy ? "disabled" : ""} aria-describedby="speedtest-availability">${icon('speed')} Запустить проверку</button>
    <p class="speedtest-availability" id="speedtest-availability" role="status">${runtime ? busy ? 'Проверяем выбранный маршрут…' : connected ? 'Обычно 15–35 секунд, до 171 МБ трафика.' : 'Сначала подключите VPN.' : 'В макете замер пока недоступен.'}</p>
    ${result?.measuredAt && !busy ? `<p class="field-help"><span>Последний замер:</span> <time datetime="${new Date(result.measuredAt).toISOString()}">${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(result.measuredAt)}</time></p>` : ''}
    <p class="speedtest-note">Проверка будет идти через выбранную локацию VPN и расходовать трафик подписки. Четыре потока, прогрев соединений. Задержка — HTTPS до Cloudflare; результат может отличаться от других тестовых серверов.</p>
  </section>`;
}
