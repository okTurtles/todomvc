#!/bin/sh
# Makes the release file of the public demo, todomvc-v<version>.tgz: the built
# app (dist/), its signed contracts (contracts/) and chelonia.json. turtledock's
# todomvc image runs it with chel serve. See docs/hosting.md.

set -eu
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")

# A browser trusts only the first key it sees for each contract name, so every
# release must be signed with the same key. The build makes a new key when
# there is none, so stop before it can.
if [ ! -f .keys/contract-signing-key.json ]; then
  echo "No .keys/contract-signing-key.json. Put the demo's signing key there first (docs/hosting.md)." >&2
  exit 1
fi

npm ci
npm run build

# ustar, as Group Income's dist.sh does: it has no room for the extended
# attributes macOS puts on files (e.g. com.apple.provenance), so none go in.
# ._* files are copies of them.
find dist contracts chelonia.json -not -name '._*' -not -name .DS_Store \
  | cpio -H ustar -o | gzip -9 > "todomvc-v$VERSION.tgz"
sha256sum "todomvc-v$VERSION.tgz"
