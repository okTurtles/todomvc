#!/bin/sh
# Updates the demo to a commit and restarts it. CI runs this on the server over
# SSH once the checks pass on main, and it works the same by hand:
#
#   deploy/deploy.sh <commit>
#
# data/, contracts/, chelonia.json, chel.toml and .keys/ are all gitignored, so
# checking out another commit leaves them alone. They must never be wiped:
# accounts keep using the contract version they were made with.
set -eu
cd "$(dirname "$0")/.."

git fetch --quiet origin
git checkout --quiet --detach "${1:-origin/main}"
npm ci
# Built next to dist/ rather than into it: Vite empties its folder first, and
# the running server would answer 404 for the whole build. Stops here, with
# the old version still running, if a contract changed without a version bump.
npm run build -- --outDir dist-next
rm -rf dist.old
if [ -d dist ]; then mv dist dist.old; fi
mv dist-next dist
systemctl --user restart todomvc
rm -rf dist.old
