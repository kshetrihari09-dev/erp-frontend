#!/bin/sh
# 429 / request-hygiene tests. One-time setup (dev tools only, not added to package.json):
#   npm i --no-save jsdom @testing-library/react @testing-library/dom fake-indexeddb
# Usage: sh tests/run-rate-limit-tests.sh
set -e
cd "$(dirname "$0")/.."
OUT=./.test-out; mkdir -p $OUT
B="npx esbuild --bundle --platform=node --format=cjs --jsx=automatic --alias:react=./node_modules/react --alias:react-dom=./node_modules/react-dom --define:import.meta.env={} --define:process.env.NODE_ENV=\"test\" --log-level=error --loader:.css=empty --external:jsdom --alias:@=./src"
FAIL=0
for t in rateLimitState requestGuard queryRetry httpClient; do
  echo "== $t"
  $B tests/$t.test.ts --outfile=$OUT/$t.test.cjs
  node --test --test-force-exit $OUT/$t.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok" | tee /tmp/rl-$t.log
  grep -q "^# fail 0" /tmp/rl-$t.log || FAIL=1
done
exit $FAIL
