#!/bin/sh
# Date Range tests. One-time setup (dev tools only, not added to package.json):
#   npm i --no-save jsdom @testing-library/react @testing-library/dom
# Usage: sh tests/run-daterange-tests.sh
set -e
cd "$(dirname "$0")/.."
OUT=${TMPDIR:-/tmp}
B="npx esbuild --bundle --platform=node --format=cjs --jsx=automatic --alias:react=./node_modules/react --alias:react-dom=./node_modules/react-dom --define:import.meta.env={} --define:process.env.NODE_ENV=\"test\" --log-level=error --loader:.css=empty --external:jsdom"
echo "== pure date logic (7 timezones)"
$B --alias:@=./src tests/dateRange.test.ts --outfile=$OUT/dr.test.cjs
for tz in UTC Asia/Kathmandu America/Los_Angeles Pacific/Auckland Pacific/Kiritimati Pacific/Pago_Pago Europe/London; do
  printf "  %-22s" "$tz"; TZ=$tz node --test --test-force-exit $OUT/dr.test.cjs 2>&1 | grep -E "^# (pass|fail)" | tr '\n' ' '; echo
done
echo "== popup component"
$B --alias:@=./src tests/dateRangePopup.test.tsx --outfile=$OUT/drc.test.cjs
TZ=Asia/Kathmandu node --test --test-force-exit $OUT/drc.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
echo "== Company vs Customer page (Set -> report refresh)"
$B --alias:@/services/api=./tests/mock-api.ts --alias:@=./src tests/companyCustomerPage.test.tsx --outfile=$OUT/ccp.test.cjs
TZ=Asia/Kathmandu node --test --test-force-exit $OUT/ccp.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
echo "== Ledger page (Set -> ledger refresh)"
$B --alias:@/services/api=./tests/mock-api-ledger.ts --alias:@=./src tests/ledgerPage.test.tsx --outfile=$OUT/ldg.test.cjs
TZ=Asia/Kathmandu node --test --test-force-exit $OUT/ldg.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
echo "== Reports page: Sales / Purchases / P&L (Set -> report refresh)"
$B --alias:@/services/api=./tests/mock-api-reports.ts --alias:@=./src tests/reportsPage.test.tsx --outfile=$OUT/rp.test.cjs
TZ=Asia/Kathmandu node --test --test-force-exit $OUT/rp.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
echo "== Customer vs Company page"
$B --alias:@/services/api=./tests/mock-api-cc.ts --alias:@=./src tests/customerCompanyPage.test.tsx --outfile=$OUT/cvc.test.cjs
TZ=Asia/Kathmandu node --test --test-force-exit $OUT/cvc.test.cjs 2>&1 | grep -E "^# (pass|fail)|^not ok"
