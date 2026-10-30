import { checkedApiBase } from '../runtime/api.js';

export function buildConfiguration(args) {
  const read = name => {
    const values = args.filter(value => value.startsWith(`--${name}=`));
    if (values.length > 1) throw new Error('DUPLICATE_BUILD_OPTION');
    return values[0]?.slice(name.length + 3);
  };
  if (args.some(value => !/^--(?:api|fixture|channel)=/.test(value))) throw new Error('UNKNOWN_BUILD_OPTION');
  const api = read('api'); const fixture = read('fixture'); const channel = read('channel') ?? 'dev';
  if (api === '' || fixture === '' || !['dev', 'release'].includes(channel)
      || (api !== undefined && fixture !== undefined) || (fixture !== undefined && channel === 'release')) throw new Error('INVALID_BUILD_OPTIONS');
  if (fixture) {
    const base = new URL(checkedApiBase(fixture, true));
    if (base.origin !== `http://127.0.0.1:${base.port}` || !base.port) throw new Error('INVALID_FIXTURE_BASE');
    return { apiBase: base.href, fixture: true, channel: 'fixture' };
  }
  if (channel === 'release' && !api) throw new Error('RELEASE_API_REQUIRED');
  return { apiBase: api ? checkedApiBase(api) : null, fixture: false, channel };
}

export function extensionManifest({ target, version, apiBase, fixture = false, channel = 'dev' }) {
  if (!['chrome', 'firefox'].includes(target)) throw new Error('INVALID_TARGET');
  const release = channel === 'release';
  const origin = apiBase ? new URL(apiBase).origin : null;
  return {
    manifest_version: 3,
    name: `Templar VPN${fixture ? ' — Local test' : release ? '' : ' — Development'}`,
    version,
    description: 'Connect this browser through your Templar VPN subscription. Sign in, choose a location and control which sites use the VPN.',
    homepage_url: 'https://templarvpn.com/',
    incognito: 'not_allowed',
    permissions: ['proxy', 'storage', 'alarms', 'privacy', ...(target === 'chrome' ? ['webRequest', 'webRequestAuthProvider'] : [])],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Templar VPN', default_popup: 'popup.html', default_icon: { 16: 'assets/icons/16.png', 32: 'assets/icons/32.png' } },
    icons: { 16: 'assets/icons/16.png', 32: 'assets/icons/32.png', 48: 'assets/icons/48.png', 128: 'assets/icons/128.png' },
    background: target === 'chrome' ? { service_worker: 'runtime/background.js', type: 'module' } : { scripts: ['runtime/background.js'], type: 'module' },
    content_security_policy: { extension_pages: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src ${origin ? origin + (fixture ? ' https://browser-fixture.platina300.org:9441 https://browser-fixture.platina300.org:9442' : ' https://speed.cloudflare.com https://*.platina300.org:9441 https://*.platina300.org:9442') : "'none'"}; object-src 'none'; base-uri 'none'` },
    ...(target === 'firefox' ? { browser_specific_settings: { gecko: {
      id: fixture ? 'templar-browser-fixture@templarvpn.com' : release ? 'templar-browser@templarvpn.com' : 'templar-browser-dev@templarvpn.com',
      strict_min_version: '142.0',
      // Required account sign-in and browser proxy transmission. No optional
      // analytics, content scripts, history access or remote code are added.
      data_collection_permissions: { required: ['authenticationInfo', 'personallyIdentifyingInfo', 'browsingActivity', 'websiteContent'] },
    } } } : { minimum_chrome_version: '120' }),
  };
}
