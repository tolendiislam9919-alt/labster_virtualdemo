#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js қажет: https://nodejs.org/'
  exit 1
fi
exec node server.cjs
