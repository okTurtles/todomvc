#!/bin/sh
# Builds the demo at a commit, in place, inside the todomvc container on a
# turtledock server (see docs/hosting.md). The container runs it on its first
# start, and CI runs it for every deploy, then restarts the service. By hand,
# from the turtledock folder on the server:
#
#   ./cmd compose exec todomvc runuser -u unpriv -- deploy/deploy.sh <commit>
#   ./cmd service restart todomvc
#
# data/, contracts/, chelonia.json, chel.toml and .keys/ are all gitignored, so
# checking out another commit leaves them alone. They must never be wiped:
# accounts keep using the contract version they were made with.
set -eu
cd "$(dirname "$0")/.."

# If anything below fails, go back to the version that is running, so a restart
# before the next deploy still starts that version, not half of the new one
running=$(git rev-parse HEAD)
go_back () {
  status=$?
  if [ "$status" -ne 0 ] && [ "$(git rev-parse HEAD)" != "$running" ]; then
    echo "Deploy failed, going back to $running"
    git checkout --quiet --detach "$running" && npm ci --include=dev
  fi
  exit "$status"
}
trap go_back EXIT

git fetch --quiet origin
git checkout --quiet --detach "${1:-origin/main}"
# The container runs with NODE_ENV=production, where npm leaves out the
# devDependencies, and chel and Vite are among them
npm ci --include=dev
# Built next to dist/ rather than into it: Vite empties its folder first, and
# the running server would answer 404 for the whole build. Stops here, with
# the old version still running, if a contract changed without a version bump.
npm run build -- --outDir dist-next
rm -rf dist.old
if [ -d dist ]; then mv dist dist.old; fi
mv dist-next dist
rm -rf dist.old
