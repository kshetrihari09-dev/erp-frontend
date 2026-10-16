#!/bin/sh
# Notification polling tests. One-time setup (dev tools only, not added to package.json):
#   npm i --no-save jsdom @testing-library/react @testing-library/dom fake-indexeddb
# Usage: sh tests/run-notification-poller-tests.sh
set -e
cd "$(dirname "$0")/.."
# Output must live under the project so the bundled test can resolve jsdom from node_modules.
OUT=./.test-out; mkdir -p $OUT
B="npx esbuild --bundle --platform=node --format=cjs --jsx=automatic --alias:react=./node_modules/react --alias:react-dom=./node_modules/react-dom --define:import.meta.env={} --define:process.env.NODE_ENV=\"test\" --log-level=error --loader:.css=empty --external:jsdom"
echo "== polling loop + Retry-After (pure)"
$B tests/pollingLoop.test.ts --outfile=$OUT/pl.test.cjs
node --test --test-force-exit $OUT/pl.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
echo "== useReminderAlerts + singleton poller (React)"
$B --alias:@/services/api=./tests/mock-api-notifications.ts --alias:@=./src tests/reminderAlertPoller.test.tsx --outfile=$OUT/rap.test.cjs
node --test --test-force-exit $OUT/rap.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
echo "== offline catalog sync (no /stock/batches page loop; stops on 429)"
$B --alias:@/services/api=./tests/mock-api-catalog.ts --alias:@=./src tests/catalogSync.test.ts --outfile=$OUT/cs.test.cjs
node --test --test-force-exit $OUT/cs.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
