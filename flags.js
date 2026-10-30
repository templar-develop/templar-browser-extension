// Future countries do not require a bundled SVG or extension release.
export function flagMarkup(code = 'eu') {
  if (!/^[a-z]{2}$/.test(code)) code = 'eu';
  if (['eu', 'ru', 'ch', 'se', 'nl', 'pl'].includes(code)) return `<img class="flag" src="./assets/emoji/${code}.svg" width="23" height="23" alt="">`;
  const emoji = [...code.toUpperCase()].map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
  return `<span class="flag" aria-hidden="true">${emoji}</span>`;
}
