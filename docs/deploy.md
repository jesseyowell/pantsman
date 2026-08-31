# Deploying pantsman to Linode

How to run the pantsman IRC bot and its HTTP API on a Linode (or any Linux
VPS). Written to be worked through top-to-bottom on a fresh box; a later
section covers security hardening. The API binds to localhost by default and
`POST /train` can be gated behind a bearer token, but read that section
before exposing anything.

## What runs

| command | entry point | what it does |
| ------- | ----------- | ------------ |
| `npm start` | `pantsman.js` | Full IRC bot (connects to IRC, also serves the HTTP API) |
| `npm run api` | `api-server.js` | HTTP API only, no IRC connection |

Both scripts pass `--env-file-if-exists=.env`, so environment variables load
automatically from `.env` in the repo root.

Config lives in `config/default.json`:

- `server` / `channels` / `botName` — IRC connection (`irc.esper.net`, `#selectbutton`)
- `replyChance` — probability the bot replies to a channel message
- `corpusFile` — `./corpus.json`, the Markov chain's learned data
- `apiPort` / `apiHost` — `3000` / `127.0.0.1`. The API is localhost-only
  unless you change `apiHost` (see Security below before you do)

## Prerequisites on the server

1. **Node.js ≥ 22.9.** The npm scripts use `--env-file-if-exists`, which does
   not exist in older Node. Distro-packaged Node (`apt install nodejs`) is
   usually too old and fails with `bad option`. Install Node 22 via
   [NodeSource](https://github.com/nodesource/distributions) or nvm.
2. **Git**, to clone the repo.

## Files that do NOT come with `git clone`

Two files are deliberately kept out of git and must be copied to the server
by hand (e.g. `scp` from the machine that has them):

- **`.env`** — secrets:
  - `RESTLESS_KEY` — for the `@restlessai/sdk` request logging. Without it
    the SDK gets an undefined key.
  - `API_TOKEN` (optional) — when set, `POST /train` requires
    `Authorization: Bearer <token>`. Unset means /train is open — fine for
    the localhost-only default, mandatory before exposing the API.
- **`corpus.json`** — the bot's learned corpus (runtime data, gitignored).
  Without it the bot starts with an empty brain and `/generate` returns 503
  until it learns from channel chatter or `/train` calls.

```sh
scp .env corpus.json user@your-linode:~/pantsman/
```

## Install

```sh
git clone https://github.com/jesseyowell/pantsman.git
cd pantsman
npm ci
# copy .env and corpus.json in (see above)
npm test          # sanity check before wiring up systemd
```

## Security

`POST /train` accepts arbitrary text into the corpus, so anyone who can
reach it can poison what the bot says. Two layers of defense are built in:

1. **Localhost bind (default).** `apiHost` in `config/default.json` is
   `127.0.0.1` (loopback — exists on every box, nothing Linode-specific to
   configure), so the API is unreachable from off the box out of the box.
   Only local processes or SSH tunnels (`ssh -L 3000:localhost:3000`) can
   reach it. Outbound connections (IRC) are unaffected by the bind.
2. **Bearer token on `/train` (opt-in).** Set `API_TOKEN=<long random
   string>` in `.env` (`openssl rand -hex 32` is fine) and `POST /train`
   returns 401 without `Authorization: Bearer <token>`. The read-only
   routes (`/generate`, `/stats`) stay open.

### Firewall anyway (defense in depth)

Even with the localhost bind, close everything but SSH so a future config
change can't silently expose the port. ufw and Linode Cloud Firewall don't
conflict — use either or both (Cloud Firewall filters before traffic
reaches the VM; ufw filters on the box).

With ufw — allow SSH **before** enabling, and keep your current session
open until a fresh connection is verified:

```sh
sudo apt install ufw            # Debian minimal images don't ship it
sudo ufw default deny incoming
sudo ufw default allow outgoing # IRC (outbound 6667/6697) keeps working
sudo ufw allow OpenSSH          # BEFORE enable, or you cut yourself off
sudo ufw enable
sudo ufw status verbose
```

Then from a **second** terminal confirm SSH still works before closing the
first. `ufw enable` covers IPv6 automatically.

With Linode Cloud Firewall: Cloud Manager → Firewalls → Create Firewall →
assign the Linode → default inbound policy **Drop**, outbound **Accept** →
inbound rules:

| rule | protocol | ports | sources |
| ---- | -------- | ----- | ------- |
| SSH | TCP | 22 | `0.0.0.0/0` and `::/0` |
| mosh (if you use it) | UDP | 60000-61000 | `0.0.0.0/0` and `::/0` |

Gotchas:

- Rules do **not** apply until you click **Save Changes** at the bottom of
  the Rules tab — added rules sit pending (yellow banner) until then. With
  default-Drop and the SSH rule unsaved, you've blocked everything.
- mosh handshakes over TCP 22 but runs its session over UDP; without the
  UDP rule, `mosh` hangs and *existing* mosh sessions freeze silently.
- Restricting the SSH source to your own IP is tighter, but a rotated home
  IP then means fixing it via Lish.

Verify from an outside machine that `ssh` still works and
`curl -m 5 http://<linode-ip>:3000/stats` times out.

### Linode-specific notes

- **Fresh Linodes have no firewall at all.** Unlike AWS security groups
  (default-closed), every port a process listens on is internet-reachable
  the moment the Linode boots. The localhost bind is the only thing
  protecting the API between first `npm start` and firewall setup — do the
  firewall step early anyway.
- **The optional "private" IPv4 (192.168.x) is not private.** It's a shared
  LAN with other Linode customers in the same datacenter. Never set
  `apiHost` to it thinking it's internal-only; Linode VLANs are the
  actually-private option.
- **IPv6 is enabled by default** and the Linode gets a public v6 address.
  `ufw enable` covers v6 automatically, but Linode Cloud Firewall rules
  must be written to cover both v4 and v6 — an allow-SSH-only v4 ruleset
  with v6 unrestricted is a common hole.
- **Locked out by the firewall?** The Lish console (Linode dashboard →
  Launch LISH Console) is out-of-band shell access that doesn't go through
  SSH or the network rules.
- **Lost the root password?** Cloud Manager → the Linode → Settings →
  Reset Root Password (requires powering the Linode off first). Note the
  Cloud Firewall needs no shell access at all, and `sudo` asks for your
  own user's password, not root's — so a lost root password blocks less
  than it seems. Once back in as root, `usermod -aG sudo <user>` so you
  don't need root again.

### If the API should be public

Do **all** of the following, not just one:

1. Set `API_TOKEN` in `.env` — never expose an open `/train`.
2. Keep `apiHost` at `127.0.0.1` and put nginx in front as a reverse proxy
   with TLS and rate limiting. Do not expose the bare Express server; don't
   set `apiHost` to `0.0.0.0` — let nginx be the only thing listening
   publicly.
3. Open only 80/443 in the firewall.

Also standard VPS hygiene: disable SSH password auth (keys only), keep
`unattended-upgrades` on, and don't run the bot as root — a dedicated user or
your login user is fine.

## Run it with systemd

Running `npm start` in an SSH session dies when the session drops. Use a
systemd unit instead. `/etc/systemd/system/pantsman.service`:

```ini
[Unit]
Description=pantsman IRC bot
After=network-online.target
Wants=network-online.target

[Service]
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/pantsman
ExecStart=/usr/bin/node --env-file-if-exists=.env pantsman.js
Restart=on-failure
RestartSec=10

# cheap sandboxing — none of these interfere with writing corpus.json
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Notes:

- **`WorkingDirectory` is load-bearing.** Both the `config` package and the
  `./corpus.json` path resolve relative to the cwd; the process must start
  from the repo root.
- Check `which node` — nvm installs put node somewhere like
  `~/.nvm/versions/node/v22.x.x/bin/node`, not `/usr/bin/node`. Use the real
  path in `ExecStart`.
- systemd stops the service with SIGTERM, which the code handles by saving
  the corpus before exiting. Don't change `KillSignal`.
- `Restart=on-failure` also acts as the IRC reconnect: if the server drops
  the connection and the process exits, systemd restarts it. If the `irc`
  library ever hangs silently instead of exiting, systemd won't notice —
  watch for that the first week.

Enable and watch:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now pantsman
journalctl -u pantsman -f      # stdout logging (incoming msgs, bot replies) lands here
```

For the API-only service, duplicate the unit with
`ExecStart=... api-server.js` and a different name.

## Back up corpus.json

The corpus is the one thing that is neither in git nor recreatable, and a
hard crash (OOM, kill -9) skips the save-on-shutdown path. A daily cron copy
is cheap insurance:

```sh
crontab -e
# daily at 04:00, keep dated copies
0 4 * * * cp ~/pantsman/corpus.json ~/backups/corpus-$(date +\%F).json
```

Prune old copies occasionally, or add
`find ~/backups -name 'corpus-*.json' -mtime +30 -delete` as a second job.

## Deploying updates

Develop locally, commit, push, then on the Linode:

```sh
cd ~/pantsman
git pull
npm ci                      # only needed if package.json changed
sudo systemctl restart pantsman
```

Remember the corpus only saves on clean shutdown — `systemctl restart` (SIGTERM)
is clean; `kill -9` is not.

## Quick verification after deploy

```sh
systemctl status pantsman                     # active (running)
journalctl -u pantsman -n 20                  # joined channel, api listening on 127.0.0.1
curl localhost:3000/stats                     # corpus stats from the box itself
curl localhost:3000/generate                  # {"text": "..."}
```

(The bind is v4 loopback only; `localhost` may resolve to `::1` first. curl
falls back on its own, but if a local connection ever inexplicably fails,
try `curl 127.0.0.1:3000` before assuming the service is down.)

If you set `API_TOKEN`, confirm the gate works from the box:

```sh
curl -i -X POST localhost:3000/train \
  -H 'Content-Type: application/json' -d '{"text":"test"}'   # 401
curl -i -X POST localhost:3000/train \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' -d '{"text":"test"}'   # 204
```

And from an **outside** machine, confirm port 3000 is NOT reachable.
