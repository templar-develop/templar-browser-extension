// Reconcile transient popup screens with authoritative background state.
// A successful login may finish after the popup was destroyed by an app switch.
export function resumedAuthView(state, { firstRun, rfServices }) {
  if (state?.subscription) return { view: firstRun || rfServices === null ? 'rf-question' : 'home' };
  if (state?.telegramPending) return { view: 'home', auth: 'telegram' };
  return null;
}
