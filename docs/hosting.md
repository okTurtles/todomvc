# Hosting the public demo

What it takes to run TodoMVC where anyone can try it, and how the files in
`deploy/` fit together.

## What it needs

- A small Linux server with a disk that is kept between deploys. GitHub Pages
  can't do it: `chel serve` runs the API and the websocket as well as serving
  the page.
- Node 22.18 or newer, git, and [Caddy](https://caddyserver.com) (or another
  proxy that does the same things).
- A domain that points at the server.

## Setting it up, once

1. Clone the repo into `~/todomvc`, then `npm ci` and `npm run build`. The first
   build writes `chel.toml`, the contract signing key under `.keys/`, and
   `contracts/`.
2. In `chel.toml`, set `host = "127.0.0.1"` under `[server]`. chel takes a
   client's address from the `X-Real-IP` header when there is one, to limit
   signups per address, so chel must only be reachable through the proxy.
   Otherwise anyone could send their own header and get around the limits.
   This also keeps chel's dashboard (port 8888) off the internet; chel 3.4.1,
   which this repo uses, has no password on it.
3. Install `deploy/todomvc.service` as a user service, with the commands at
   the top of that file. It runs chel with `NODE_ENV=production`, which turns
   the signup limits on.
4. Put `deploy/Caddyfile` in `/etc/caddy/Caddyfile` with the real domain, and
   reload Caddy. It handles HTTPS, sets `X-Real-IP` and passes the websocket
   through.

## Deploys

After the checks pass on `main`, `.github/workflows/deploy.yml` connects to the
server over SSH and runs `deploy/deploy.sh` with the commit. The script checks
the commit out, builds it on the server and restarts the service. Building
there means the contract signing key never leaves the server.

It never touches `data/`, `contracts/`, `chelonia.json`, `chel.toml` or
`.keys/`, which are all gitignored. That matters: accounts keep using the
contract version they were made with, so wiping those breaks every account.
If a contract changed without a version bump, the build stops and the old
version keeps running.

The workflow does nothing until these are set under Settings → Secrets and
variables → Actions:

| secret | what goes in it |
| --- | --- |
| `DEMO_HOST` | the server's address |
| `DEMO_USER` | the user the demo runs as |
| `DEMO_SSH_KEY` | a private key that user accepts, best made just for this |
| `DEMO_KNOWN_HOSTS` | the output of `ssh-keyscan <server>`, so CI knows it is talking to the right server |

## On the page

- The login screen says it is a demo: accounts and todos may be reset, so
  don't use a real password.
- The "How it works" panel explains each step as people use the app. They can
  turn it off and get a plain TodoMVC.

## Starting over

Stop the service, delete `data/`, `contracts/` and `chelonia.json`, build, and
start it again. Every account is gone after that, which is what the note on
the login screen warns about. Keep `.keys/` and `chel.toml`, and back them up
with `data/` now and then.
