"""Isolated native browser checks. Requires Selenium, OpenSSL and (FF) certutil.

Example: .venv/bin/python clients/templar_browser/tests/e2e/native_local.py chrome
Optional environment: TEMPLAR_TEST_BINARY, TEMPLAR_TEST_DRIVER, TEMPLAR_TEST_OUT.
Runs sequentially because the fixture reserves loopback ports 9442/9443.
Does not install, publish, sign, upload or access a production account.
"""
import argparse
import contextlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from local_fixture import Fixture, GATEWAY, TARGET
from chromium_ui import reload_chrome_extension

ROOT = Path(__file__).resolve().parents[2]
os.environ['SE_AVOID_STATS'] = 'true'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('browser', choices=['chrome', 'firefox', 'edge', 'opera', 'brave', 'yandex'])
    args = parser.parse_args()
    out = Path(os.environ.get('TEMPLAR_TEST_OUT', tempfile.mkdtemp(prefix='templar-local-report-')))
    out.mkdir(parents=True, exist_ok=True)
    report = {'browser': args.browser, 'checks': [], 'production_touched': False}
    driver = None

    def check(name, valid=True):
        assert valid, name
        report['checks'].append(name)
        print(args.browser, name, flush=True)

    with tempfile.TemporaryDirectory(prefix='templar-browser-local-') as directory:
        private = Path(directory)
        profile = private / 'profile'
        profile.mkdir()
        with Fixture(private) as fixture:
            subprocess.run(['node', 'scripts/build.mjs', f'--fixture=http://127.0.0.1:{fixture.api_port}/api/browser/v1'],
                           cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
            popup = None
            extension_uuid = str(uuid.uuid4())

            def launch():
                nonlocal driver, popup
                if args.browser == 'firefox':
                    from selenium.webdriver.firefox.options import Options
                    from selenium.webdriver.firefox.service import Service
                    certutil = shutil.which('certutil')
                    if not certutil:
                        raise RuntimeError('certutil is required; no system certificate trust will be changed')
                    if not (profile / 'cert9.db').exists():
                        subprocess.run([certutil, '-N', '-d', 'sql:' + str(profile), '--empty-password'], check=True)
                        subprocess.run([certutil, '-A', '-d', 'sql:' + str(profile), '-n', 'Templar local fixture',
                                        '-t', 'CT,,', '-i', str(fixture.cert)], check=True)
                    options = Options()
                    options.add_argument('-headless')
                    options.profile = str(profile)
                    options.set_preference('network.dns.localDomains', GATEWAY + ',' + TARGET)
                    options.set_preference('network.trr.mode', 5)
                    options.set_preference('extensions.webextensions.uuids', json.dumps({'templar-browser-fixture@templarvpn.com': extension_uuid}))
                    if os.environ.get('TEMPLAR_TEST_BINARY'):
                        options.binary_location = os.environ['TEMPLAR_TEST_BINARY']
                    options.set_capability('acceptInsecureCerts', False)
                    service = Service(log_output=str(out / 'firefox-driver.log'), service_args=['--allow-system-access', '--log', 'error'])
                    driver = webdriver.Firefox(options=options, service=service)
                    driver.install_addon(str(ROOT / ('artifacts/fixture/templar-browser-firefox-' + json.loads((ROOT / 'package.json').read_text())['version'] + '-fixture.xpi')), temporary=True)
                    popup = 'moz-extension://' + extension_uuid + '/popup.html'
                    driver.set_context('chrome')
                    driver.execute_script('gBrowser.selectedTab=gBrowser.addTab(arguments[0],{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});', popup)
                    driver.set_context('content')
                    driver.switch_to.window(driver.window_handles[-1])
                else:
                    if args.browser == 'edge':
                        from selenium.webdriver.edge.options import Options
                        from selenium.webdriver.edge.service import Service
                        constructor = webdriver.Edge
                    else:
                        from selenium.webdriver.chrome.options import Options
                        from selenium.webdriver.chrome.service import Service
                        constructor = webdriver.Chrome
                    options = Options()
                    if os.environ.get('TEMPLAR_TEST_BINARY'):
                        options.binary_location = os.environ['TEMPLAR_TEST_BINARY']
                    for argument in [*([] if os.environ.get('TEMPLAR_TEST_HEADED') == '1' else ['--headless=new']), '--enable-unsafe-extension-debugging',
                                     '--remote-debugging-port=0' if args.browser == 'yandex' else '--remote-debugging-pipe',
                                     '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
                                     '--load-extension=' + str(ROOT / 'build/fixture/chrome'), '--user-data-dir=' + str(profile),
                                     '--ignore-certificate-errors-spki-list=' + fixture.spki,
                                     f'--host-resolver-rules=MAP {GATEWAY} 127.0.0.1, MAP {TARGET} 127.0.0.1']:
                        options.add_argument(argument)
                    if args.browser == 'yandex':
                        options.add_argument('about:blank')
                    options.set_capability('acceptInsecureCerts', False)
                    kwargs = {'options': options}
                    if os.environ.get('TEMPLAR_TEST_DRIVER'):
                        kwargs['service'] = Service(executable_path=os.environ['TEMPLAR_TEST_DRIVER'])
                    driver = constructor(**kwargs)
                    if not popup:
                        def extension_targets():
                            return [t for t in driver.execute_cdp_cmd('Target.getTargets', {})['targetInfos']
                                    if t['url'].startswith('chrome-extension://') and t['url'].endswith('/runtime/background.js')]
                        until = time.monotonic() + 5
                        while not extension_targets() and time.monotonic() < until:
                            time.sleep(.1)
                        if not extension_targets():
                            # Branded Chromium builds can disable --load-extension.
                            # Recent builds expose this debugging-only CDP method.
                            if os.environ.get('TEMPLAR_TEST_MANUAL_INSTALL') == '1':
                                try:
                                    driver.get('chrome://extensions/')
                                except WebDriverException as error:
                                    if 'Forbidden' not in str(error):
                                        raise
                                print('Install build/fixture/chrome in this temporary profile; write its ID to ' + str(out / 'installation-id'), flush=True)
                                deadline = time.monotonic() + 240
                                while not (out / 'installation-id').exists():
                                    if time.monotonic() > deadline:
                                        raise RuntimeError('TEST_PROFILE_INSTALLATION_TIMEOUT')
                                    time.sleep(.2)
                                import re
                                extension_id = (out / 'installation-id').read_text().strip()
                                if not re.fullmatch('[a-p]{32}', extension_id):
                                    raise RuntimeError('INVALID_TEST_EXTENSION_ID')
                                popup = 'chrome-extension://' + extension_id + '/popup.html'
                                report['installation'] = 'manual_unpacked_in_temporary_profile'
                            else:
                                driver.execute_cdp_cmd('Extensions.loadUnpacked', {'path': str(ROOT / 'build/fixture/chrome')})
                        if not popup:
                            targets = WebDriverWait(driver, 20).until(lambda d: extension_targets())
                            popup = targets[0]['url'].split('/runtime/')[0] + '/popup.html'
                    driver.get(popup)
                driver.set_page_load_timeout(10)
                driver.set_script_timeout(30)
                driver.set_window_size(950, 920)

            def command(kind, **data):
                result = driver.execute_async_script('const done=arguments[arguments.length-1];(globalThis.browser||globalThis.chrome).runtime.sendMessage(arguments[0]).then(done,e=>done({ok:false,error:e.name}));', {'type': kind, **data})
                if not result or not result.get('ok'):
                    raise RuntimeError(kind + ': ' + str((result or {}).get('error')))
                return result['state']

            def state():
                return command('GET_STATE')

            def wait_idle():
                return WebDriverWait(driver, 20, poll_frequency=.1).until(lambda d: not state().get('measurement'))

            def transfer(expected=True, proxied=True):
                before = fixture.tunnels
                requests = fixture.target_requests
                original = driver.current_window_handle
                driver.switch_to.new_window('tab')
                success = False
                try:
                    driver.get(f'https://{TARGET}:{fixture.target_port}/?nonce={uuid.uuid4()}')
                    success = 'TEMPLAR_LOCAL_TARGET' in driver.find_element(By.TAG_NAME, 'body').text
                except WebDriverException:
                    pass
                finally:
                    driver.close()
                    driver.switch_to.window(original)
                assert success is expected, 'HTTPS transfer expectation failed'
                if expected:
                    assert fixture.target_requests > requests
                    assert (fixture.tunnels > before) is proxied, 'Unexpected direct/proxy route'
                else:
                    assert fixture.target_requests == requests, 'Blocked request reached target'

            def restart_background(empty_session=False):
                if args.browser == 'firefox':
                    driver.execute_async_script('const done=arguments[arguments.length-1];(arguments[0]?browser.storage.session.clear():Promise.resolve()).then(()=>browser.runtime.getBackgroundPage()).then(bg=>{done(true);setTimeout(()=>bg.location.reload(),50);});', empty_session)
                    time.sleep(.2)
                else:
                    if empty_session:
                        driver.execute_async_script('const done=arguments[arguments.length-1];chrome.storage.session.clear().then(()=>done(true));')
                    driver.execute_cdp_cmd('ServiceWorker.enable', {})
                    driver.execute_cdp_cmd('ServiceWorker.stopAllWorkers', {})
                driver.get(popup)
                WebDriverWait(driver, 20, poll_frequency=.1).until(lambda d: not state().get('measurement'))

            try:
                launch()
                report['browser_version'] = driver.capabilities.get('browserVersion')
                check('TLS exceptions confined to fixture key/profile', driver.capabilities.get('acceptInsecureCerts') is False)
                driver.execute_script("localStorage.setItem('templar-browser-onboarded','1')")
                driver.refresh()
                WebDriverWait(driver, 15).until(lambda d: d.find_elements(By.CSS_SELECTOR, '[data-auth="email"]'))
                driver.find_element(By.CSS_SELECTOR, '[data-auth="email"]').click()
                driver.find_element(By.ID, 'real-email').send_keys('local@example.invalid')
                driver.find_element(By.ID, 'real-password').send_keys('local-fixture-only')
                driver.find_element(By.CSS_SELECTOR, '#email-form button').click()
                WebDriverWait(driver, 15).until(lambda d: state().get('subscription'))
                wait_idle()
                check('real email form works after sanitizing DOM')
                layout = driver.execute_script('''const screen=document.querySelector('#screen');
                  const popup=document.querySelector('#popup');
                  return {height:popup.clientHeight, scroll:screen.scrollHeight, visible:screen.clientHeight,
                    width:screen.scrollWidth, client:screen.clientWidth,
                    last:screen.lastElementChild.getBoundingClientRect().bottom,
                    bottom:screen.getBoundingClientRect().bottom};''')
                check('home fits 398 by 600 popup without hidden content or scroll',
                      layout['height'] == 600 and layout['scroll'] <= layout['visible']
                      and layout['width'] <= layout['client'] and layout['last'] <= layout['bottom'])
                check('new installation defaults RF services to direct', state()['rules']['rfServices'] is False)
                driver.save_screenshot(str(out / 'home.png'))
                command('SELECT', region='fixture-xhttp')
                command('CONNECT')
                transfer()
                check('selected XHTTP profile transfers through authenticated TLS proxy')
                original = state()
                ping_started = time.monotonic()
                ping = command('PING')
                report['ping_seconds'] = round(time.monotonic() - ping_started, 3)
                check('parallel site ping measures TCP/XHTTP separately and preserves lease/timer', ping['connectedAt'] == original['connectedAt']
                      and ping['leaseExpiresAt'] == original['leaseExpiresAt'] and len(ping['latencies']) == 2
                      and all(isinstance(v, int) and v > 0 for v in ping['latencies'].values()) and fixture.pings == 6)
                fixture.offline = True
                try:
                    command('REFRESH')
                    raise AssertionError('offline refresh unexpectedly succeeded')
                except RuntimeError as error:
                    assert 'SERVICE_UNAVAILABLE' in str(error)
                transfer()
                check('temporary API outage preserves the authorized live tunnel and its original deadline',
                      state()['status'] == 'connected' and state()['leaseExpiresAt'] == original['leaseExpiresAt']
                      and state()['connectedAt'] == original['connectedAt'])
                fixture.offline = False
                command('REFRESH')
                transfer()
                check('renewal resumes after API recovery without a user reconnect')
                # Verify both removal of dangerous markup and preservation of UI controls.
                dom = driver.execute_async_script('''const done=arguments[arguments.length-1];
                  import('./runtime/safe-dom.js').then(({safeFragment})=>{
                    const root=document.createElement('div');
                    root.append(safeFragment('<script>window.injected=1</script><img src=x onerror="window.injected=2"><a id="bad" href="javascript:alert(1)">bad</a><a id="external" href="https://templarvpn.com/" target="_blank">safe</a><a id="parent" target="_parent">bad target</a><svg onload="alert(1)"><use href="https://evil.invalid/s.svg#i-power"></use><use href="#i-power"></use><foreignObject><iframe srcdoc="bad"></iframe></foreignObject></svg><button data-command="CONNECT" aria-label="Connect">ok</button><input id="real-email" name="email"><p style="display:none">test</p>'));
                    done({unsafe:!!root.querySelector('script,iframe,foreignObject,[onerror],[onload],[style],[srcdoc]'),badLink:!!root.querySelector('a#bad[href]'),externalUse:[...root.querySelectorAll('use')].some(e=>e.getAttribute('href')?.startsWith('https:')),sprite:!!root.querySelector('use[href="#i-power"]'),button:!!root.querySelector('button[data-command="CONNECT"]'),input:!!root.querySelector('input#real-email[name="email"]'),newTab:!!root.querySelector('a#external[target="_blank"][rel="noopener noreferrer"]'),badTarget:!!root.querySelector('a#parent[target]')});
                  }).catch(e=>done({error:e.name}));''')
                check('script/event/javascript URL/SVG injection removed; controls/sprite preserved',
                      dom == {'unsafe': False, 'badLink': False, 'externalUse': False, 'sprite': True, 'button': True, 'input': True, 'newTab': True, 'badTarget': False})
                command('DISCONNECT')
                # Reproduce the actual 0.4.3 / older production API mismatch:
                # optional site ping returns 404, but /connect still works.
                fixture.site_latency_enabled = False
                driver.execute_async_script('const done=arguments[arguments.length-1];(globalThis.browser||globalThis.chrome).storage.session.remove(["latencies","latencyUpdatedAt","latencyMethod"]).then(()=>done(true));')
                restart_background()
                command('SELECT', region='auto')
                command('CONNECT')
                transfer()
                check('Auto transfers with legacy API missing optional site ping', state()['resolvedRegion'] == 'fixture'
                      and all(value is None for value in state()['latencies'].values()))
                restart_background(empty_session=True)
                WebDriverWait(driver, 20).until(lambda d: state()['status'] == 'connected')
                transfer()
                check('saved Auto connection recovers with legacy API and empty session')
                command('DISCONNECT')
                transfer(proxied=False)
                check('explicit Disconnect restores direct internet without removing extension')
                fixture.site_latency_enabled = True
                fixture.extra_primary = True
                command('REFRESH')
                command('SELECT', region='auto')
                driver.execute_async_script('''const done=arguments[arguments.length-1];
                  (globalThis.browser||globalThis.chrome).storage.session.set({latencies:{fixture:10,'fixture-alt':100},
                    latencyUpdatedAt:Date.now(),latencyMethod:'https-site'}).then(()=>done(true));''')
                restart_background()
                command('CONNECT')
                assert state()['resolvedRegion'] == 'fixture'
                fixture.unavailable_regions.add('fixture')
                fixture.leases.clear()
                driver.execute_async_script('''const done=arguments[arguments.length-1],api=globalThis.browser||globalThis.chrome;
                  api.storage.session.get('lease').then(async v=>{v.lease.expiresAt=Date.now()+100;
                    await api.storage.session.set(v);done(true)});''')
                time.sleep(.15)
                restart_background()
                WebDriverWait(driver, 20).until(lambda d: state()['status'] == 'connected' and state()['resolvedRegion'] == 'fixture-alt')
                transfer()
                check('expired Auto connection leaves an unavailable resolved node and transfers through its alternative', state()['selectedRegion'] == 'auto')
                command('DISCONNECT')
                fixture.extra_primary = False
                fixture.unavailable_regions.clear()
                command('REFRESH')
                command('SELECT', region='fixture-xhttp')
                fixture.lease_seconds = 3
                command('CONNECT')
                driver.execute_async_script('const done=arguments[arguments.length-1];(globalThis.browser||globalThis.chrome).alarms.clear("templar-renew").then(done);')
                time.sleep(3.3)
                check('expired lease is displayed blocked', state()['status'] == 'blocked')
                transfer(False)
                check('expired lease cannot fall back to a direct request')
                fixture.offline = True
                try:
                    command('REFRESH')
                    raise AssertionError('offline refresh unexpectedly succeeded')
                except RuntimeError as error:
                    assert 'SERVICE_UNAVAILABLE' in str(error)
                transfer(False)
                check('API outage keeps protected traffic blocked')
                driver.refresh()
                WebDriverWait(driver, 10).until(lambda d: d.find_elements(By.CSS_SELECTOR, '[data-recover-connection]'))
                check('blocked home also fits without scrolling', driver.execute_script('const s=document.querySelector("#screen"); return s.scrollHeight<=s.clientHeight && s.lastElementChild.getBoundingClientRect().bottom<=s.getBoundingClientRect().bottom;'))
                driver.find_element(By.CSS_SELECTOR, '[data-recover-connection]').click()
                WebDriverWait(driver, 10).until(lambda d: d.find_elements(By.CSS_SELECTOR, '.home-view .error-notice'))
                check('failed recovery message remains visible without home scrolling', driver.execute_script('const s=document.querySelector("#screen"); return s.scrollHeight<=s.clientHeight && s.lastElementChild.getBoundingClientRect().bottom<=s.getBoundingClientRect().bottom;'))
                driver.find_element(By.CSS_SELECTOR, '[data-release-connection]').click()
                WebDriverWait(driver, 10).until(lambda d: state()['status'] == 'disconnected' and not state()['active'])
                transfer(proxied=False)
                check('blocked screen Disconnect button releases direct internet during API outage')
                fixture.offline = False
                fixture.lease_seconds = 20
                command('CONNECT')
                restart_background(empty_session=True)
                WebDriverWait(driver, 20, poll_frequency=.1).until(lambda d: state()['status'] == 'connected')
                transfer()
                check('empty session/background restart restores saved login and same XHTTP selection', state()['selectedRegion'] == 'fixture-xhttp')
                fixture.connect_delay = 2
                fixture.connect_started.clear()
                driver.execute_script('window.pendingReply=null;(globalThis.browser||globalThis.chrome).runtime.sendMessage({type:"REFRESH"}).then(r=>window.pendingReply=r);')
                assert fixture.connect_started.wait(5)
                command('DISCONNECT')
                WebDriverWait(driver, 10).until(lambda d: d.execute_script('return window.pendingReply'))
                time.sleep(2.1)
                check('disconnect cancels delayed refresh without late reconnect', not state()['active'] and state()['status'] == 'disconnected')
                transfer(proxied=False)
                fixture.connect_delay = 0
                restart_background(empty_session=True)
                check('explicit disconnect stays off after restored sign-in', not state()['active'])
                if args.browser != 'firefox':
                    driver.quit()
                    driver = None
                    launch()
                    WebDriverWait(driver, 20).until(lambda d: state().get('subscription') and not state().get('measurement'))
                    check('full browser restart restores sign-in and remains disconnected', not state()['active'])
                    command('CONNECT')
                    driver.quit()
                    driver = None
                    launch()
                    WebDriverWait(driver, 20).until(lambda d: state()['status'] == 'connected' and not state().get('measurement'))
                    transfer()
                    check('full browser restart restores active XHTTP route', state()['selectedRegion'] == 'fixture-xhttp')
                if args.browser == 'chrome':
                    reload_chrome_extension(driver, popup)
                    WebDriverWait(driver, 20).until(lambda d: state()['status'] == 'connected' and not state().get('measurement'))
                    transfer()
                    check('actual chrome extensions Reload preserves sign-in, XHTTP selection and transfer', state()['selectedRegion'] == 'fixture-xhttp')
                fixture.revoked = True
                restart_background(empty_session=True)
                WebDriverWait(driver, 20).until(lambda d: not state().get('measurement') and not state()['loginRecoverable'])
                check('revoked refresh clears saved sign-in', not state().get('subscription'))
                command('LOGOUT')
                check('logout leaves no account and no active route', not state()['active'] and not state().get('subscription'))
                driver.get_screenshot_as_file(str(out / (args.browser + '-final.png')))
                report['passed'] = True
            except Exception as error:
                report['passed'] = False
                # Error messages can include browser logs; keep reports free of raw state/secrets.
                report['failure_type'] = type(error).__name__
                if driver:
                    with contextlib.suppress(Exception):
                        driver.save_screenshot(str(out / (args.browser + '-failure.png')))
                        report['layout'] = driver.execute_script('''const s=document.querySelector('#screen');
                          return s && {scroll:s.scrollHeight,visible:s.clientHeight,bottom:s.getBoundingClientRect().bottom,
                            items:[...s.children].map(e=>({tag:e.tagName,classes:e.className,height:e.getBoundingClientRect().height,bottom:e.getBoundingClientRect().bottom}))};''')
                raise
            finally:
                if driver:
                    with contextlib.suppress(Exception):
                        driver.quit()
                (out / (args.browser + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
                print('Report:', out / (args.browser + '.json'), flush=True)


if __name__ == '__main__':
    main()
