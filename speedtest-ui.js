import { flagMarkup } from './flags.js';
import { escapeHTML } from './preferences.js';

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const number = value => Number.isFinite(value) && value >= 0 && value < 100000 ? value : null;
const gaugeScale = [0, 10, 100, 1000].map(value => {
  const angle = (-120 + 240 * Math.log10(1 + value) / Math.log10(1001)) * Math.PI / 180;
  return `<text x="${(110 + 101 * Math.sin(angle)).toFixed(1)}" y="${(113 - 101 * Math.cos(angle)).toFixed(1)}">${value}</text>`;
}).join('');
const label = value => value === null ? '—' : value.toFixed(value < 100 ? 1 : 0);

export function speedTestShortcut() {
  return `<button class="speedtest-shortcut" data-settings-view="speedtest">${icon('speed')}<span>Проверка скорости</span>${icon('chevron')}</button>`;
}

// The dial follows actual transferred bytes, never simulated speed values.
export function speedPresentation({ job = null, result = null, busy = false } = {}) {
  const stage = busy ? (job?.kind === 'speedtest' && ['latency', 'download', 'upload'].includes(job.stage) ? job.stage : 'queued') : result ? 'result' : 'idle';
  const values = busy ? job?.speed || {} : result || {};
  const download = number(values.download), upload = number(values.upload), latency = number(values.latency);
  const reading = busy ? ['download', 'upload'].includes(stage) ? number(values.mbps) : null : download;
  const fraction = reading === null ? 0 : Math.min(1, Math.log10(1 + reading) / Math.log10(1001));
  return { stage, reading: label(reading), download: label(download), upload: label(upload), latency: latency === null ? '—' : String(Math.round(latency)),
    angle: Math.round((-120 + 240 * fraction) * 10) / 10, arc: Math.round(fraction * 1000) / 10,
    caption: { queued: 'Подготавливаем…', latency: 'Проверяем задержку', download: 'Загрузка', upload: 'Отдача', result: 'Загрузка', idle: 'Готовы к проверке' }[stage] };
}

export function updateSpeedTest(section, options) {
  if (!section) return;
  const v = speedPresentation(options);
  section.dataset.speedtestStage = v.stage;
  section.dataset.speedtestState = options.busy ? 'measuring' : options.result ? 'result' : 'idle';
  for (const key of ['reading', 'download', 'upload', 'latency', 'caption']) {
    const target = section.querySelector(`[data-speed-${key}]`);
    if (target) target.textContent = v[key];
  }
  section.querySelector('.gauge-needle')?.setAttribute('transform', `rotate(${v.angle} 110 110)`);
  section.querySelector('.gauge-value')?.setAttribute('stroke-dasharray', `${v.arc} 100`);
  const stop = section.querySelector('[data-measurement-cancel]');
  if (stop) stop.disabled = Boolean(options.job?.cancelling);
}

export function renderSpeedTest({ region = 'Автовыбор', flag = 'eu', runtime = false, result = null, connected = false, busy = false, job = null } = {}) {
  const v = speedPresentation({ job, result, busy });
  const running = job?.kind === 'speedtest';
  return `<section class="settings-view speedtest-view" data-speedtest-state="${busy ? 'measuring' : result ? 'result' : 'idle'}" data-speedtest-stage="${v.stage}" aria-busy="${busy}" aria-labelledby="speedtest-title">
    <button class="back-button" data-settings-view="home">${icon('chevron')} Назад</button>
    <h2 id="speedtest-title">Проверка скорости</h2>
    <div class="speedtest-location">${flagMarkup(flag)}<span>${escapeHTML(region)}</span><span class="speedtest-route-label">Выбранная локация</span></div>
    <div class="speedtest-gauge" aria-label="${busy ? 'Идёт замер скорости' : result ? 'Результаты проверки' : 'Скорость ещё не измерена'}">
      <svg viewBox="0 0 220 170" aria-hidden="true"><path class="gauge-track" d="M35.5 153a86 86 0 1 1 149 0"/><path class="gauge-value" pathLength="100" stroke-dasharray="${v.arc} 100" d="M35.5 153a86 86 0 1 1 149 0"/><path class="gauge-inner" d="M46 147a74 74 0 1 1 128 0"/>
        <g class="gauge-needle" transform="rotate(${v.angle} 110 110)"><path d="M110 28v29"/><circle cx="110" cy="27" r="3"/></g>
        <g class="gauge-scale">${gaugeScale}</g>
      </svg>
      <div class="speedtest-reading"><strong data-speed-reading>${v.reading}</strong><span>Мбит/с</span><small data-speed-caption>${v.caption}</small></div>
    </div>
    <dl class="speedtest-metrics" aria-label="Результаты проверки">
      <div><dt>${icon('download')} Загрузка</dt><dd><span data-speed-download>${v.download}</span> <small>Мбит/с</small></dd></div>
      <div><dt>${icon('upload')} Отдача</dt><dd><span data-speed-upload>${v.upload}</span> <small>Мбит/с</small></dd></div>
      <div><dt>${icon('latency')} Задержка</dt><dd><span data-speed-latency>${v.latency}</span> <small>мс</small></dd></div>
    </dl>
    ${running ? `<button class="outline-button speedtest-start" data-measurement-cancel ${job.cancelling ? 'disabled' : ''}>${icon('close')} Остановить проверку</button>` : `<button class="primary-button speedtest-start" type="button" data-speedtest-run ${!runtime || !connected || busy ? 'disabled' : ''} aria-describedby="speedtest-availability">${icon('speed')} Запустить проверку</button>`}
    <p class="speedtest-availability" id="speedtest-availability" role="status">${runtime ? busy ? 'Проверяем выбранный маршрут…' : connected ? 'Обычно 15–35 секунд, до 171 МБ трафика.' : 'Сначала подключите VPN.' : 'В макете замер пока недоступен.'}</p>
    ${result?.measuredAt && !busy ? `<p class="field-help"><span>Последний замер:</span> <time datetime="${new Date(result.measuredAt).toISOString()}">${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(result.measuredAt)}</time></p>` : ''}
    <p class="speedtest-note">Проверка идёт через выбранную локацию VPN до Cloudflare и расходует трафик подписки. Показания обновляются во время замера.</p>
  </section>`;
}
