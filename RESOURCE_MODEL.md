# Browser extension resource model

The extension is event driven. It injects no content scripts, reads no history
and sends no telemetry. Static stars have no idle animation loop.

- Trusted session storage holds short access/proxy credentials and completed
  speed/ping snapshots. Local storage holds installation identity, preferences,
  prior VPN intent and an independently revocable refresh credential, maximum
  30 days/subscription expiry. It is never synced or put in public state/PAC.
- Startup restores sign-in and prior VPN intent. Explicit disconnect remains
  off. Expired/missing leases block until confirmed recovery. The active renewal
  alarm runs every 30 seconds and is recreated if missing; state reads do not
  postpone its deadline. Online/network-change events add recovery triggers
  where the browser provides them. Idle disconnected sessions do not poll.
- User-started Telegram confirmation has a five-minute challenge and 30-second
  background alarm. Completion, logout, replacement login and expiry clear it.
- Connect/Auto/Refresh, ping and speed share a reserved mutation job. State reads
  and cancellation bypass the queue. Disconnect/Logout abort jobs and background
  renewal before cleanup. No cancelled result can reinstall a lease.
- Ping measures issued TCP/XHTTP profiles independently using a fixed Google
  HTTPS 204 response through the accounted VLESS inbound. Auto checks primary
  TCP profiles only and reuses fresh results for 60 seconds. At most eight
  browser probes run concurrently under a 3.5-second per-profile budget (one
  warm sample and two timed samples). Active leases/rules/timers never change.
- The separate fixed-site endpoint on 9441 permits only a random 15-second,
  three-request ticket. No client URL or site body is accepted/returned. Each
  node permits at most eight loopback-only diagnostic workers and 32 public
  connections with bounded headers/idle time. Workers are independent of the
  public lease pool and keep subscription identity/accounting. API limits apply
  per IP/bearer and stable device identity. The coordinated 0.4.5 rollout passed
  bounded owned-account checks on all five nodes. Peak diagnostic/lease capacity
  remains unverified; single-account timings are not that proof.
- The diagnostic responder is a separate nonroot service: TCP 9442, no upstream
  requests, empty nonce-only response, 64 application connections, bounded
  requests/headers/idle time, bounded per-IP token buckets, 64 MiB/20% CPU caps.
  TLS handshakes and hostile public traffic remain finite-capacity concerns, not
  a claim of DDoS resistance. No secret or traffic accounting is exposed there.
- The Cloudflare speed check keeps its bounded four-stream payload/time budget.
  Only completed results persist within the browser session. It measures the
  selected VPN route using Cloudflare, while location-list ping uses the fixed
  Google HTTPS site and includes responder overhead.
- Diagnostic export is constructed from a small allowlist and stays local. It
  excludes identities, credentials, custom domains and raw exception text.

PAC contains no credentials and performs no DNS lookups. Chromium strips HTTPS
paths supplied to PAC, so a narrow dedicated regional-host/9441 and /9442 port exception
is required. Port 9442 rejects credentials and cannot relay traffic. Port 9441
accepts only its scoped ticket and fixed-site check; both reject other paths,
bodies and CONNECT. Firefox additionally validates the
full nonce URL before returning DIRECT. Other protected requests fail closed.
