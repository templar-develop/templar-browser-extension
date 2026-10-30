export function checkedSubscriptionLink(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('INVALID_LINK');
  let text = value.trim();
  if (text.startsWith('happ://add/')) {
    text = text.slice('happ://add/'.length);
    if (!text.startsWith('https://')) {
      try { text = decodeURIComponent(text); } catch { throw new Error('INVALID_LINK'); }
    }
  }
  if (text.length > 512 || /[\u0000-\u0020\u007f]/.test(text)) throw new Error('INVALID_LINK');
  let url;
  try { url = new URL(text); } catch { throw new Error('INVALID_LINK'); }
  if (url.protocol !== 'https:' || url.hostname !== 'sub.templarvpn.com' || url.port || url.username || url.password
    || url.search || url.hash || text.includes('?') || text.includes('#')
    || !/^\/connect\/[A-Za-z0-9_-]{8,128}(?:\/json)?\/?$/.test(url.pathname)) throw new Error('INVALID_LINK');
  return url.href;
}
