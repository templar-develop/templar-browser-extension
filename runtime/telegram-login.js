// Pending challenges belong to the trusted extension session, not the popup.
// The public state contains only a boolean; the challenge never enters the UI.
export class TelegramLogin {
  constructor({ remote, session, deviceId, acceptSession, openTab, now = Date.now }) {
    Object.assign(this, { remote, session, deviceId, acceptSession, openTab, now });
  }
  async challenge() {
    const { telegramLogin } = await this.session.get(['telegramLogin']);
    if (!telegramLogin) return null;
    if (!/^[A-Za-z0-9_-]{32}$/.test(telegramLogin.token || '') || !Number.isFinite(telegramLogin.expiresAt)
      || telegramLogin.expiresAt <= this.now() || telegramLogin.expiresAt > this.now() + 300_000) {
      await this.clear(); return null;
    }
    return telegramLogin;
  }
  async pending() { return Boolean(await this.challenge()); }
  async clear() { await this.session.remove('telegramLogin'); }
  async start() {
    const result = await this.remote.request('/auth/telegram', { method: 'POST', body: { deviceId: await this.deviceId() } });
    let url;
    try { url = new URL(result.url); } catch { throw new Error('INVALID_RESPONSE'); }
    if (url.origin !== 'https://t.me' || url.pathname !== '/TemplarVPN_bot' || url.hash || url.username || url.password
      || !/^webauth_[A-Za-z0-9_-]{32}$/.test(url.searchParams.get('start') || '')
      || [...url.searchParams.keys()].length !== 1 || !/^[A-Za-z0-9_-]{32}$/.test(result.pollToken || '')
      || url.searchParams.get('start') !== 'webauth_' + result.pollToken) throw new Error('INVALID_RESPONSE');
    await this.session.set({ telegramLogin: { token: result.pollToken, expiresAt: this.now() + 300_000 } });
    await this.openTab(url.href);
  }
  async poll() {
    const challenge = await this.challenge();
    if (!challenge) throw new Error('TELEGRAM_EXPIRED');
    try {
      const result = await this.remote.request('/auth/telegram/poll', { method: 'POST', body: { pollToken: challenge.token, deviceId: await this.deviceId() } });
      if (result.pending === true) return true;
      await this.acceptSession(result);
      await this.clear();
      return false;
    } catch (error) {
      // A transient network failure must not discard the owner's confirmation.
      if (!['SERVICE_UNAVAILABLE', 'RATE_LIMITED'].includes(error.code || error.message)) await this.clear();
      throw error;
    }
  }
}
