/**
 * Supervised Cloudflare quick tunnel. Run with `npm run tunnel`.
 *
 * WHY THIS EXISTS: a quick tunnel is ephemeral. It dies in two quite different
 * ways, and only one of them is noisy.
 *
 *   1. Cloudflare reaps the registration. The local process keeps running and
 *      keeps retrying, but the tunnel is gone for good and every retry logs
 *      "Unauthorized: Tunnel not found".
 *   2. The edge connection drops and never recovers. Nothing fatal is logged at
 *      all — cloudflared looks healthy, the hostname still resolves, and every
 *      request returns 530. This is the worse failure: the link looks alive and
 *      answers nothing.
 *
 * A log watcher alone only catches the first. So this supervisor also PROBES
 * the public URL end to end and restarts on sustained failure, which is the
 * only thing that detects the second.
 *
 * WHAT IT CANNOT DO: keep one hostname alive for ever. Quick tunnels are
 * disposable by design — no account, no domain — so a restart always mints a
 * new name and QR codes printed before it are dead. A named tunnel on a real
 * domain, or a deployment, is the fix for that. Everything here is about making
 * the current URL last as long as it possibly can and recover fast when it
 * cannot.
 *
 * The current URL is always in .tunnel-url at the repo root.
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Resolver } from "node:dns";
import https from "node:https";
import http from "node:http";
import path from "node:path";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env.local");
const URL_FILE = path.join(ROOT, ".tunnel-url");
const BIN = path.join(ROOT, "node_modules", "cloudflared", "bin", "cloudflared.exe");
const TARGET = process.env.TUNNEL_TARGET ?? "http://localhost:3000";

/** How often to prove the public URL still answers. Doubles as keep-alive. */
const PROBE_MS = 45_000;
/** Consecutive probe failures before the tunnel is declared dead. */
const FAILS_BEFORE_RESTART = 3;

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

const started = Date.now();
const since = (t) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};

/** Point APP_URL at the address the tunnel just handed us. */
function writeAppUrl(url) {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  text = /^APP_URL=.*$/m.test(text)
    ? text.replace(/^APP_URL=.*$/m, `APP_URL=${url}`)
    : `${text.trimEnd()}\nAPP_URL=${url}\n`;
  writeFileSync(ENV_FILE, text);
  writeFileSync(URL_FILE, `${url}\n`);
}

/* ------------------------------- the probe -------------------------------- */

/**
 * Resolve through a public resolver, not the machine's own.
 *
 * This network's DNS refuses to resolve *.trycloudflare.com at all — the
 * hostname works everywhere else but comes back NXDOMAIN here. A probe using
 * the system resolver would therefore fail for every healthy tunnel, decide it
 * was dead, and restart it in a loop, burning through hostnames. Resolving via
 * 1.1.1.1 asks the question the rest of the internet would ask.
 */
const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const publicLookup = (hostname, opts, cb) => {
  resolver.resolve4(hostname, (err, addrs) => {
    if (err || !addrs?.length) return cb(err ?? new Error("no A record"), null, 4);
    // Node calls this with `{ all: true }` and then REQUIRES an array of
    // { address, family } objects. Handing back a bare string there fails with
    // "Invalid IP address: undefined" — which looks exactly like a dead tunnel,
    // so the supervisor restarted perfectly healthy links in a loop and burned
    // through hostnames. Both shapes are answered properly now.
    if (opts?.all) return cb(null, addrs.map((address) => ({ address, family: 4 })));
    cb(null, addrs[0], 4);
  });
};

/** Any real HTTP answer means the tunnel is carrying traffic. */
function probe(target, { useLookup }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (!done) {
        done = true;
        resolve(ok);
      }
    };

    const u = new URL(target);
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: "/login",
        method: "GET",
        timeout: 20_000,
        ...(useLookup ? { lookup: publicLookup, servername: u.hostname } : {}),
        headers: { "user-agent": "rachna-tunnel-probe" },
      },
      (res) => {
        // 200/307/401 are all the app answering. 5xx from Cloudflare (502/530)
        // means the edge has no working connection to us.
        finish(res.statusCode !== undefined && res.statusCode < 500);
        res.resume();
      },
    );

    req.on("timeout", () => {
      req.destroy();
      finish(false);
    });
    req.on("error", () => finish(false));
    req.end();
  });
}

/* ------------------------------- supervisor ------------------------------- */

// Reaped-tunnel signatures. These are terminal: retrying never recovers them,
// so seeing one is the signal to tear the process down and start over.
const FATAL = [/Unauthorized: Tunnel not found/i, /Failed to create new quick Tunnel/i];

let attempt = 0;

function start() {
  attempt++;
  log(`starting tunnel → ${TARGET} (attempt ${attempt})`);

  const child = spawn(
    BIN,
    [
      "tunnel",
      "--url",
      TARGET,
      // http2 rather than the default QUIC: this network drops sustained UDP,
      // which showed up as repeated "failed to run the datagram handler".
      "--protocol",
      "http2",
      // IPv4 only. cloudflared prefers IPv6 for the edge connection, and on
      // this network those addresses time out — "dial tcp [2606:4700:...]:7844:
      // i/o timeout" — so the tunnel registers a hostname, reports READY, and
      // then serves 530 on every request because it never actually connected.
      "--edge-ip-version",
      "4",
      // Ten reconnection attempts instead of the default five. A quick tunnel
      // gets exactly ONE edge connection — `--ha-connections` is accepted but
      // does nothing here, measured: four requested, one registered, same as
      // without it — so that single connection recovering is the whole game.
      "--retries",
      "10",
      "--no-autoupdate",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let url = null;
  let restarting = false;
  let fails = 0;
  let timer = null;
  const bornAt = Date.now();

  const restart = (why) => {
    if (restarting) return;
    restarting = true;
    if (timer) clearInterval(timer);
    log(`tunnel lost after ${since(bornAt)} (${why}) — restarting`);
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    // Small pause so the old registration is fully released before asking for
    // another; hammering Cloudflare immediately just earns a rate limit.
    setTimeout(start, 3000);
  };

  /**
   * Prove the link works, and keep it warm.
   *
   * The origin is checked FIRST and separately. If the dev server is down, the
   * public URL will fail too — but that is not the tunnel's fault, and
   * restarting it would throw away a perfectly good hostname because Next was
   * recompiling. Only a tunnel that fails while the origin is healthy counts.
   */
  const checkHealth = async () => {
    if (restarting || !url) return;

    const originOk = await probe(TARGET, { useLookup: false });
    if (!originOk) {
      log("origin not answering — skipping tunnel check (app restarting?)");
      return;
    }

    const ok = await probe(url, { useLookup: true });
    if (ok) {
      if (fails > 0) log(`recovered after ${fails} failed probe(s)`);
      fails = 0;
      return;
    }

    fails++;
    log(`probe failed (${fails}/${FAILS_BEFORE_RESTART}) — ${url}`);
    if (fails >= FAILS_BEFORE_RESTART) restart("public URL stopped answering");
  };

  const onData = (buf) => {
    const text = buf.toString();

    if (!url) {
      // `api.trycloudflare.com` is cloudflared's OWN control endpoint and it
      // appears in its startup logs. Matching it set `url` to a host that is not
      // this tunnel, so every health probe failed and the supervisor restarted in
      // a loop — fifteen hostnames in eight minutes. Exclude it explicitly.
      const m = text.match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        url = m[0];
        writeAppUrl(url);
        log(`READY  ${url}`);
        log(`       APP_URL updated · also written to .tunnel-url`);
        // First check shortly after start, then on the regular beat. The early
        // one catches a tunnel that registers a name but never connects.
        setTimeout(checkHealth, 12_000);
        timer = setInterval(checkHealth, PROBE_MS);
      }
    }

    // cloudflared's own errors are surfaced rather than swallowed. Without
    // this the supervisor looked healthy while every request returned 530,
    // and there was nothing anywhere saying why.
    for (const line of text.split("\n")) {
      if (/\bERR\b|Unauthorized|refused|unreachable/i.test(line)) {
        log(`  cloudflared: ${line.trim().slice(0, 200)}`);
      }
    }

    if (FATAL.some((re) => re.test(text))) restart("reaped by Cloudflare");
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  child.on("exit", (code) => {
    if (!restarting) restart(`process exited with ${code}`);
  });
}

// An hourly note, so it is visible how long links are actually surviving
// rather than a matter of impression.
setInterval(() => log(`supervisor up ${since(started)} · ${attempt} tunnel(s) so far`), 3_600_000);

process.on("SIGINT", () => {
  log("stopping");
  process.exit(0);
});

start();
