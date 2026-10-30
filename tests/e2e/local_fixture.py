"""Loopback-only browser fixture. Never contacts the real Templar service.

The TLS proxy only tunnels to our one local target. Secrets/certificates live
in a temporary directory and are destroyed by the caller. No OS trust changes.
This simulates the browser/API contract, not Xray or production accounting.
"""
import base64
import contextlib
import hashlib
import http.server
import http.client
import json
import secrets
import select
import socket
import ssl
import subprocess
import sys
import threading
import time
from pathlib import Path

GATEWAY = 'browser-fixture.platina300.org'
TARGET = 'payload.fixture.test'


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        if not isinstance(sys.exception(), (ConnectionResetError, BrokenPipeError, ssl.SSLEOFError)):
            super().handle_error(request, client_address)


class QuietHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, value, code=200):
        data = json.dumps(value).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        with contextlib.suppress(OSError):
            self.wfile.write(data)


class Fixture:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.cert = self.directory / 'fixture.pem'
        self.key = self.directory / 'fixture.key'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                        '-keyout', str(self.key), '-out', str(self.cert), '-days', '1',
                        '-subj', '/CN=Templar local fixture', '-addext',
                        f'subjectAltName=DNS:{GATEWAY},DNS:{TARGET}'],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        pubkey = subprocess.check_output(['openssl', 'x509', '-in', str(self.cert), '-pubkey', '-noout'])
        der = subprocess.run(['openssl', 'pkey', '-pubin', '-outform', 'DER'], input=pubkey,
                             check=True, capture_output=True).stdout
        self.spki = base64.b64encode(hashlib.sha256(der).digest()).decode()
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.context.load_cert_chain(self.cert, self.key)
        self.servers = []
        self.leases = {}
        self.revoked = False
        self.offline = False
        self.site_latency_enabled = True
        self.extra_primary = False
        self.unavailable_regions = set()
        self.connect_delay = 0
        self.lease_seconds = 20
        self.tunnels = 0
        self.target_requests = 0
        self.pings = 0
        self.probe_tickets = {}
        self.api_calls = []
        self.connect_started = threading.Event()
        self.access = secrets.token_urlsafe(32)
        self.refresh = 'tvpn_refresh_1_' + secrets.token_urlsafe(32)
        self.refresh_expiry = int(time.time() * 1000) + 3600_000

    def listen(self, handler, port=0, tls=False):
        server = Server(('127.0.0.1', port), handler)
        if tls:
            server.socket = self.context.wrap_socket(server.socket, server_side=True)
        self.servers.append(server)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server.server_port

    def subscription(self):
        return {'status': 'ACTIVE', 'expiresAt': self.refresh_expiry,
                'trafficLimitBytes': None, 'trafficUsedBytes': 0,
                'devices': {'used': 1, 'limit': 10},
                'regions': [{'id': region, 'name': name, 'flag': 'eu', 'transport': transport,
                             'latencyHost': GATEWAY, 'load': 'low'}
                            for region, name, transport in [
                                ('fixture', 'Local TCP', 'tcp'),
                                ('fixture-xhttp', 'Local XHTTP', 'xhttp'),
                                *([('fixture-alt', 'Local alternative TCP', 'tcp')] if self.extra_primary else [])]]}

    def account(self):
        return {'token': self.access, 'sessionExpiresAt': int(time.time()*1000)+180_000,
                'subscription': self.subscription(),
                'refresh': {'token': self.refresh, 'expiresAt': self.refresh_expiry}}

    def __enter__(self):
        fixture = self

        class API(QuietHandler):
            def do_OPTIONS(self):
                self.send_response(204)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
                self.end_headers()

            def request(self):
                path = self.path.removeprefix('/api/browser/v1')
                fixture.api_calls.append(path)
                size = int(self.headers.get('Content-Length', 0))
                if size > 8192:
                    return self.reply({}, 413)
                body = json.loads(self.rfile.read(size)) if size else {}
                if fixture.offline:
                    return self.reply({}, 503)
                if path == '/auth/revoke':
                    fixture.revoked = True
                    return self.reply({})
                if path == '/auth/refresh':
                    if fixture.revoked or body.get('refreshToken') != fixture.refresh:
                        return self.reply({}, 403)
                    return self.reply(fixture.account())
                if path in ['/auth/email', '/session'] and self.command == 'POST':
                    fixture.revoked = False
                    return self.reply(fixture.account())
                if self.headers.get('Authorization') != 'Bearer ' + fixture.access:
                    return self.reply({}, 403)
                if path == '/subscription':
                    return self.reply(fixture.subscription())
                if path == '/auth/remember':
                    return self.reply(fixture.account())
                if path == '/latency':
                    if not fixture.site_latency_enabled:
                        return self.reply({}, 404)
                    probes = {}
                    for region in body['regions']:
                        ticket = 'bp_' + secrets.token_urlsafe(32)
                        expiry = int(time.time() * 1000) + 15000
                        fixture.probe_tickets[ticket] = [expiry, 3]
                        probes[region] = {'regionId': region, 'host': GATEWAY, 'ticket': ticket, 'expiresAt': expiry}
                    return self.reply({'probes': probes})
                if path == '/connect':
                    if body.get('region') in fixture.unavailable_regions:
                        return self.reply({}, 503)
                    fixture.connect_started.set()
                    time.sleep(fixture.connect_delay)
                    username = secrets.token_hex(8)
                    password = secrets.token_urlsafe(32)
                    expiry = time.time() + fixture.lease_seconds
                    fixture.leases[username + ':' + password] = expiry
                    return self.reply({'regionId': body['region'], 'proxy': {'host': GATEWAY, 'port': 9443},
                                       'username': username, 'password': password, 'expiresAt': int(expiry*1000)})
                return self.reply({})

            do_GET = request
            do_POST = request
            do_DELETE = request

        class Target(QuietHandler):
            def do_GET(self):
                fixture.target_requests += 1
                if self.path == '/generate_204':
                    self.send_response(204)
                    self.send_header('Content-Length', '0')
                    self.end_headers()
                    return
                body = ('TEMPLAR_LOCAL_TARGET ' + self.path + '\n' + 'x'*4096).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain')
                self.send_header('Content-Length', str(len(body)))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Connection', 'close')
                self.end_headers()
                self.wfile.write(body)

        class Ping(QuietHandler):
            def do_GET(self):
                fixture.pings += 1
                self.send_response(204 if self.path.startswith('/latency?nonce=') else 404)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', '0')
                self.end_headers()

        class SitePing(QuietHandler):
            protocol_version = 'HTTP/1.1'

            def do_GET(self):
                token = self.headers.get('Authorization', '').removeprefix('Bearer ')
                record = fixture.probe_tickets.get(token)
                if (not self.path.startswith('/site-latency?nonce=') or not record
                        or record[0] <= time.time() * 1000 or record[1] <= 0):
                    return self.reply({}, 403)
                record[1] -= 1
                # Real validated HTTPS to the fixture's one fixed local site.
                context = ssl.create_default_context(cafile=str(fixture.cert))
                with socket.create_connection(('127.0.0.1', fixture.target_port), timeout=3) as raw:
                    with context.wrap_socket(raw, server_hostname=TARGET) as upstream:
                        upstream.sendall(('GET /generate_204 HTTP/1.1\r\nHost: ' + TARGET + '\r\n\r\n').encode())
                        response = http.client.HTTPResponse(upstream)
                        response.begin()
                        if response.status != 204:
                            return self.reply({}, 503)
                fixture.pings += 1
                self.send_response(204)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', '0')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()

        class Proxy(QuietHandler):
            protocol_version = 'HTTP/1.1'

            def do_CONNECT(self):
                # Never resolve or connect to a client-selected destination.
                if self.path != f'{TARGET}:{fixture.target_port}':
                    return self.reply({}, 403)
                credential = self.headers.get('Proxy-Authorization', '')
                try:
                    decoded = base64.b64decode(credential.removeprefix('Basic '), validate=True).decode()
                except (ValueError, UnicodeError):
                    decoded = ''
                expiry = fixture.leases.get(decoded, 0)
                if expiry <= time.time():
                    self.send_response(407)
                    self.send_header('Proxy-Authenticate', 'Basic realm="local-fixture"')
                    self.send_header('Content-Length', '0')
                    self.send_header('Connection', 'close')
                    self.end_headers()
                    self.close_connection = True
                    return
                fixture.tunnels += 1
                self.close_connection = True
                with socket.create_connection(('127.0.0.1', fixture.target_port), timeout=5) as upstream:
                    self.send_response(200, 'Connection Established')
                    self.end_headers()
                    self.wfile.flush()
                    while time.time() < expiry:
                        ready, _, _ = select.select([self.connection, upstream], [], [], max(0, min(.2, expiry-time.time())))
                        for source in ready:
                            data = source.recv(65536)
                            if not data:
                                return
                            (upstream if source is self.connection else self.connection).sendall(data)
                    self.close_connection = True

        try:
            self.api_port = self.listen(API)
            self.target_port = self.listen(Target, tls=True)
            self.listen(Ping, 9442, tls=True)
            self.listen(SitePing, 9441, tls=True)
            self.listen(Proxy, 9443, tls=True)
        except Exception:
            self.__exit__(None, None, None)
            raise
        return self

    def __exit__(self, *args):
        for server in self.servers:
            server.shutdown()
            server.server_close()
