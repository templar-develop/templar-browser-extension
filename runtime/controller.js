import { checkedSpeedRecord } from './speed-result.js';
import { throwIfCancelled } from './measurement-job.js';
import { measureSites, measureSite } from './site-latency.js';
import { measureGateways, measureGateway } from './gateway-latency.js';
import { checkedLease, checkedRules, protectedHost } from './policy.js';
import { checkedSession, checkedSubscription, checkedRefresh } from './api.js';

const DEFAULT_RULES = { mode: 'all', domains: [], rfServices: false };

export class Controller {
  constructor({ api, driver, local, session, now = Date.now, probe = null, siteProbe = measureSite, gatewayProbe = measureGateway }) {
    Object.assign(this, { api, driver, local, session, now, probe, siteProbe, gatewayProbe });
    this.latencies = {};
    this.latencyUpdatedAt = null;
    this.account = null;
    this.login = null;
    this.speedtest = null;
    this.selectedRegion = 'auto';
    this.resolvedRegion = null;
    this.lease = null;
    this.connectedAt = null;
    this.active = false;
    this.status = 'disconnected';
    this.rules = DEFAULT_RULES;
    this.lastError = null;
  }

  async init() {
    const local = await this.local.get(['intentActive', 'selectedRegion', 'rules', 'login']);
    try { this.rules = checkedRules(local.rules || DEFAULT_RULES); } catch { this.rules = DEFAULT_RULES; }
    if (/^[a-z0-9_-]{1,24}$/.test(local.selectedRegion || '')) this.selectedRegion = local.selectedRegion;
    try { this.login = local.login ? checkedRefresh(local.login, this.now()) : null; }
    catch { await this.local.remove('login'); }
    const saved = await this.session.get(['account', 'lease', 'connectedAt', 'resolvedRegion', 'latencies', 'latencyUpdatedAt', 'latencyMethod', 'speedtest']);
    this.connectedAt = Number.isSafeInteger(saved.connectedAt) && saved.connectedAt > 0 && saved.connectedAt <= this.now() ? saved.connectedAt : null;
    try { this.account = saved.account ? checkedSession(saved.account, this.now()) : null; }
    catch { this.account = null; await this.session.remove('account'); }
    try { if (saved.lease) this.lease = checkedLease(saved.lease, this.now()); }
    catch { this.lease = null; await this.session.remove('lease'); }
    if (typeof saved.resolvedRegion === 'string' && this.account?.subscription.regions.some(r => r.id === saved.resolvedRegion)) this.resolvedRegion = saved.resolvedRegion;
    if (this.account && saved.latencyMethod === 'https-site' && saved.latencies && typeof saved.latencies === 'object') {
      for (const region of this.account.subscription.regions) {
        const ms = saved.latencies[region.id];
        if (ms === null || (Number.isFinite(ms) && ms > 0 && ms < 60000)) this.latencies[region.id] = ms;
      }
      if (Number.isSafeInteger(saved.latencyUpdatedAt) && saved.latencyUpdatedAt <= this.now()) this.latencyUpdatedAt = saved.latencyUpdatedAt;
    }
    this.speedtest = checkedSpeedRecord(saved.speedtest, this.account?.subscription, this.now());
    if (local.intentActive) {
      this.active = true;
      // A restarted worker must not turn an expired/missing session into DIRECT.
      await this.driver.install(this.rules, this.lease, !this.account || !this.lease);
      this.status = this.account && this.lease ? 'connected' : 'blocked';
    }
  }

  publicState() {
    const stale = this.active && (!this.lease || !this.account
      || this.lease.expiresAt <= this.now() || this.account.sessionExpiresAt <= this.now()
      || this.account.subscription.expiresAt <= this.now());
    return { status: this.status === 'connecting' ? 'connecting' : stale ? 'blocked' : this.status, active: this.active, connectedAt: this.connectedAt, leaseExpiresAt: this.lease?.expiresAt || null, selectedRegion: this.selectedRegion, resolvedRegion: this.resolvedRegion,
      subscription: this.account?.subscription || null, latencies: { ...this.latencies }, latencyUpdatedAt: this.latencyUpdatedAt, rules: this.rules, lastError: this.lastError,
      loginRecoverable: Boolean(this.login), serviceConfigured: Boolean(this.api.base), speedtest: this.speedtest?.regionId === (this.selectedRegion === 'auto' ? this.resolvedRegion : this.selectedRegion) ? this.speedtest : null };
  }

  token() {
    if (!this.account || this.account.sessionExpiresAt <= this.now() || this.account.subscription.expiresAt <= this.now()) throw new Error('ACCESS_DENIED');
    return this.account.token;
  }

  async installationId() {
    const saved = await this.local.get(['installationId']);
    if (typeof saved.installationId === 'string' && /^[a-f0-9-]{32,64}$/.test(saved.installationId)) return saved.installationId;
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    if (!/^[a-f0-9-]{32,64}$/i.test(value)) throw new Error('SERVICE_UNAVAILABLE');
    await this.local.set({ installationId: value });
    return value;
  }

  async authenticate(path, body) {
    // Validate a replacement before disconnecting/deleting the current session.
    const candidate = await this.api.request(path, { method: 'POST', body: { ...body, deviceId: await this.installationId() } });
    return this.acceptSession(candidate);
  }

  async acceptSession(value) {
    const candidate = checkedSession(value, this.now());
    const login = value.refresh ? checkedRefresh(value.refresh, this.now()) : null;
    const previous = this.account;
    await this.disconnect();
    this.latencies = {}; this.latencyUpdatedAt = null;
    await this.session.remove('latencies'); await this.session.remove('latencyUpdatedAt');
    this.speedtest = null; await this.session.remove('speedtest');
    this.account = candidate;
    this.login = login;
    if (login) await this.local.set({ login }); else await this.local.remove('login');
    await this.session.set({ account: candidate });
    if (previous) {
      try { await this.api.request('/session', { method: 'DELETE', token: previous.token }); } catch { /* Old short-lived tokens expire server-side. */ }
    }
    this.status = 'disconnected';
    this.lastError = null;
    return this.publicState();
  }

  async ensureAccount({ signal, remember = false } = {}) {
    throwIfCancelled(signal);
    if (remember && this.account && !this.login && this.account.sessionExpiresAt > this.now()) {
      if (this.active) { this.status = 'connecting'; await this.driver.install(this.rules, null, true); }
      const result = await this.api.request('/auth/remember', { method: 'POST', token: this.account.token, signal,
        body: { deviceId: await this.installationId() } });
      throwIfCancelled(signal);
      const account = checkedSession(result, this.now());
      const login = checkedRefresh(result.refresh, this.now());
      this.account = account; this.login = login;
      await this.local.set({ login }); await this.session.set({ account });
      return;
    }
    if (this.account && this.account.sessionExpiresAt > this.now() + 60_000) return;
    if (!this.login) { this.token(); return; }
    try {
      const login = checkedRefresh(this.login, this.now());
      const result = await this.api.request('/auth/refresh', { method: 'POST', signal,
        body: { refreshToken: login.token, deviceId: await this.installationId() } });
      throwIfCancelled(signal);
      const account = checkedSession(result, this.now());
      const refreshed = checkedRefresh(result.refresh, this.now());
      if (refreshed.token !== login.token || refreshed.expiresAt > login.expiresAt) throw new Error('INVALID_RESPONSE');
      // A failed refresh has not confirmed a replacement identity. Keep an
      // unchanged authorized lease until its original deadline; once a new
      // session is confirmed, block before adopting it and requesting its lease.
      if (this.active) { this.status = 'connecting'; await this.driver.install(this.rules, null, true); }
      throwIfCancelled(signal);
      this.account = account; this.login = refreshed;
      await this.local.set({ login: refreshed });
      await this.session.set({ account });
      this.lastError = null;
    } catch (error) {
      throwIfCancelled(signal);
      if (['ACCESS_DENIED', 'DEVICE_LIMIT_REACHED'].includes(error.code || error.message)) {
        this.account = null; this.login = null;
        await this.local.remove('login'); await this.session.remove('account');
      }
      throw error;
    }
  }

  async prepareSpeedTest(options = {}) {
    if (this.publicState().status !== 'connected') throw new Error('ACCESS_DENIED');
    if (!protectedHost('speed.cloudflare.com', this.rules)) throw new Error('SPEEDTEST_ROUTE_EXCLUDED');
    // The measurement occupies the command queue. Renew a near-expiry lease
    // before starting, so a slow test can finish within its authorized deadline.
    if (Math.min(this.lease.expiresAt, this.account.sessionExpiresAt) - this.now() < 90_000) await this.connect(options);
  }

  async rememberSpeedTest(result) {
    const record = checkedSpeedRecord({ ...result, regionId: this.resolvedRegion, measuredAt: this.now() }, this.account?.subscription, this.now());
    if (!record) throw new Error('INVALID_RESPONSE');
    this.speedtest = record;
    await this.session.set({ speedtest: record });
  }

  async select(region) {
    if (region !== 'auto' && !this.account?.subscription.regions.some(item => item.id === region)) throw new Error('INVALID_REGION');
    if (this.active) await this.disconnect();
    this.selectedRegion = region;
    this.resolvedRegion = null;
    await this.local.set({ selectedRegion: region });
    return this.publicState();
  }

  async autoRegion(options = {}) {
    const fresh = this.latencyUpdatedAt && this.now() - this.latencyUpdatedAt < 60_000;
    if (!fresh) {
      try { await this.measureRegions({ ...options, primaryOnly: true }); }
      catch (error) {
        throwIfCancelled(options.signal);
        if (['ACCESS_DENIED', 'DEVICE_LIMIT_REACHED', 'SUBSCRIPTION_REQUIRED'].includes(error.code || error.message)) throw error;
        // Optional diagnostics may be absent on an older server or temporarily
        // unavailable. Only /connect can authorize a VPN lease; ping failure
        // must not prevent that request from being made.
      }
    }
    // Ordinary TCP is the default profile. XHTTP stays independently selectable.
    const candidates = this.account.subscription.regions.filter(region => region.transport === 'tcp');
    if (!candidates.length) throw new Error('SERVICE_UNAVAILABLE');
    let ranking = this.latencies;
    if (!candidates.some(region => Number.isFinite(ranking[region.id]))) {
      ranking = {};
      await measureGateways(candidates, { signal: options.signal, probe: this.gatewayProbe,
        onResult: async (ids, ms) => { for (const id of ids) ranking[id] = ms; } });
      // Gateway RTT is used internally for fallback ordering only. It is never
      // stored/displayed as site latency, and all requests remain bounded.
    }
    candidates.sort((a, b) => (ranking[a.id] ?? Infinity) - (ranking[b.id] ?? Infinity));
    return candidates.slice(0, 3).map(region => region.id);
  }

  async measureRegions({ signal, onProgress = async () => {}, primaryOnly = false } = {}) {
    // An idle remembered login can outlive its short access token. Recover
    // authorization before probing; a valid live lease is never replaced.
    if (!this.account || this.account.sessionExpiresAt <= this.now()) await this.refresh({ signal });
    this.token();
    throwIfCancelled(signal);
    const regions = this.account.subscription.regions.filter(region => !primaryOnly || region.transport === 'tcp');
    let completed = 0;
    const pending = new Set(regions.map(r => r.id));
    await onProgress({ stage: 'measuring', completed, total: regions.length, pendingRegions: [...pending] });
    // Prepare restricted fixed-site tickets; the active browser lease and its
    // rules never change. TCP and XHTTP require distinct real transport probes.
    for (const region of regions) this.latencies[region.id] = null;
    const response = await this.api.request('/latency', { method: 'POST', token: this.token(), signal,
      body: { regions: regions.map(region => region.id) } });
    throwIfCancelled(signal);
    await measureSites(regions, response.probes, { signal, probe: this.siteProbe,
      onResult: async (ids, ms) => {
        for (const id of ids) { this.latencies[id] = ms; pending.delete(id); }
        completed += ids.length;
        await onProgress({ stage: 'measuring', completed, total: regions.length, pendingRegions: [...pending] });
      } });
    this.latencyUpdatedAt = this.now();
    await this.session.set({ latencies: this.latencies, latencyUpdatedAt: this.latencyUpdatedAt, latencyMethod: 'https-site' });
    return this.publicState();
  }

  async connect({ signal, onProgress = async () => {}, preserveOnFailure = true } = {}) {
    throwIfCancelled(signal);
    const continuing = this.lease && this.lease.expiresAt > this.now() && this.status === 'connected';
    // Account refresh briefly blocks before adopting a rotated token. Preserve
    // the connection clock while its previous lease is still within deadline.
    // An actual block/disconnect clears connectedAt; an expired lease restarts it.
    const connectionStartedAt = this.active && this.lease?.expiresAt > this.now() ? this.connectedAt : null;
    const previousToken = this.account?.token;
    this.active = true;
    await this.local.set({ intentActive: true });
    if (!continuing) {
      this.status = 'connecting';
    }
    try {
      if (!continuing) await this.driver.install(this.rules, null, true);
      await this.ensureAccount({ signal });
      const token = this.token();
      const targets = this.selectedRegion === 'auto'
        ? (this.resolvedRegion && this.account.subscription.regions.some(r => r.id === this.resolvedRegion)
          ? [this.resolvedRegion] : await this.autoRegion({ signal, onProgress }))
        : [this.selectedRegion];
      let lastError;
      for (const target of targets) {
        throwIfCancelled(signal);
        await onProgress({ stage: 'connecting', completed: 0, total: 0 });
        let result;
        try {
          result = await this.api.request('/connect', { method: 'POST', token, signal,
            body: { region: target, rfServices: this.rules.rfServices } });
        } catch (error) {
          throwIfCancelled(signal);
          if ((error.code || error.message) !== 'SERVICE_UNAVAILABLE') throw error;
          // Keep a valid tunnel during a control-plane outage. Once it has
          // expired, Auto must not retry a dead resolved node forever.
          if (!continuing && this.selectedRegion === 'auto' && this.resolvedRegion
              && targets.length === 1 && target === this.resolvedRegion) {
            const alternatives = await this.autoRegion({ signal, onProgress });
            targets.push(...alternatives.filter(id => id !== target).slice(0, 2));
          }
          lastError = error; continue;
        }
        throwIfCancelled(signal);
        const lease = checkedLease(result, this.now());
        if (!this.account.subscription.regions.some(region => region.id === result.regionId)
          || target !== result.regionId) throw new Error('INVALID_REGION');
        if (lease.expiresAt > Math.min(this.account.subscription.expiresAt, this.account.sessionExpiresAt)) throw new Error('INVALID_LEASE');
        await this.driver.install(this.rules, lease);
        throwIfCancelled(signal);
        this.lease = lease;
        this.resolvedRegion = result.regionId;
        this.status = 'connected';
        this.connectedAt = connectionStartedAt || this.now();
        this.lastError = null;
        await this.session.set({ lease, connectedAt: this.connectedAt, resolvedRegion: this.resolvedRegion });
        return this.publicState();
      }
      throw lastError || new Error('SERVICE_UNAVAILABLE');
    } catch (error) {
      if (signal?.aborted) {
        await this.disconnect();
        throw new Error('MEASUREMENT_CANCELLED');
      }
      await this.connectionError(error, { preserveLease: preserveOnFailure && continuing && previousToken === this.account?.token });
      throw error;
    }
  }

  async connectionError(error, { preserveLease = true } = {}) {
    const code = error.code || error.message || 'SERVICE_UNAVAILABLE';
    // A lost renewal response does not revoke an already authorized lease.
    // Keep its original deadline (including in PAC); never extend it locally.
    // Identity/routing replacements and malformed/denied responses must block.
    if (preserveLease && ['SERVICE_UNAVAILABLE', 'RATE_LIMITED'].includes(code)
        && this.active && this.status === 'connected' && this.lease?.expiresAt > this.now()
        && this.account?.sessionExpiresAt > this.now() && this.account.subscription.expiresAt > this.now()) {
      this.lastError = code;
      return;
    }
    await this.block(code);
  }

  async block(code = 'ACCESS_DENIED') {
    this.lease = null;
    this.connectedAt = null;
    this.status = this.active ? 'blocked' : 'disconnected';
    this.lastError = code;
    await this.session.remove('lease');
    await this.session.remove('connectedAt');
    await this.session.remove('resolvedRegion');
    if (this.active) await this.driver.install(this.rules, null, true);
  }

  async refresh(options = {}) {
    const previousToken = this.account?.token;
    try {
      await this.ensureAccount(options);
      const subscription = checkedSubscription(await this.api.request('/subscription', { token: this.token(), signal: options.signal }), this.now());
      this.account = { ...this.account, subscription };
      await this.session.set({ account: this.account });
      if (this.active) await this.connect(options); // Renew the same selection, never another manual region.
      return this.publicState();
    } catch (error) {
      if (options.signal?.aborted) { await this.disconnect(); throw new Error('MEASUREMENT_CANCELLED'); }
      await this.connectionError(error, { preserveLease: previousToken === this.account?.token });
      throw error;
    }
  }

  async updateRules(value, options = {}) {
    const rules = checkedRules({ ...value, rfServices: value?.rfServices ?? this.rules.rfServices });
    const previous = this.rules;
    if (this.active && rules.rfServices !== previous.rfServices) {
      // RF changes replace the server worker. If the response is lost,
      // connect() blocks until refresh obtains a confirmed replacement.
      this.rules = rules;
      try { await this.connect({ ...options, preserveOnFailure: false }); }
      catch (error) {
        this.rules = previous;
        if (this.active) await this.driver.install(previous, this.lease, this.status === 'blocked');
        throw error;
      }
      await this.local.set({ rules });
      return this.publicState();
    }
    if (this.active) await this.driver.install(rules, this.lease, this.status === 'blocked');
    this.rules = rules;
    await this.local.set({ rules });
    return this.publicState();
  }

  async disconnect() {
    await this.driver.clear();
    this.active = false;
    this.lease = null;
    this.connectedAt = null;
    this.status = 'disconnected';
    await this.local.set({ intentActive: false });
    await this.session.remove('lease');
    await this.session.remove('connectedAt');
    await this.session.remove('resolvedRegion');
    if (this.account) {
      try { await this.api.request('/disconnect', { method: 'POST', token: this.account.token, timeout: 2000 }); } catch { /* Local disconnect must still complete offline. */ }
    }
    return this.publicState();
  }

  async logout() {
    const token = this.account?.token;
    const login = this.login;
    try { await this.disconnect(); }
    finally {
      // Never retain usable credentials if a browser setting failed to clear.
      this.account = null; this.login = null; this.speedtest = null;
      await this.local.remove('login');
      this.latencies = {}; this.latencyUpdatedAt = null;
      this.lease = null;
      if (this.active) {
        this.status = 'blocked';
        this.driver.context = { ...this.driver.context, active: true, lease: null, forceBlocked: true };
      }
      await this.session.clear();
      if (login) { try { await this.api.request('/auth/revoke', { method: 'POST', timeout: 2000, body: { refreshToken: login.token, deviceId: await this.installationId() } }); } catch { /* Local credentials are removed even offline. */ } }
      if (token) { try { await this.api.request('/session', { method: 'DELETE', token }); } catch { /* Short-lived server expiry bounds an offline revocation. */ } }
    }
    return this.publicState();
  }
}
