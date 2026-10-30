import qrcode from '../vendor/qrcode.mjs';

export function qrMarkup(url) {
  if (!/^https:\/\/cabinet\.templarvpn\.com\/extension-login#[A-Za-z0-9_-]{32}$/.test(url)) throw new Error('INVALID_RESPONSE');
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte'); qr.make();
  // Bundled encoder, fixed options, no network service or embedded remote URL.
  return qr.createSvgTag({ cellSize: 3, margin: 12, scalable: true, alt: 'QR-код входа через кабинет' });
}
