// Reconcile transient popup screens with authoritative background state.
// A successful login may finish after the popup was destroyed by an app switch.
export function resumedAuthView(state, { firstRun, rfServices }) {
  if (state?.subscription) return { view: firstRun || rfServices === null ? 'rf-question' : 'home' };
  if (state?.cabinetLogin) return { view: 'home', auth: 'cabinet' };
  if (state?.telegramPending) return { view: 'home', auth: 'telegram' };
  return null;
}

// Derive the display from the server deadline, including after popup reopening.
// The display never extends the authorization deadline.
export function loginCountdown(expiresAt, now = Date.now()) {
  const seconds = Number.isSafeInteger(expiresAt) && Number.isFinite(now)
    ? Math.max(0, Math.min(300, Math.ceil((expiresAt - now) / 1000))) : 0;
  return { expired: seconds === 0, text: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` };
}

// Background notifications may complete login while the popup stays open.
// Only an actual unauthenticated -> authenticated transition changes the view.
export function authCompleted(previous, next) {
  return !previous?.subscription && Boolean(next?.subscription);
}

export function connectionElapsed(connectedAt, now = Date.now()) {
  if (!Number.isSafeInteger(connectedAt) || connectedAt <= 0 || !Number.isFinite(now)) return null;
  const seconds = Math.max(0, Math.floor((now - connectedAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ''}${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
