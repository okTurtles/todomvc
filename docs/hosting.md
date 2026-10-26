# Hosting the public demo

The demo runs on turtledock, like okTurtles's other services, and the same way
as Group Income: turtledock's `todomvc` image holds a pinned `chel` and a
pinned release of this repo, and runs `chel serve` behind turtledock's nginx.
The server builds nothing. Turtledock's `services/todomvc/README.md` has the
server side: the first-time setup, upgrades, nginx and the logs.

## How it fits together

- A release is one file on the GitHub release of its version,
  `todomvc-v<version>.tgz`, made by `scripts/dist.sh`: the built app
  (`dist/`), the signed contracts (`contracts/`) and `chelonia.json`.
- Turtledock pins the version and the file's sha256 in its
  `docker-compose.yml`, and checks the sha256 when it builds the image.
- chel runs with `NODE_ENV=production`, which turns the signup limits on.
  nginx sends the domain to the container, sets `X-Real-IP` and passes the
  websocket through. The container publishes no port, so nginx is the only way
  in. That matters: chel limits signups per address and takes the address
  from `X-Real-IP`, so anyone who could reach chel directly could send their
  own and get around the limits.
- All that the server keeps is turtledock's `./vol/todomvc`: the database and
  `chel.toml`. Every account is in it, so it must never be wiped. Turtledock's
  backups cover `./vol`, so they include it.

## The signing key

A browser trusts the first key it sees for each contract name, and after that
it refuses contracts signed by any other key. So every release must be signed
with the same key, `.keys/contract-signing-key.json`: with a new key, no new
contract version could reach the accounts made before. The key never goes on
the server. Keep a copy of it somewhere safe. `scripts/dist.sh` stops when the
key is missing, because the build would make a new one.

## Setting it up, once

1. Make the first release (below), and put its version and sha256 in
   turtledock's `docker-compose.yml`.
2. Point the domain at the server.
3. Follow the first-time setup in turtledock's `services/todomvc/README.md`.
   Its last step, `./cmd import todomvc <domain>`, writes the nginx config,
   gets the certificate and reloads nginx.

## Making a release

In the checkout that has the signing key:

1. Set the new `version` in `package.json`, then run `npm install` to update
   `package-lock.json`. Each change to a contract needs a new version: the
   build stops otherwise.
2. Commit, and tag the commit `v<version>`.
3. Run `./scripts/dist.sh`. It runs `npm ci` and the build, then prints the
   sha256 of `todomvc-v<version>.tgz`.
4. Make the GitHub release for the tag, with the file attached.
5. In turtledock, put the new version and the sha256 in the `todomvc` service
   of `docker-compose.yml`, then run `./cmd service rebuild todomvc` on the
   server. The page is down only while the container restarts, for a few
   seconds.

## On the page

- The login screen says it is a demo: accounts and todos may be reset, so
  don't use a real password.
- The "How it works" panel explains each step as people use the app. They can
  turn it off and get a plain TodoMVC.

## Starting over

On the server, from the turtledock folder: stop the service with
`./cmd service stop todomvc`, delete `chelonia.db` in `./vol/todomvc` with
`sudo` (and `chelonia.db-journal`, if there is one), then start it again with
`./cmd service start todomvc`. Keep `chel.toml`. Every account is gone after
that, which is what the note on the login screen warns about.
