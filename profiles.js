export const AUTO_PROFILE = Object.freeze({ id: 'auto', name: '⚡ Автовыбор', flag: 'eu', transport: 'tcp' });
export const transportLabel = profile => ({ tcp: 'TCP', xhttp: 'XHTTP' })[profile?.transport] || '—';
export const protocolLabel = profile => transportLabel(profile) === '—' ? 'Профиль недоступен' : `VLESS / ${transportLabel(profile)} / REALITY`;
