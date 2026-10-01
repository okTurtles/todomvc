# Working on this repo

## Layout

```
src/contracts/identity.js   the account contract. chel signs it, Chelonia
                            evaluates it in a sandbox, it is not bundled
src/contracts/list.js       one todo list, with the rename action
src/chelonia/config.ts      chelonia/configure and chelonia/connect
src/chelonia/state.ts       the reactive root state, and saving it
src/chelonia/auth.ts        signup, login, logout, restore
src/chelonia/lists.ts       creating a list, inviting, joining
src/chelonia/lists-model.ts the lists schema and its one reducer, both pure
src/chelonia/todos.ts       the todos slot and the six writes
src/chelonia/todos-model.ts the schema and the reducers, both pure
src/chelonia/offline.ts     the queue for writes made while the server is away
src/types.ts                the shapes the app passes around
src/components/             Vue, and nothing else
scripts/build-contracts.ts  chel manifest -> chel pin -> manifest CID
scripts/chel.ts             runs chel from node_modules
docs/data.md                the todos slot and the writes, with code
docs/login.md               signup and login, step by step
docs/sharing.md             how sharing works, message by message
```

The app is TypeScript, checked with `npm run typecheck`. The two files under
`src/contracts/` stay JavaScript on purpose: chel signs the file as it is and
Chelonia evaluates that same text in a sandbox, so there is no build step that
could strip types out first.

Everything Chelonia touches is under `src/chelonia/`. The components import a
few functions from it and know nothing about etags, subscriptions or conflicts.
Nothing under `src/chelonia/` depends on Vue except the state object.

## Scripts

| command | what it does |
| --- | --- |
| `npm run contracts` | signs, versions and pins the contracts, writes their manifest CIDs for the app |
| `npm run build` | the above, plus the Vite build into `dist/` |
| `npm run serve` | `chel serve --dev dist`, which uploads `contracts/` and serves the app |
| `npm start` | build, then serve |
| `npm run dev` | rebuilds on change; run `npm run serve` in another shell |
| `npm run lint` | eslint |
| `npm test` | unit tests for the slot schemas and the reducers |
| `npm run test:e2e` | Playwright against a real server on its own port and database |
| `npm run test:all` | both |

The first `npm run contracts` writes two files that are not committed: a
contract signing key under `.keys/`, and `chel.toml`, chel's own config (port,
database backend, and a `server_id` the server refuses to start without).
`chel init` generates it with the in-memory backend, which loses every account
on restart, so the script switches it to sqlite under `data/`.

Ctrl+C stops `npm run serve` and everything under it. In a script, killing only
the `scripts/chel.ts` process by name leaves the server it spawned running, so
signal the process group or use the port: `lsof -ti:8000 | xargs kill`.

After a full rebuild, restart `npm run serve`. Vite empties `dist/` and a
server that was already running answers 404 until it is restarted.

Chelonia runs as a lightweight client, which is `@chelonia/lib`'s default since
2.0.0, the same as Group Income: the browser keeps no message log, and Chelonia
reads each contract's HEAD from the saved state.

The contract version comes from `version` in `package.json`. Editing a contract
without bumping it makes the build stop, since the app would then be built
against a manifest the accounts already on the server do not have.

## Workarounds waiting on an upstream release

Each one is fenced in the source with `TODO: BEGIN REMOVEME (issue)` and
`TODO: END REMOVEME (issue)`, so `grep REMOVEME` finds them all.

- `src/chelonia/auth.ts`, `USERNAME_REGEX`: a copy of chel's private
  `NAME_REGEX`. Goes once chel exports the rule.
- `src/chelonia/auth.ts`, the key list in `signup`: gets shorter once
  [libcheloniajs#91](https://github.com/okTurtles/libcheloniajs/issues/91)
  lands. Not a removal, so it is a plain TODO.

## Accounts made by earlier versions

Two changes left older accounts behind: todos moved from a slot on the identity
contract into lists, and in 0.3.0 the identity contract stopped borrowing Group
Income's name, `gi.contracts/identity`, for its own, `todomvc/identity`. An
account made before either one still logs in, but its lists and todos do not
appear. There is no migration, since nothing has shipped. To start fresh,
delete `data/`, `contracts/` and `chelonia.json`.
