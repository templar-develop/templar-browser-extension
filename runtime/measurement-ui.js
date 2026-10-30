export function measurementStatus(job, { active = false, locale = 'ru' } = {}) {
  if (!job) return '';
  if (['ping', 'connect'].includes(job.kind)) return '';
  const en = locale === 'en';
  const total = Number.isSafeInteger(job.total) ? Math.max(0, Math.min(64, job.total)) : 0;
  const completed = Number.isSafeInteger(job.completed) ? Math.max(0, Math.min(total, job.completed)) : 0;
  const finishing = job.cancelling || job.stage === 'restoring';
  const stages = en ? { latency: 'Checking latency', download: 'Measuring download', upload: 'Measuring upload' }
    : { latency: 'Проверяем задержку', download: 'Измеряем загрузку', upload: 'Измеряем отдачу' };
  const label = finishing ? (en ? 'Finishing the test…' : 'Завершаем проверку…')
    : job.kind === 'ping' ? `${en ? 'Checking ping' : 'Проверяем пинг'}${total ? ` · ${completed} / ${total}` : '…'}`
    : stages[job.stage] || (en ? 'Preparing the test…' : 'Готовим проверку…');
  return `<aside class="measurement-status" aria-label="${en ? 'Measurement progress' : 'Ход проверки'}"><p role="status" aria-live="polite">${label}</p>
    ${total ? `<progress max="${total}" value="${completed}"></progress>` : ''}
    <div class="measurement-actions"><button class="text-button" data-measurement-cancel ${finishing ? 'disabled' : ''}>${en ? 'Stop test' : 'Остановить проверку'}</button>
    ${active ? `<button class="text-button" data-command="DISCONNECT">${en ? 'Disconnect VPN' : 'Отключить VPN'}</button>` : ''}</div></aside>`;
}

export function pingMarkup(id, latencies = {}, job) {
  const measuring = ['ping', 'connect'].includes(job?.kind) && job.stage !== 'connecting'
    && (!job.pendingRegions || job.pendingRegions.includes(id));
  return measuring ? '<span class="region-ping ping-dots" role="status" aria-label="Измеряем задержку"><i></i><i></i><i></i></span>'
    : `<span class="region-ping" title="Задержка HTTPS до сайта через VPN">${latencies[id] != null ? `${latencies[id]} мс` : '—'}</span>`;
}
