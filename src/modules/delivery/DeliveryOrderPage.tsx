/**
 * modules/delivery/DeliveryOrderPage.tsx — one delivery, start to finish.
 *
 * Three states in one screen, because a rider should never have to
 * navigate mid-doorstep:
 *
 *   1. En route      — address, customer, what to collect. [Arrived]
 *   2. At the door   — the OTP keypad.
 *   3. Delivered     — confirmation.
 *
 * ── Where the error handling lives ───────────────────────────────────────
 * Verification failures are rendered inline, under the keypad, not as
 * toasts — "2 attempts remaining" and "the code expired" are things the
 * rider must read and act on, and a toast slides away while they are
 * still reading digits off a customer's phone. useVerifyDeliveryOtp() is
 * defined without an onError toast specifically so this screen owns that
 * presentation (see its docblock).
 *
 * Every message shown here comes from the server. The frontend does not
 * decide whether a code is valid, expired, or locked, and does not count
 * attempts — it only renders what the backend concluded (spec §9).
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, MapPin, Phone, CheckCircle2, AlertCircle, Loader2, PackageCheck,
} from 'lucide-react'
import { Spinner, Empty, Button, Badge } from '@/components/ui'
import OtpInput from '@/components/ui/OtpInput'
import { useMyDelivery, useMarkArrived, useVerifyDeliveryOtp, useResendDeliveryOtp } from '@/hooks/useQuery'

const OTP_LENGTH = 6

export default function DeliveryOrderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: order, isLoading } = useMyDelivery(id!)
  const arrived = useMarkArrived()
  const verify = useVerifyDeliveryOtp()
  const resend = useResendDeliveryOtp()

  const [otp, setOtp] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'error'; message: string } | null>(null)

  // Local mirror of the server's cooldown, ticking down so the rider can
  // see when [Resend] becomes available (spec §13) instead of tapping a
  // dead button. Re-seeded from the server on every refetch, so this is a
  // display convenience — never the thing that decides eligibility.
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (order?.resend_available_in) setCooldown(order.resend_available_in)
  }, [order?.resend_available_in])
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size={26} className="text-brand" /></div>
  if (!order) return <Empty icon="🧾" message="This delivery is not assigned to you." />

  const isDelivered = order.status === 'delivered'
  const atDoor = !!order.delivery_arrived_at

  async function submitOtp(code: string) {
    setFeedback(null)
    try {
      const res: any = await verify.mutateAsync({ id: id!, otp: code })
      // already_delivered also arrives here as a success — a double-tap
      // or a retry after a dropped response lands on the same screen as
      // a first-time success, not an error (spec §27).
      if (res?.success) setOtp('')
    } catch (e: any) {
      const body = e?.response?.data
      setFeedback({ kind: 'error', message: body?.message || 'Something went wrong. Please try again.' })
      setOtp('')
      // The server's authoritative counters (attempts left, lock, expiry)
      // ride along on the failure body; refetching picks them up.
      if (body?.data?.resend_available_in != null) setCooldown(body.data.resend_available_in)
    }
  }

  /* ── 3. Delivered ─────────────────────────────────────────────────────── */
  if (isDelivered) {
    return (
      <div className="flex flex-col items-center text-center pt-10 gap-3">
        <div className="w-16 h-16 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h1 className="text-lg font-extrabold">Delivery Verified</h1>
        <p className="text-sm text-[var(--text-3)]">
          {order.order_no} delivered successfully
          {order.delivered_at && ` at ${new Date(order.delivered_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}.
        </p>
        <Button variant="primary" size="lg" className="w-full mt-4" onClick={() => navigate('/delivery')}>
          Done
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => navigate('/delivery')} className="flex items-center gap-1 text-sm font-semibold text-[var(--text-2)]">
        <ChevronLeft size={16} /> All deliveries
      </button>

      {/* ── Order + customer ──────────────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-extrabold">{order.order_no}</h1>
          <Badge status="processing">OUT FOR DELIVERY</Badge>
        </div>

        <div>
          <div className="text-xs text-[var(--text-4)] font-semibold uppercase tracking-wide">Customer</div>
          <div className="text-sm font-bold">{order.customer_name}</div>
        </div>

        {order.delivery_address && (
          <div>
            <div className="text-xs text-[var(--text-4)] font-semibold uppercase tracking-wide">Address</div>
            <div className="flex items-start gap-1.5 text-sm">
              <MapPin size={14} className="mt-0.5 shrink-0 text-[var(--text-4)]" />
              <span>{order.delivery_address}</span>
            </div>
          </div>
        )}

        {order.delivery_notes && (
          <div className="text-xs text-[var(--text-3)] bg-[var(--surface-2)] rounded-lg px-3 py-2">
            {order.delivery_notes}
          </div>
        )}

        {order.payment_method === 'cash_on_delivery' && order.payment_status !== 'paid' && (
          <div className="text-sm font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Collect Rs. {Number(order.grand_total).toFixed(2)} in cash
          </div>
        )}

        {order.delivery_phone && (
          <a
            href={`tel:${order.delivery_phone}`}
            className="flex items-center justify-center gap-2 h-11 rounded-lg border border-[var(--border-2)] text-sm font-semibold text-[var(--text-2)] active:bg-[var(--surface-2)]"
          >
            <Phone size={15} /> Call customer
          </a>
        )}
      </div>

      {/* ── Items (what to hand over) ─────────────────────────────────── */}
      {Array.isArray(order.items) && order.items.length > 0 && (
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-4)] font-semibold uppercase tracking-wide mb-2">
            <PackageCheck size={13} /> Items
          </div>
          <div className="flex flex-col gap-1.5">
            {order.items.map((it: any) => (
              <div key={it.id} className="flex justify-between text-sm">
                <span className="text-[var(--text-2)]">{it.product_name_snapshot}</span>
                <span className="font-semibold tabular-nums shrink-0 ml-3">
                  {Number(it.quantity)} {it.unit_snapshot || ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 1. En route ───────────────────────────────────────────────── */}
      {!atDoor && (
        <Button
          variant="primary"
          size="lg"
          className="w-full h-12"
          loading={arrived.isPending}
          onClick={() => arrived.mutate(id!)}
        >
          Arrived at Customer
        </Button>
      )}

      {/* ── 2. At the door — verification ─────────────────────────────── */}
      {atDoor && (
        <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col gap-4">
          <div className="text-center">
            <h2 className="text-base font-extrabold">Verify Delivery</h2>
            <p className="text-sm text-[var(--text-3)] mt-1">
              Ask the customer for their<br />{OTP_LENGTH}-digit delivery code.
            </p>
          </div>

          <OtpInput
            value={otp}
            onChange={(v) => { setOtp(v); if (feedback) setFeedback(null) }}
            length={OTP_LENGTH}
            disabled={verify.isPending || order.otp_locked}
            invalid={!!feedback}
            onComplete={submitOtp}
          />

          {feedback && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Attempts are only surfaced once they start running low —
              showing "5 of 5 remaining" up front frames a normal delivery
              as an adversarial test. */}
          {!feedback && order.otp_attempts > 0 && order.otp_attempts_left <= 2 && !order.otp_locked && (
            <div className="text-xs text-center font-medium text-amber-700">
              {order.otp_attempts_left} attempt{order.otp_attempts_left === 1 ? '' : 's'} remaining
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            className="w-full h-12"
            disabled={otp.length !== OTP_LENGTH || order.otp_locked}
            loading={verify.isPending}
            onClick={() => submitOtp(otp)}
          >
            Verify
          </Button>

          {/* Resend is always reachable — it is the way out of both a
              lockout and an expired code (spec §12/§13). Disabled only
              while the cooldown is genuinely running. */}
          <button
            onClick={() => resend.mutate(id!)}
            disabled={cooldown > 0 || resend.isPending}
            className="text-xs font-semibold text-center text-brand disabled:text-[var(--text-4)] disabled:cursor-not-allowed py-1"
          >
            {resend.isPending
              ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Sending…</span>
              : cooldown > 0
                ? `Resend OTP in ${cooldown} second${cooldown === 1 ? '' : 's'}`
                : 'Resend OTP to customer'}
          </button>
        </div>
      )}
    </div>
  )
}
