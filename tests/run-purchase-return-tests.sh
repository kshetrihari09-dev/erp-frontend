#!/bin/sh
# Purchase Return page tests. One-time setup (dev tools only, not added to package.json):
#   npm i --no-save esbuild jsdom @testing-library/react @testing-library/dom
# Usage: sh tests/run-purchase-return-tests.sh
set -e
cd "$(dirname "$0")/.."
OUT=${TMPDIR:-/tmp}
B="npx esbuild --bundle --platform=node --format=cjs --jsx=automatic --alias:react=./node_modules/react --alias:react-dom=./node_modules/react-dom --define:import.meta.env={} --define:process.env.NODE_ENV=\"test\" --log-level=error --loader:.css=empty --external:jsdom"
$B --alias:@/services/api=./tests/mock-api-purchase-return.ts --alias:@/components/forms/UnifiedProductInput=./tests/stub-unified-input.tsx --alias:@/components/print=./tests/stub-print.tsx --alias:@/offline/OfflineProvider=./tests/stub-offline.tsx --alias:@=./src tests/purchaseReturnPage.test.tsx --outfile=$OUT/prp.test.cjs
NODE_PATH="$PWD/node_modules" TZ=Asia/Kathmandu node --test --test-force-exit $OUT/prp.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok|^ok|Error|expected|actual|message" | head -60
