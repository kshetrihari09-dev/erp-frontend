# Voucher Posting Engine — Architecture & Developer Guide

## Overview

Every financial transaction in this ERP system flows through a single,
centralized accounting pipeline:

```
Operational Save
  └── AccountingIntegration
        ├── VoucherBuilder       → build balanced voucher + lines
        ├── VoucherService       → persist voucher + voucher_lines
        └── PostingEngine        → validate → journal_entry → journal_lines
              └── voucher_postings  (cross-reference audit table)
```

No route, service, or background job creates `journal_entries` directly.
PostingEngine is the **single source of truth** for all accounting postings.

---

## Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│  Operational Layer (Sales / Purchase / Receive / Returns / Banking)    │
│                                                                        │
│  POST /sales   POST /purchases   POST /receives   POST /returns/*      │
└────────────────────────┬───────────────────────────────────────────────┘
                         │  same database transaction (trx)
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│  AccountingIntegration  (src/services/accountingIntegration.js)        │
│                                                                        │
│  • Idempotency check  → voucher_postings table                         │
│  • Calls VoucherBuilder to build payload                               │
│  • Calls VoucherService.createInTransaction()                          │
│  • Calls PostingEngine.postInTransaction()                             │
│  • Links source record's voucher_id FK                                 │
│  • Inserts voucher_postings cross-reference                            │
│  • On 422 (COA not configured): warns, saves without journal           │
│  • On other error: re-throws → transaction rolls back atomically       │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌─────────────────────┐     ┌──────────────────────────────────────────┐
│   VoucherBuilder    │     │   VoucherService.createInTransaction()   │
│  (voucherBuilder.js)│     │      (voucherService.js)                 │
│                     │     │                                          │
│  resolveAccount()   │     │  • Balance check (DR == CR)              │
│  → account_defaults │     │  • Period lock guard                     │
│  → sub_type fallback│     │  • Auto-assign period_id                 │
│                     │     │  • next_voucher_number() SQL function     │
│  buildSaleVoucher() │     │  • INSERT vouchers                       │
│  buildPurchVoucher()│     │  • INSERT voucher_lines (per line)       │
│  buildReceiveVch()  │     │  • Audit log entry                       │
│  buildReturnVch()   │     └────────────────────┬─────────────────────┘
│  buildPaymentVch()  │                           │
│  buildReceiptVch()  │                           ▼
└─────────────────────┘     ┌──────────────────────────────────────────┐
                            │   PostingEngine.postInTransaction()       │
                            │      (postingEngine.js)                   │
                            │                                          │
                            │  1. Load voucher — check status          │
                            │  2. Period lock guard                     │
                            │  3. Load voucher_lines                   │
                            │  4. Balance validation (DR == CR ±0.005) │
                            │  5. Account validation (active, leaf)    │
                            │  6. PostingStrategy.execute()            │
                            │  7. Hash chain (prev_hash → entry_hash)  │
                            │  8. INSERT journal_entries               │
                            │  9. INSERT journal_lines (one per vline) │
                            │ 10. UPDATE vouchers SET status='POSTED'  │
                            │ 11. Audit log entry                      │
                            └────────────────────┬─────────────────────┘
                                                 │
                                                 ▼
                            ┌──────────────────────────────────────────┐
                            │   PostingStrategies  (postingStrategies) │
                            │                                          │
                            │  SalesStrategy      — FIFO stock deduct  │
                            │  PurchaseStrategy   — inventory batch in │
                            │  PaymentStrategy    — simple pass-thru   │
                            │  ReceiptStrategy    — simple pass-thru   │
                            │  JournalStrategy    — simple pass-thru   │
                            │  ReversalStrategy   — negate all lines   │
                            └──────────────────────────────────────────┘
```

---

## Database Schema Changes (Migration 009)

### New Tables

#### `voucher_postings`
Cross-reference between every operational record and its voucher.
One row per transaction save. Used for idempotency and audit trail.

```sql
voucher_postings
  id          UUID PK
  company_id  UUID → companies
  voucher_id  UUID → vouchers
  source_type VARCHAR(50)   -- 'SALE','PURCHASE','RECEIVE','SALE_RETURN',...
  source_ref  VARCHAR(100)  -- invoice_no / bill_no (human-readable)
  sale_id     UUID → sales       (nullable)
  purchase_id UUID → purchases   (nullable)
  receive_id  UUID → receives    (nullable)
  posted_at   TIMESTAMP
```

#### `account_defaults`
Configurable mapping from accounting roles to specific ledger accounts.
One row per role per company. Drives `resolveAccount()` in VoucherBuilder.

```sql
account_defaults
  id          UUID PK
  company_id  UUID → companies
  account_id  UUID → accounts
  role        VARCHAR(60)   -- 'accounts_receivable','sales_revenue',...
  description TEXT
  is_active   BOOLEAN DEFAULT true
  UNIQUE (company_id, role)
```

### Modified Tables

| Table | Change |
|---|---|
| `sales` | `voucher_id` FK → vouchers (guard — may already exist from migration 002) |
| `purchases` | `voucher_id` FK → vouchers (guard) |
| `receives` | `voucher_id` FK → vouchers (new) |

---

## Account Default Roles

Configure these per company via `POST /accounting/account-defaults`
or run `node scripts/seed_account_defaults.js <company_id>`.

| Role | Used For | Required |
|---|---|---|
| `accounts_receivable` | DR side of credit sales | ✅ |
| `accounts_payable` | CR side of credit purchases | ✅ |
| `sales_revenue` | CR side of all sales | ✅ |
| `inventory` | DR side of purchases; CR on sale-COGS | ✅ |
| `cash` | Cash sales / payments | ✅ |
| `bank` | Bank / UPI / card transactions | ✅ |
| `tax_payable` | CR output VAT on sales | ✅ |
| `tax_input` | DR input VAT on purchases | ✅ |
| `cogs` | DR cost on each sale (FIFO) | Optional |
| `purchase_expense` | DR on non-inventory purchases | Optional |
| `discount_given` | DR discount expense | Optional |
| `discount_received` | CR discount income | Optional |

Until all 8 required roles are configured, transactions save successfully
but skip journal entry creation (backward-compatible).

---

## New API Endpoints

### Account Defaults
```
GET    /accounting/account-defaults          → list all mappings
POST   /accounting/account-defaults          → set/update a mapping
         body: { role, account_id, description? }
DELETE /accounting/account-defaults/:role    → remove a mapping
```

### Voucher Postings (Audit)
```
GET    /accounting/voucher-postings          → paginated cross-reference list
         query: source_type, sale_id, purchase_id, page, limit
GET    /accounting/posting-status/:type/:id → posting status for any record
         → { posted, voucher_no, voucher_status, journal_entry_id, total_debit }
```

---

## New Frontend Components

### `AccountDefaultsTab` (Accounting → Engine Setup)
- Lists all 12 roles with mapped account or "Not set"
- Green banner when all required roles configured, amber with missing list otherwise
- "Assign" button opens search modal for any account in the COA
- Shows setup guide and seed script hint until fully configured

### `VoucherPostingsTab` (Accounting → Posting Audit)
- Filterable by source_type
- Every row: date, source, reference, voucher_no, status, amount, JE id
- Proves every transaction has gone through PostingEngine

### `PostingStatusBadge`
- Compact mode (table rows): green pill with voucher_no, or amber "Pending"
- Full mode (detail drawers): card with voucher_no, JE id, amount, hash
- Used in `SalesPage` and `PurchasePage` tables

---

## New Files

### Backend
| File | Purpose |
|---|---|
| `migrations/009_voucher_posting_engine.js` | Schema additions |
| `src/services/voucherBuilder.js` | Builds balanced voucher payloads from raw transactions |
| `src/services/accountingIntegration.js` | Bridge: ops modules → PostingEngine |
| `scripts/seed_account_defaults.js` | One-time COA role setup per company |

### Modified Backend
| File | Change |
|---|---|
| `src/engines/postingEngine.js` | Added `postInTransaction()` — runs inside caller's trx |
| `src/engines/postingStrategies.js` | PurchaseStrategy: conditional batch creation via metadata flag |
| `src/services/voucherService.js` | Added `createInTransaction()` — caller-owned trx |
| `src/routes/sales.js` | Replaced dead accounting stub with `AccountingIntegration.postSale()` |
| `src/routes/purchases.js` | Added `AccountingIntegration.postPurchase()` |
| `src/routes/receives.js` | Added `AccountingIntegration.postReceive()` |
| `src/routes/returns.js` | Fully rewritten with `AccountingIntegration.postSaleReturn/purchaseReturn()` |
| `src/routes/accounting.js` | Added account_defaults + voucher_postings + posting-status endpoints |

### Frontend
| File | Purpose |
|---|---|
| `src/components/PostingStatusBadge.tsx` | Inline/full posting status display |
| `src/modules/accounting/tabs/AccountDefaultsTab.tsx` | COA role mapping UI |
| `src/modules/accounting/tabs/VoucherPostingsTab.tsx` | Posting audit trail |
| `src/modules/accounting/AccountingPage.tsx` | Added 2 new tabs |
| `src/modules/sales/SalesPage.tsx` | Added "Posted" column |
| `src/modules/purchases/PurchasePage.tsx` | Added "Posted" column |

### Tests
| File | Coverage |
|---|---|
| `tests/posting-engine.test.js` | 25 unit tests — PostingEngine, VoucherBuilder, AccountingIntegration |

---

## Transaction Atomicity

Every route that saves an operational record uses a single database
transaction that wraps both the operational INSERT and the accounting
pipeline. If either side fails, everything rolls back:

```javascript
const trx = await db.transaction()
try {
  // 1. Insert sale record
  const [sale] = await trx('sales').insert({...}).returning('*')
  // 2. Insert sale_items
  // 3. FIFO deduction
  // 4. Accounting — same trx, atomic
  await AccountingIntegration.postSale({ sale, items, trx, ... })
  // Commit everything in one shot
  await trx.commit()
} catch (err) {
  await trx.rollback()  // ← sale, items, voucher, journal all rolled back
  next(err)
}
```

---

## Safeguards

| Guard | Location | Behavior |
|---|---|---|
| Already-posted voucher | `postInTransaction()` | Throws 409 "already posted" |
| Unbalanced voucher | `createInTransaction()` + `postInTransaction()` | Throws 400 |
| Group account posting | `postInTransaction()` | Throws 400 |
| Inactive account | `postInTransaction()` | Throws 400 |
| Locked period | `postInTransaction()` | Throws 400 |
| Duplicate posting | `voucher_postings` idempotency check | Returns existing posting |
| Missing COA | `resolveAccount()` | Throws 422 → route warns, saves without JE |
| Hash chain tamper | `journal_entries.entry_hash` | SHA-256 of each entry + prev_hash |
| DB failure | `trx.rollback()` in every route | No orphaned records |

---

## Adding a New Module (e.g. Payroll)

1. Add `AccountingIntegration` to the route:

```javascript
const AccountingIntegration = require('../services/accountingIntegration')

// In your POST handler, after inserting the payroll record:
await AccountingIntegration.postPayment({
  partyId:     employee.party_id,
  amount:      payslip.net_pay,
  paymentMode: 'bank',
  paymentDate: payslip.pay_date,
  narration:   `Salary: ${employee.name} — ${payslip.period}`,
  referenceNo: payslip.payslip_no,
  trx,
  companyId:   req.companyId,
  userId:      req.user.id,
  ipAddress:   req.ip,
})
```

2. Add any new voucher type to `VoucherBuilder` if needed (e.g. `buildPayrollVoucher()`).

3. Add the `source_type` to `voucher_postings` constants in the frontend.

4. Done — the posting pipeline handles everything else.

---

## Running Tests

```bash
cd erp-unified-backend
npm test
# → 25 passed, 0 failed
```

## First-Time Setup Per Company

```bash
# Auto-seed account_defaults from existing COA sub_types
node scripts/seed_account_defaults.js <company_uuid>

# Or via API (one role at a time):
POST /accounting/account-defaults
{ "role": "accounts_receivable", "account_id": "<uuid>" }
```

Go to **Accounting → Engine Setup** in the UI to verify all roles are mapped.
