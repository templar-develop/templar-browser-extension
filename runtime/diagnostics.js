export function diagnosticReport(state, version, now = Date.now()) {
  const region = value => typeof value === 'string' && /^[a-z0-9_-]{1,24}$/.test(value) ? value : null;
  const errors = new Set(['ACCESS_DENIED', 'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'PROXY_CONFLICT', 'INVALID_RESPONSE', 'INVALID_LEASE', 'DEVICE_LIMIT_REACHED']);
  return JSON.stringify({ version, generatedAt: new Date(now).toISOString(),
    status: ['connected', 'disconnected', 'connecting', 'blocked'].includes(state.status) ? state.status : 'unknown',
    active: state.active === true, selectedRegion: region(state.selectedRegion), resolvedRegion: region(state.resolvedRegion),
    savedLogin: state.loginRecoverable === true,
    leaseRemainingSeconds: Number.isFinite(state.leaseExpiresAt) ? Math.max(0, Math.ceil((state.leaseExpiresAt - now) / 1000)) : 0,
    routingMode: ['all', 'only', 'bypass'].includes(state.rules?.mode) ? state.rules.mode : null,
    rfServices: state.rules?.rfServices === true,
    lastError: errors.has(state.lastError) ? state.lastError : null,
    measurement: ['ping', 'speedtest', 'connect'].includes(state.measurement?.kind) ? state.measurement.kind : null,
  }, null, 2);
}
