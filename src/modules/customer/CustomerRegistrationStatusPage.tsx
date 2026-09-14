/**
 * modules/customer/CustomerRegistrationStatusPage.tsx — Customer Product
 * Ordering module.
 *
 * Reached two ways, both via router state rather than a fetch — there is
 * nothing to authenticate a status fetch WITH until the registration is
 * approved (no token is ever issued for a pending/rejected account, see
 * routes/customerAuth.js's docblock):
 *   1. Straight from CustomerRegisterPage on submit — state carries
 *      exactly what POST /customer-auth/register returned.
 *   2. From CustomerLoginPage, when a login attempt 403s with
 *      REGISTRATION_PENDING/REGISTRATION_REJECTED — state carries
 *      whatever that response returned instead.
 *
 * "Check Registration Status" doesn't call anything itself — the only
 * way to learn the current status IS a fresh login attempt (path 2
 * above), so the button just sends the customer back to Login with their
 * phone pre-filled, in a loop that resolves itself the moment an admin
 * approves them (login succeeds normally, straight past this page).
 */
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Clock, XCircle, Store } from 'lucide-react'
import { Button } from '@/components/ui'
import { useStorefront } from './StorefrontContext'

interface StatusState {
  status?: 'pending' | 'rejected'
  name?: string
  phone?: string
  submittedAt?: string
  reason?: string | null
}

export default function CustomerRegistrationStatusPage() {
  const navigate = useNavigate()
  const location = useLocation() as { state?: StatusState }
  const { name: storeName, logo: storeLogo, storeQuery } = useStorefront()
  const state = location.state

  // Reached with no state at all — e.g. a bookmarked/refreshed URL, or a
  // customer who navigated here directly. There's genuinely nothing to
  // show without either just-submitted or just-attempted-login data, so
  // point them at the one action that can actually tell them anything.
  if (!state?.status) {
    return (
      <div className="flex items-center justify-center min-h-screen p-5 bg-[var(--surface-2)]">
        <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-center flex flex-col gap-4">
          <Clock size={28} className="text-[var(--text-4)] mx-auto" />
          <div>
            <h1 className="text-base font-extrabold mb-1">Check Registration Status</h1>
            <p className="text-xs text-[var(--text-3)]">Log in with your phone number and password to see your current status.</p>
          </div>
          <Button variant="primary" onClick={() => navigate(`/customer/login${storeQuery}`)}>Go to Login</Button>
          <Link to={`/store?next=${encodeURIComponent('/customer/login')}`} className="text-[11px] font-semibold text-brand">Change Store</Link>
        </div>
      </div>
    )
  }

  const isPending = state.status === 'pending'

  return (
    <div className="flex items-center justify-center min-h-screen p-5 bg-[var(--surface-2)]">
      <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex flex-col items-center text-center gap-2">
          <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isPending ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
            {isPending ? <Clock size={22} /> : <XCircle size={22} />}
          </span>
          <h1 className="text-base font-extrabold">{isPending ? 'Registration Pending' : 'Registration Not Approved'}</h1>
        </div>

        <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
          <div>
            <div className="text-[10px] font-bold uppercase text-[var(--text-4)] mb-0.5">Store</div>
            <div className="flex items-center gap-2">
              {storeLogo
                ? <img src={storeLogo} alt="" className="w-5 h-5 rounded object-cover" />
                : <Store size={14} className="text-[var(--text-4)]" />}
              <span className="text-sm font-semibold">{storeName || 'Store'}</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase text-[var(--text-4)] mb-0.5">Status</div>
            <div className={`flex items-center gap-1.5 text-sm font-semibold ${isPending ? 'text-amber-600' : 'text-red-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isPending ? 'bg-amber-500' : 'bg-red-500'}`} />
              {isPending ? 'Waiting for approval' : 'Not approved'}
            </div>
          </div>

          {state.submittedAt && (
            <div>
              <div className="text-[10px] font-bold uppercase text-[var(--text-4)] mb-0.5">Submitted</div>
              <div className="text-sm">{new Date(state.submittedAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</div>
            </div>
          )}

          {!isPending && state.reason && (
            <div>
              <div className="text-[10px] font-bold uppercase text-[var(--text-4)] mb-0.5">Reason</div>
              <div className="text-sm text-[var(--text-2)]">{state.reason}</div>
            </div>
          )}
        </div>

        <p className="text-xs text-center text-[var(--text-3)]">
          {isPending
            ? "We'll let you know once the store administrator approves your registration."
            : 'You can contact the store directly, or try registering with a different store.'}
        </p>

        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate(`/customer/login${storeQuery}`, { state: { prefillPhone: state.phone } })}
          >
            Check Registration Status
          </Button>
          <Link to={`/store?next=${encodeURIComponent('/customer/login')}`} className="text-center text-xs font-semibold text-brand py-1">
            Change Store
          </Link>
        </div>
      </div>
    </div>
  )
}
