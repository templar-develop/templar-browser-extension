"""Local fixture for native UI checks when a vendor restricts WebDriver.

TEMPLAR_TEST_BINARY=/path/to/browser TEMPLAR_TEST_OUT=/tmp/owned-results
python tests/e2e/manual_local.py

Open chrome://extensions/ in the TEST window, load build/fixture/chrome.
Use local@example.invalid / local-fixture-only. Never use a real account.
The control file accepts short/long/offline/online/restart/stop. No remote API exists.
"""
import contextlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

from local_fixture import Fixture, GATEWAY, TARGET

ROOT = Path(__file__).resolve().parents[2]
out = Path(os.environ['TEMPLAR_TEST_OUT'])
out.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='templar-manual-local-') as directory:
    private = Path(directory)
    with Fixture(private) as fixture:
        fixture.lease_seconds = 120
        subprocess.run(['node', 'scripts/build.mjs', f'--fixture=http://127.0.0.1:{fixture.api_port}/api/browser/v1'],
                       cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
        target_url = f'https://{TARGET}:{fixture.target_port}/?manual=1'
        (out / 'target-url').write_text(target_url)
        arguments = [os.environ['TEMPLAR_TEST_BINARY'], '--new-window', '--enable-automation', '--no-first-run',
                     '--no-default-browser-check', '--disable-background-networking',
                     '--user-data-dir=' + str(private / 'profile'), '--ignore-certificate-errors-spki-list=' + fixture.spki,
                     f'--host-resolver-rules=MAP {GATEWAY} 127.0.0.1, MAP {TARGET} 127.0.0.1',
                     'data:text/html,<title>Templar LOCAL TEST</title><h1>Templar LOCAL TEST</h1><p>Temporary profile. Loopback fixture only.</p>']
        log = open(out / 'browser-stderr.log', 'wb')
        process = subprocess.Popen(arguments, stdout=log, stderr=log)
        restarts = 0
        print('Local target:', target_url, flush=True)
        print('Control file:', out / 'control', flush=True)
        try:
            deadline = time.monotonic() + 1800
            while process.poll() is None and time.monotonic() < deadline:
                control = out / 'control'
                if control.exists():
                    action = control.read_text().strip()
                    control.unlink()
                    if action == 'stop':
                        break
                    if action == 'restart':
                        process.terminate()
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait(timeout=5)
                        process = subprocess.Popen(arguments, stdout=log, stderr=log)
                        restarts += 1
                    if action == 'short':
                        fixture.lease_seconds = 6
                    if action == 'long':
                        fixture.lease_seconds = 120
                    if action == 'offline':
                        fixture.offline = True
                    if action == 'online':
                        fixture.offline = False
                (out / 'fixture-observations.json').write_text(json.dumps({'proxyTunnels': fixture.tunnels,
                    'targetRequests': fixture.target_requests, 'pingRequests': fixture.pings,
                    'apiPaths': fixture.api_calls, 'leaseSeconds': fixture.lease_seconds, 'apiOffline': fixture.offline,
                    'browserRestarts': restarts, 'productionTouched': False}, indent=2) + '\n')
                time.sleep(.2)
        finally:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            log.close()
