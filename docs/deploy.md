# Deploying pantsman to Linode

How to run the pantsman IRC bot and its HTTP API on a Linode (or any Linux
VPS). Written to be worked through top-to-bottom on a fresh box; a later
section covers security hardening, which is **not optional** here because
the API has no authentication.

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
- `apiPort` — `3000`

## Prerequisites on the server

1. **Node.js ≥ 22.9.** The npm scripts use `--env-file-if-exists`, which does
   not exist in older Node. Distro-packaged Node (`apt install nodejs`) is
   usually too old and fails with `bad option`. Install Node 22 via
   [NodeSource](https://github.com/nodesource/distributions) or nvm.
2. **Git**, to clone the repo.

## Files that do NOT come with `git clone`

Two files are deliberately kept out of git and must be copied to the server
by hand (e.g. `scp` from the machine that has them):

- **`.env`** — secrets, currently `RESTLESS_KEY` for the `@restlessai/sdk`
  request logging. Without it the SDK gets an undefined key.
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

## Security — do this before first start

The HTTP API has **no auth**. `POST /train` accepts arbitrary text into the
corpus, so anyone who can reach port 3000 can poison what the bot says.
Express binds to all interfaces by default, which on a VPS means the whole
internet. Pick one:

### Option A (simplest): firewall port 3000

With ufw:

```sh
ufw allow OpenSSH
ufw enable          # port 3000 stays closed by default
ufw status
```

Or use a Linode Cloud Firewall (Linode dashboard → Firewalls) allowing only
SSH inbound. Verify from an outside machine that
`curl http://<linode-ip>:3000/stats` times out.

### Option B: bind the API to localhost

In `api-server.js` (and the `api.listen` call in `pantsman.js` if present),
bind explicitly:

```js
api.listen(config.apiPort, '127.0.0.1', function() { ... });
```

Then only processes on the box (or SSH tunnels: `ssh -L 3000:localhost:3000`)
can reach it.

### Option C: the API should be public

Put nginx in front as a reverse proxy with TLS, add rate limiting, and gate
`POST /train` behind some form of auth (even a static bearer token checked in
middleware). Do not expose the bare Express server.

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
journalctl -u pantsman -n 20                  # joined channel, api listening
curl localhost:3000/stats                     # corpus stats from the box itself
curl localhost:3000/generate                  # {"text": "..."}
```

And from an **outside** machine, confirm port 3000 is NOT reachable (unless
you chose Option C).
