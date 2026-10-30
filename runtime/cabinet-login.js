// Only the background keeps the redemption secret in trusted session storage.
export class CabinetLogin {
  constructor({ remote, session, deviceId, acceptSession, openTab, now = Date.now }) {
    Object.assign(this, { remote, session, deviceId, acceptSession, openTab, now });
  }
  valid(value) {
    if (!value || !/^[A-Za-z0-9_-]{32}$/.test(value.code || '')
      || !/^[A-Za-z0-9_-]{43}$/.test(value.pollToken || '')
      || !/^[A-HJ-NP-Z2-9]{8}$/.test(value.confirmationCode || '')
      || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= this.now()
      || value.expiresAt > this.now() + 300_000) return false;
    return value.url === 'https://cabinet.templarvpn.com/extension-login#' + value.code;
  }
  async challenge() {
    const { cabinetLogin } = await this.session.get(['cabinetLogin']);
    if (!cabinetLogin) return null;
    if (!this.valid(cabinetLogin)) { await this.session.remove('cabinetLogin'); return null; }
    return cabinetLogin;
  }
  async publicState() {
    const c = await this.challenge();
    return c ? { url: c.url, confirmationCode: c.confirmationCode, expiresAt: c.expiresAt } : null;
  }
  async clear() {
    const c = await this.challenge();
    await this.session.remove('cabinetLogin');
    if (c) {
      try { await this.remote.request('/auth/cabinet/cancel', { method: 'POST', body: {
        code: c.code, pollToken: c.pollToken, deviceId: await this.deviceId() } }); } catch { /* Absolute server expiry remains in force. */ }
    }
  }
  async start() {
    await this.clear();
    const result = await this.remote.request('/auth/cabinet', { method: 'POST', body: { deviceId: await this.deviceId() } });
    if (!this.valid(result) || result.interval !== 5) throw new Error('INVALID_RESPONSE');
    const { url, code, pollToken, confirmationCode, expiresAt } = result;
    await this.session.set({ cabinetLogin: { url, code, pollToken, confirmationCode, expiresAt } });
  }
  async open() {
    const c = await this.challenge();
    if (!c) throw new Error('CABINET_EXPIRED');
    await this.openTab(c.url);
  }
  async poll() {
    const c = await this.challenge();
    if (!c) throw new Error('CABINET_EXPIRED');
    try {
      const result = await this.remote.request('/auth/cabinet/poll', { method: 'POST', body: {
        code: c.code, pollToken: c.pollToken, deviceId: await this.deviceId() } });
      if (result.pending === true) return true;
      await this.acceptSession(result);
      await this.session.remove('cabinetLogin');
      return false;
    } catch (error) {
      if (!['SERVICE_UNAVAILABLE', 'RATE_LIMITED'].includes(error.code || error.message)) await this.session.remove('cabinetLogin');
      throw error;
    }
  }
}
