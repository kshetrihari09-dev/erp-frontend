#!/bin/sh
# CC% sync tests (Product → Sale page / Purchase page). One-time setup (dev tools only, not added to package.json):
#   npm i --no-save esbuild jsdom @testing-library/react @testing-library/dom
# Usage: sh tests/run-cc-sync-tests.sh
set -e
cd "$(dirname "$0")/.."
OUT=${TMPDIR:-/tmp}
B="npx esbuild --bundle --platform=node --format=cjs --jsx=automatic --alias:react=./node_modules/react --alias:react-dom=./node_modules/react-dom --define:import.meta.env={} --define:process.env.NODE_ENV=\"test\" --log-level=error --loader:.css=empty --external:jsdom"
$B --alias:@/services/api=./tests/mock-api-cc-sync.ts --alias:@/components/forms/UnifiedProductInput=./tests/stub-unified-input-cc.tsx --alias:@/components/print/InvoiceTemplate=./tests/stub-print-cc.tsx --alias:@/components/print=./tests/stub-print-cc.tsx --alias:@/offline/OfflineProvider=./tests/stub-offline.tsx --alias:@=./src tests/ccSync.test.tsx --outfile=$OUT/ccsync.test.cjs
NODE_PATH="$PWD/node_modules" TZ=Asia/Kathmandu node --test --test-force-exit $OUT/ccsync.test.cjs 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E -A1 "^(not )?ok |^# (pass|fail)|^ +error: " | grep -vE "^--" | cut -c1-260
