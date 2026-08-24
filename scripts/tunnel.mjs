/**
 * Supervised Cloudflare quick tunnel. Run with `npm run tunnel`.
 *
 * WHY THIS EXISTS: a quick tunnel is ephemeral and Cloudflare reaps it without
 * warning. When that happens the local process keeps running and keeps
 * retrying, but the registration is gone for good, so every retry fails with
 *
 *     Register tunnel error from server side error="Unauthorized: Tunnel not found"
 *
 * and the URL is dead until someone notices. The naive `cloudflared tunnel
 * --url ...` in package.json therefore fails silently and permanently — the
 * demo link stops working and nothing says so.
 *
 * This wrapper watches for that state and restarts the tunnel, which is the
 * only thing that recovers it. A restart necessarily produces a NEW hostname,
 * so it also rewrites APP_URL in .env.local — `publicAppUrl()` reads that at
 * request time, so newly issued QR codes pick the new address up without a
 * rebuild and without restarting Next.
 *
 * WHAT IT CANNOT DO: keep a hostname alive across a reap. QR codes printed
 * before a restart point at the old address and will be dead. A named tunnel on
 * a real domain is the fix for that, and is what a pilot should use; this is
 * for development and demos.
 *
 * The current URL is always in .tunnel-url at the repo root.
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env.local");
const URL_FILE = path.join(ROOT, ".tunnel-url");
const BIN = path.join(ROOT, "node_modules", "cloudflared", "bin", "cloudflared.exe");
const TARGET = process.env.TUNNEL_TARGET ?? "http://localhost:3000";

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

/** Point APP_URL at the address the tunnel just handed us. */
function writeAppUrl(url) {
  let text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  text = /^APP_URL=.*$/m.test(text)
    ? text.replace(/^APP_URL=.*$/m, `APP_URL=${url}`)
    : `${text.trimEnd()}\nAPP_URL=${url}\n`;
  writeFileSync(ENV_FILE, text);
  writeFileSync(URL_FILE, `${url}\n`);
}

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
      // A tunnel that looks up but answers nothing is the worst failure mode
      // available, so the address family is pinned rather than negotiated.
      "--edge-ip-version",
      "4",
      "--no-autoupdate",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let url = null;
  let restarting = false;

  const restart = (why) => {
    if (restarting) return;
    restarting = true;
    log(`tunnel lost (${why}) — restarting`);
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    // Small pause so the old registration is fully released before asking for
    // another; hammering Cloudflare immediately just earns a rate limit.
    setTimeout(start, 3000);
  };

  const onData = (buf) => {
    const text = buf.toString();

    if (!url) {
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) {
        url = m[0];
        writeAppUrl(url);
        log(`READY  ${url}`);
        log(`       APP_URL updated · also written to .tunnel-url`);
      }
    }

    // cloudflared's own errors are surfaced rather than swallowed. Without
    // this the supervisor looked healthy while every request returned 530,
    // and there was nothing anywhere saying why.
    for (const line of text.split("\n")) {
      if (/\bERR\b|\bWRN\b|Unauthorized|refused|unreachable/i.test(line)) {
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

process.on("SIGINT", () => {
  log("stopping");
  process.exit(0);
});

start();
