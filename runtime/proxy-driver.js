import { checkedLease, checkedRules, pacScript, firefoxProxy } from './policy.js';

export class ProxyDriver {
  constructor(browserApi, controlHost) {
    this.api = browserApi;
    this.controlHost = controlHost;
    this.context = { active: false, rules: { mode: 'all', domains: [] }, lease: null, controlHost };
    this.firefox = Boolean(browserApi.proxy.onRequest);
  }

  async privacy(enabled) {
    const network = this.api.privacy?.network || {};
    if (!enabled) {
      // Proxy routing has already been released. A failed privacy cleanup must
      // not retain active intent or prevent cleanup of another override.
      await Promise.allSettled([network.webRTCIPHandlingPolicy, network.networkPredictionEnabled].filter(Boolean).map(async setting => {
        if ((await setting.get({})).levelOfControl === 'controlled_by_this_extension') await setting.clear({ scope: 'regular' });
      }));
      return [];
    }
    const changed = [];
    try {
      for (const [setting, value] of [[network.webRTCIPHandlingPolicy, 'disable_non_proxied_udp'], [network.networkPredictionEnabled, false]]) {
        if (!setting) continue;
        const current = await setting.get({});
        if (enabled && !['controllable_by_this_extension', 'controlled_by_this_extension'].includes(current.levelOfControl)) throw new Error('PROXY_CONFLICT');
        if (enabled) {
          await setting.set({ value, scope: 'regular' });
          if (current.levelOfControl !== 'controlled_by_this_extension') changed.push(setting);
        } else if (current.levelOfControl === 'controlled_by_this_extension') await setting.clear({ scope: 'regular' });
      }
    } catch (error) {
      await this.rollbackPrivacy(changed);
      throw error;
    }
    return changed;
  }

  async rollbackPrivacy(settings) {
    for (const setting of settings.reverse()) {
      if ((await setting.get({})).levelOfControl === 'controlled_by_this_extension') await setting.clear({ scope: 'regular' });
    }
  }

  async install(rules, lease = null, forceBlocked = false) {
    rules = checkedRules(rules);
    if (lease) lease = checkedLease(lease);
    const control = await this.api.proxy.settings.get({});
    if (!['controllable_by_this_extension', 'controlled_by_this_extension'].includes(control.levelOfControl)) throw new Error('PROXY_CONFLICT');
    const privacyChanged = await this.privacy(true);
    const context = { active: true, rules, lease, controlHost: this.controlHost, forceBlocked };
    try {
      if (!this.firefox) {
        await this.api.proxy.settings.set({ scope: 'regular', value: { mode: 'pac_script',
          pacScript: { data: pacScript(context), mandatory: true } } });
      }
    } catch (error) { await this.rollbackPrivacy(privacyChanged); throw error; }
    this.context = context;
  }

  async clear() {
    if (!this.firefox) {
      const current = await this.api.proxy.settings.get({});
      // Do not overwrite a policy that another extension/user took over.
      if (current.levelOfControl === 'controlled_by_this_extension') await this.api.proxy.settings.clear({ scope: 'regular' });
    }
    this.context = { ...this.context, active: false, lease: null, forceBlocked: false };
    await this.privacy(false);
  }

  resolveFirefox(url) { return firefoxProxy(url, this.context); }
}
