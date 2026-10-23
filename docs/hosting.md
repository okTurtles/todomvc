# Hosting the public demo

The demo runs on turtledock, like okTurtles's other services: chel in a
Docker container, behind turtledock's nginx. Turtledock has the `todomvc`
service, its nginx config and the `./cmd import todomvc` command. This repo
has the script that builds a version on the server, `deploy/deploy.sh`, and
the workflow that deploys after the checks pass on `main`.

## How it fits together

- The `todomvc` container clones this repo into `./vol/todomvc` on the server
  the first time it starts, builds it with `deploy/deploy.sh`, and runs
  `chel serve` with `NODE_ENV=production`, which turns the signup limits on.
- nginx sends the domain to the container, sets `X-Real-IP` and passes the
  websocket through. The container publishes no port, so nginx is the only way
  in. That matters: chel limits signups per address and takes the address
  from `X-Real-IP`, so anyone who could reach chel directly could send their
  own and get around the limits.
- What the server keeps is in the checkout and gitignored: `data/`,
  `contracts/`, `chelonia.json`, `chel.toml` and the contract signing key in
  `.keys/`. A new checkout leaves them alone, and they must never be wiped:
  accounts keep using the contract version they were made with, so losing any
  of them breaks every account. Turtledock's backups cover `./vol`, so they
  include all of it.

## Setting it up, once

This needs the turtledock change that adds the `todomvc` service, and this
repo's `main` to have `deploy/deploy.sh`, since the first start runs it. On
the server, from the turtledock folder:

1. Point the domain at the server.
2. `./cmd service start todomvc`. The first start builds the image, then clones
   and builds the demo, which takes a few minutes. `./cmd logs` shows
   `[todomvc] serving <commit>` once it's up.
3. `./cmd import todomvc <domain>`. This writes the nginx config, gets the
   certificate and reloads nginx.

## Deploys

After the checks pass on `main`, `.github/workflows/deploy.yml` connects to the
server over SSH. From the turtledock folder, it runs `deploy/deploy.sh` with
the commit inside the `todomvc` container, then
`./cmd service restart todomvc`.

The script checks the commit out and builds it into `dist-next/`, next to the
running version, then swaps it in, so the page stays up while it builds. The
restart then loads it, and only that takes the page down, for a few seconds.
Building on the server means the contract signing key never leaves it. If
anything fails, for example a contract that changed without a version bump,
nothing is swapped, the checkout goes back to the running version, and that
version keeps running.

The workflow does nothing until these are set under Settings → Secrets and
variables → Actions:

| secret | what goes in it |
| --- | --- |
| `DEMO_HOST` | the server's address |
| `DEMO_USER` | the user turtledock runs as, `docker` on a server set up with its installer |
| `DEMO_SSH_KEY` | a private key that user accepts. It can run any Docker command there, so make one just for this |
| `DEMO_KNOWN_HOSTS` | the output of `ssh-keyscan <server>`, so CI knows it is talking to the right server |

It expects turtledock in `~/docker/turtledock` with `ENV=production`, which is
what turtledock's installer sets up. If the server is different, change
`TURTLEDOCK_DIR` and `TURTLEDOCK_ENV` in the workflow.

To deploy by hand, from the turtledock folder on the server:

```sh
./cmd compose exec todomvc runuser -u unpriv -- deploy/deploy.sh <commit>
./cmd service restart todomvc
```

## On the page

- The login screen says it is a demo: accounts and todos may be reset, so
  don't use a real password.
- The "How it works" panel explains each step as people use the app. They can
  turn it off and get a plain TodoMVC.

## Starting over

Stop the service with `./cmd service stop todomvc`. In `./vol/todomvc`, delete
`data/`, `contracts/`, `chelonia.json` and `dist/`. On a server those files
belong to the container's user, so this needs `sudo`. Then
`./cmd service start todomvc` builds it again. Every account is gone after
that, which is what the note on the login screen warns about. Keep `.keys/`
and `chel.toml`.
