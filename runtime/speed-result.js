// Only bounded measurements from this session may be rendered or retained.
export function checkedSpeedRecord(value, subscription, now = Date.now()) {
  if (!value || !subscription?.regions.some(r => r.id === value.regionId)
    || !Number.isSafeInteger(value.measuredAt) || value.measuredAt <= 0 || value.measuredAt > now
    || value.method !== 'https-4-streams'
    || ![value.download, value.upload, value.latency].every(n => Number.isFinite(n) && n > 0 && n < 100000)
    || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 171000000
    || !Number.isSafeInteger(value.durationMs) || value.durationMs < 1 || value.durationMs > 180000) return null;
  return { regionId: value.regionId, measuredAt: value.measuredAt, method: value.method,
    download: value.download, upload: value.upload, latency: value.latency, bytes: value.bytes, durationMs: value.durationMs };
}
