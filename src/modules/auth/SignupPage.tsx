
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Phone, Mail, MessageCircle, ShieldCheck, Building2,
  UserPlus, Eye, EyeOff, ArrowLeft, RefreshCw, CheckCircle2,
  ChevronRight, Smartphone, Lock, MapPin, Hash, FileText,
} from 'lucide-react'
import { authAPI } from '@/services/api'
import useAuthStore from '@/store/authStore'
import { PATHS } from '@/constants'
import { Spinner } from '@/components/ui'

/* ─── Types (unchanged) ─────────────────────────────────────────────────── */
type Step    = 'name' | 'contact' | 'channel' | 'otp' | 'company'
type Channel = 'whatsapp' | 'email'
interface ContactState { phone: string; email: string }
interface CompanyState {
  company_name: string; company_address: string
  pan_no: string; invoice_prefix: string; password: string
}

/* ─── Helpers (unchanged) ───────────────────────────────────────────────── */
function validateNepalPhone(raw: string): string | null {
  const c = raw.replace(/[\s\-().]/g, '')
  if (/^9[6-9][0-9]{8}$/.test(c))    return '+977' + c
  if (/^977[0-9]{9,10}$/.test(c))     return '+' + c
  if (/^\+977[0-9]{9,10}$/.test(c))   return c
  if (/^\+[1-9][0-9]{7,14}$/.test(c)) return c
  return null
}
function validateEmailFmt(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}
function maskDest(d: string) {
  if (d.includes('@')) {
    const [l, dom] = d.split('@')
    return l.slice(0, 2) + '***@' + dom
  }
  return d.replace(/(\+\d{3})(\d{2})\d{5}(\d{3})/, '$1 $2·····$3')
}

/* ─── Step definitions ──────────────────────────────────────────────────── */
const STEPS: Step[] = ['name', 'contact', 'channel', 'otp', 'company']

const STEP_META: Record<Step, { label: string; color: string; glow: string }> = {
  name:    { label: 'Your Name',    color: '#6366f1', glow: 'rgba(99,102,241,0.35)'  },
  contact: { label: 'Contact',      color: '#0ea5e9', glow: 'rgba(14,165,233,0.35)'  },
  channel: { label: 'Verify',       color: '#f59e0b', glow: 'rgba(245,158,11,0.35)'  },
  otp:     { label: 'OTP',          color: '#10b981', glow: 'rgba(16,185,129,0.35)'  },
  company: { label: 'Company',      color: '#a855f7', glow: 'rgba(168,85,247,0.35)'  },
}

/* ─── Progress stepper ──────────────────────────────────────────────────── */
function Stepper({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24 }}>
      {STEPS.map((s, i) => {
        const done    = i < idx
        const active  = i === idx
        const meta    = STEP_META[s]
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            {/* Circle */}
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? meta.color : active ? meta.color : 'rgba(255,255,255,0.06)',
              border: active ? `2px solid ${meta.color}` : done ? 'none' : '1.5px solid rgba(255,255,255,0.12)',
              boxShadow: active ? `0 0 12px ${meta.glow}` : done ? `0 0 8px ${meta.glow}` : 'none',
              transition: 'all 0.3s',
              fontSize: 11, fontWeight: 700, color: done || active ? '#fff' : 'rgba(255,255,255,0.3)',
            }}>
              {done ? '✓' : i + 1}
            </div>
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 4px',
                background: i < idx
                  ? `linear-gradient(90deg, ${STEP_META[STEPS[i]].color}, ${STEP_META[STEPS[i+1]].color})`
                  : 'rgba(255,255,255,0.07)',
                borderRadius: 1,
                transition: 'all 0.4s',
              }}/>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── OTP boxes (logic unchanged, premium styled) ─────────────────────── */
function OTPBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const handleChange = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    const chars = value.split('')
    chars[i] = d
    onChange(chars.join('').slice(0, 6))
    if (d && i < 5) refs.current[i + 1]?.focus()
  }
  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      refs.current[i - 1]?.focus()
      onChange(value.slice(0, i - 1))
    }
  }
  const handlePaste = (e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (t) { onChange(t); refs.current[Math.min(t.length, 5)]?.focus() }
    e.preventDefault()
  }
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }} onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input key={i}
          ref={el => { refs.current[i] = el }}
          type="text" inputMode="numeric" maxLength={1}
          disabled={disabled} value={value[i] || ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onFocus={e => e.target.select()}
          aria-label={`OTP digit ${i + 1}`}
          style={{
            width: 48, height: 56, textAlign: 'center', fontSize: 22, fontWeight: 700,
            borderRadius: 12,
            border: value[i] ? '2px solid #10b981' : '1.5px solid rgba(255,255,255,0.12)',
            background: value[i] ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
            color: '#fff', outline: 'none',
            boxShadow: value[i] ? '0 0 16px rgba(16,185,129,0.4)' : 'none',
            transition: 'all 0.2s', cursor: 'text',
          }}
        />
      ))}
    </div>
  )
}

/* ─── Shared primitives ─────────────────────────────────────────────────── */
const IS: React.CSSProperties = {
  width: '100%', height: 44, borderRadius: 10,
  background: 'rgba(255,255,255,0.05)',
  border: '1.5px solid rgba(255,255,255,0.1)',
  color: '#fff', fontSize: 14, outline: 'none',
  transition: 'all 0.2s', boxSizing: 'border-box',
}

function FL({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: 'block', marginBottom: 5,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.6px',
      textTransform: 'uppercase', color: 'rgba(165,180,252,0.65)',
    }}>{children}</label>
  )
}

function Err({ msg }: { msg: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '10px 14px', borderRadius: 10, marginBottom: 14,
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)',
        color: '#fca5a5', fontSize: 13,
      }}>
      ⚠ {msg}
    </motion.div>
  )
}

function GlowBtn({
  onClick, type = 'button', disabled, loading, color = 'indigo', children,
}: {
  onClick?: () => void; type?: 'button' | 'submit'
  disabled?: boolean; loading?: boolean
  color?: 'indigo' | 'teal' | 'amber' | 'purple' | 'blue'
  children: React.ReactNode
}) {
  const gradients: Record<string, string> = {
    indigo: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    teal:   'linear-gradient(135deg, #0d9488, #0ea5e9)',
    amber:  'linear-gradient(135deg, #d97706, #f59e0b)',
    purple: 'linear-gradient(135deg, #7c3aed, #a855f7)',
    blue:   'linear-gradient(135deg, #2563eb, #0ea5e9)',
  }
  const glows: Record<string, string> = {
    indigo: 'rgba(99,102,241,0.4)',
    teal:   'rgba(13,148,136,0.4)',
    amber:  'rgba(217,119,6,0.4)',
    purple: 'rgba(168,85,247,0.4)',
    blue:   'rgba(37,99,235,0.4)',
  }
  const isDisabled = disabled || loading
  return (
    <motion.button type={type} onClick={onClick} disabled={isDisabled}
      whileHover={!isDisabled ? { scale: 1.012 } : {}}
      whileTap={!isDisabled ? { scale: 0.988 } : {}}
      style={{
        width: '100%', height: 46, borderRadius: 12, border: 'none',
        background: isDisabled ? 'rgba(255,255,255,0.08)' : gradients[color],
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        color: isDisabled ? 'rgba(255,255,255,0.3)' : '#fff',
        fontSize: 14, fontWeight: 700, letterSpacing: '0.3px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: isDisabled ? 'none' : `0 4px 20px ${glows[color]}, inset 0 1px 0 rgba(255,255,255,0.1)`,
        transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
      }}
    >
      {!isDisabled && (
        <motion.div
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
          style={{
            position: 'absolute', top: 0, left: 0, width: '35%', height: '100%',
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)',
            pointerEvents: 'none',
          }}
        />
      )}
      {loading ? <Spinner size={17} /> : children}
    </motion.button>
  )
}

/* ─── Step icon badge ────────────────────────────────────────────────────── */
function StepIcon({ color, glow, children }: { color: string; glow: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
      background: `${color}22`,
      border: `1px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 16px ${glow}`,
    }}>
      {children}
    </div>
  )
}

/* ─── Channel card ───────────────────────────────────────────────────────── */
function ChannelCard({
  channel, icon, label, sublabel, selected, disabled, onClick,
}: {
  channel: Channel; icon: React.ReactNode; label: string; sublabel: string
  selected: boolean; disabled: boolean; onClick: () => void
}) {
  const colors = {
    whatsapp: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', glow: 'rgba(16,185,129,0.2)', text: '#34d399' },
    email:    { bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.3)', glow: 'rgba(96,165,250,0.2)', text: '#60a5fa' },
  }
  const c = colors[channel]
  return (
    <motion.button
      type="button" onClick={onClick} disabled={disabled}
      whileHover={!disabled ? { scale: 1.02 } : {}}
      whileTap={!disabled ? { scale: 0.98 } : {}}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: 14, textAlign: 'left',
        background: selected ? c.bg : 'rgba(255,255,255,0.03)',
        border: `1.5px solid ${selected ? c.border : 'rgba(255,255,255,0.08)'}`,
        boxShadow: selected ? `0 4px 20px ${c.glow}` : 'none',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: selected ? c.bg : 'rgba(255,255,255,0.04)',
        border: `1px solid ${selected ? c.border : 'rgba(255,255,255,0.08)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: selected ? c.text : '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 3px' }}>{label}</p>
        <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sublabel}</p>
      </div>
      {/* Radio dot */}
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: selected ? c.border : 'transparent',
        border: `2px solid ${selected ? c.border : 'rgba(255,255,255,0.2)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s',
      }}>
        {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }}/>}
      </div>
    </motion.button>
  )
}

/* ─── Slide animation variants ──────────────────────────────────────────── */
const slide = {
  enter: (d: number) => ({ x: d > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (d: number) => ({ x: d > 0 ? -48 : 48, opacity: 0 }),
}
const trans = { duration: 0.22, ease: 'easeInOut' }

/* ═══════════════════════════════════════ MAIN ═══════════════════════════════ */
export default function SignupPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore(s => s.setAuth)

  // ── All state unchanged ───────────────────────────────────────────────────
  const [step, setStep]         = useState<Step>('name')
  const [dir,  setDir]          = useState(1)
  const [fullName, setFullName] = useState('')
  const [contact, setContact]   = useState<ContactState>({ phone: '', email: '' })
  const [channel, setChannel]   = useState<Channel>('whatsapp')
  const [otp, setOtp]           = useState('')
  const [verifiedToken, setVT]  = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [company, setCompany]   = useState<CompanyState>({
    company_name: '', company_address: '', pan_no: '', invoice_prefix: 'INV', password: '',
  })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [toast, setToast]       = useState('')
  const [timer, setTimer]       = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── All handlers unchanged ────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    setTimer(60)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimer(t => { if (t <= 1) { clearInterval(timerRef.current!); return 0 } return t - 1 })
    }, 1000)
  }, [])
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])
  useEffect(() => { if (step === 'otp' && otp.length === 6) handleVerifyOTP() }, [otp]) // eslint-disable-line
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const goTo = (next: Step) => {
    setDir(STEPS.indexOf(next) > STEPS.indexOf(step) ? 1 : -1)
    setError('')
    setStep(next)
  }

  const destination = channel === 'email'
    ? contact.email.toLowerCase().trim()
    : validateNepalPhone(contact.phone) || contact.phone

  const handleNameNext = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) { setError('Please enter your full name'); return }
    if (fullName.trim().length < 2) { setError('Name must be at least 2 characters'); return }
    goTo('contact')
  }

  const handleContactNext = (e: React.FormEvent) => {
    e.preventDefault()
    const hasPhone = contact.phone.trim() !== ''
    const hasEmail = contact.email.trim() !== ''
    if (!hasPhone && !hasEmail) { setError('Please enter at least one contact method'); return }
    if (hasPhone && !validateNepalPhone(contact.phone)) { setError('Invalid phone number format'); return }
    if (hasEmail && !validateEmailFmt(contact.email))  { setError('Invalid email address'); return }
    if (!hasPhone) setChannel('email')
    else if (!hasEmail) setChannel('whatsapp')
    goTo('channel')
  }

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    const payload: Record<string, string> = { method: channel, purpose: 'signup' }
    if (channel === 'email') {
      if (!contact.email.trim()) { setError('Email address required for this method'); return }
      payload.email = contact.email.toLowerCase().trim()
    } else {
      const norm = validateNepalPhone(contact.phone)
      if (!norm) { setError('Valid phone number required for WhatsApp'); return }
      payload.phone = norm
    }
    setLoading(true)
    try { await authAPI.sendOTP(payload as any); startTimer(); goTo('otp') }
    catch (e: any) { setError(e.message || 'Failed to send OTP') }
    finally { setLoading(false) }
  }

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) return
    setError(''); setLoading(true)
    try {
      const res = await authAPI.verifyOTP({ method: channel, destination, otp, purpose: 'signup' })
      setVT(res.data.data.verified_token || res.data.data.phone_token || '')
      goTo('company')
    } catch (e: any) { setError(e.message || 'Invalid OTP') }
    finally { setLoading(false) }
  }

  const handleResend = async () => {
    setError(''); setOtp(''); setLoading(true)
    try {
      const payload: Record<string, string> = { method: channel, purpose: 'signup' }
      if (channel === 'email') payload.email = contact.email.toLowerCase().trim()
      else payload.phone = validateNepalPhone(contact.phone) || contact.phone
      await authAPI.sendOTP(payload as any); startTimer(); showToast('New OTP sent!')
    } catch (e: any) { setError(e.message || 'Failed to resend OTP') }
    finally { setLoading(false) }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError('')
    if (!company.company_name.trim()) { setError('Company name is required'); return }
    if (company.password && company.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await authAPI.register({
        verified_token:  verifiedToken,
        name:            fullName.trim(),
        password:        company.password || undefined,
        phone:           contact.phone ? (validateNepalPhone(contact.phone) || undefined) : undefined,
        email:           contact.email.trim() || undefined,
        company_name:    company.company_name.trim(),
        company_address: company.company_address.trim() || undefined,
        pan_no:          company.pan_no.trim() || undefined,
        invoice_prefix:  company.invoice_prefix.trim() || 'INV',
      })
      const body = res.data.data
      if (body.refresh_token) localStorage.setItem('erp_refresh_token', body.refresh_token)
      setAuth({ token: body.token, user: body.user, company: body.company })
      navigate(PATHS.DASHBOARD, { replace: true })
    } catch (e: any) { setError(e.message || 'Registration failed') }
    finally { setLoading(false) }
  }

  const hasPhone = !!validateNepalPhone(contact.phone)
  const hasEmail = validateEmailFmt(contact.email)
  const stepMeta = STEP_META[step]

  /* ─── JSX ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#050B1A 0%,#081326 50%,#0D1B34 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
      position: 'relative',
    }}>
      {/* Ambient orbs */}
      <div style={{ position:'fixed', top:'10%', left:'15%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,0.1) 0%,transparent 70%)', pointerEvents:'none' }}/>
      <div style={{ position:'fixed', bottom:'10%', right:'10%', width:250, height:250, borderRadius:'50%', background:'radial-gradient(circle,rgba(168,85,247,0.08) 0%,transparent 70%)', pointerEvents:'none' }}/>
      <div style={{ position:'fixed', top:'50%', right:'20%', width:180, height:180, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,0.07) 0%,transparent 70%)', pointerEvents:'none' }}/>

      <style>{`
        .sg-input:focus { border-color: rgba(99,102,241,0.65) !important; background: rgba(255,255,255,0.07) !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important; }
        .sg-input::placeholder { color: rgba(255,255,255,0.2); }
        .sg-back { background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 5px; color: rgba(255,255,255,0.3); font-size: 12px; padding: 0; margin-bottom: 16px; transition: color 0.15s; }
        .sg-back:hover { color: rgba(255,255,255,0.65); }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            boxShadow: '0 0 32px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
            marginBottom: 12,
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
              <rect x="10" y="4" width="8" height="20" rx="2" fill="white"/>
              <rect x="4" y="10" width="20" height="8" rx="2" fill="white"/>
            </svg>
          </div>
          <h1 style={{
            fontSize: 22, fontWeight: 800, marginBottom: 4,
            background: 'linear-gradient(135deg,#fff 30%,#a5b4fc 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>Create your account</h1>
          <p style={{ color: 'rgba(165,180,252,0.55)', fontSize: 13, margin: 0 }}>Set up your MediERP in minutes</p>
        </div>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div key="toast"
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                background: 'rgba(16,185,129,0.11)', border: '1px solid rgba(16,185,129,0.28)',
                color: '#6ee7b7', fontSize: 13,
              }}
            >
              <CheckCircle2 size={14}/> {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card */}
        <div style={{
          borderRadius: 24, overflow: 'hidden',
          background: 'rgba(255,255,255,0.03)',
          border: '1.5px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          {/* Gradient stripe — color changes per step */}
          <motion.div
            animate={{ background: `linear-gradient(90deg, ${stepMeta.color}, ${stepMeta.color}99, #7c3aed)` }}
            transition={{ duration: 0.5 }}
            style={{ height: 3 }}
          />

          <div style={{ padding: '24px 24px 20px' }}>
            {/* Step stepper */}
            <Stepper step={step} />

            <AnimatePresence mode="wait" custom={dir}>

              {/* ══ STEP 1: NAME ══════════════════════════════════════════ */}
              {step === 'name' && (
                <motion.div key="name" custom={dir} variants={slide}
                  initial="enter" animate="center" exit="exit" transition={trans}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <StepIcon color="#6366f1" glow="rgba(99,102,241,0.3)">
                      <User size={18} color="#818cf8"/>
                    </StepIcon>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 3px' }}>What's your name?</h2>
                      <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>This appears on your account and documents</p>
                    </div>
                  </div>

                  {error && <Err msg={error}/>}

                  <form onSubmit={handleNameNext} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <FL>Full Name</FL>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.4)', display:'flex', pointerEvents:'none' }}><User size={15}/></span>
                        <input autoFocus autoComplete="name" placeholder="Ram Kumar Sharma"
                          className="sg-input" style={{ ...IS, paddingLeft: 38, paddingRight: 14 }}
                          value={fullName} onChange={e => setFullName(e.target.value)}/>
                      </div>
                    </div>
                    <GlowBtn type="submit" disabled={!fullName.trim()} color="indigo">
                      <ChevronRight size={16}/> Continue
                    </GlowBtn>
                  </form>

                  <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 13, marginTop: 16 }}>
                    Already have an account?{' '}
                    <Link to={PATHS.LOGIN} style={{ color: '#a5b4fc', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
                  </p>
                </motion.div>
              )}

              {/* ══ STEP 2: CONTACT ══════════════════════════════════════ */}
              {step === 'contact' && (
                <motion.div key="contact" custom={dir} variants={slide}
                  initial="enter" animate="center" exit="exit" transition={trans}
                >
                  <button className="sg-back" onClick={() => goTo('name')}>
                    <ArrowLeft size={13}/> Back
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <StepIcon color="#0ea5e9" glow="rgba(14,165,233,0.3)">
                      <Smartphone size={18} color="#38bdf8"/>
                    </StepIcon>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 3px' }}>Contact details</h2>
                      <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>Enter phone, email, or both</p>
                    </div>
                  </div>

                  {error && <Err msg={error}/>}

                  <form onSubmit={handleContactNext} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <FL>Phone Number <span style={{ fontWeight: 400, textTransform: 'none', color: 'rgba(255,255,255,0.25)' }}>(for WhatsApp OTP)</span></FL>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.4)', display:'flex', pointerEvents:'none' }}><Phone size={15}/></span>
                        <span style={{ position:'absolute', left:36, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.28)', fontSize:13, pointerEvents:'none', userSelect:'none' }}>+977</span>
                        <input type="tel" inputMode="tel" autoFocus autoComplete="tel" placeholder="98XXXXXXXX"
                          className="sg-input" style={{ ...IS, paddingLeft: 82, paddingRight: 14 }}
                          value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))}/>
                      </div>
                    </div>
                    <div>
                      <FL>Email Address <span style={{ fontWeight: 400, textTransform: 'none', color: 'rgba(255,255,255,0.25)' }}>(for Email OTP)</span></FL>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.4)', display:'flex', pointerEvents:'none' }}><Mail size={15}/></span>
                        <input type="email" inputMode="email" autoComplete="email" placeholder="you@company.com"
                          className="sg-input" style={{ ...IS, paddingLeft: 38, paddingRight: 14 }}
                          value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))}/>
                      </div>
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 11, margin: '-4px 0 0' }}>Enter at least one. Both lets you choose your OTP method.</p>
                    <GlowBtn type="submit" disabled={!contact.phone.trim() && !contact.email.trim()} color="blue">
                      <ChevronRight size={16}/> Continue
                    </GlowBtn>
                  </form>
                </motion.div>
              )}

              {/* ══ STEP 3: CHANNEL ══════════════════════════════════════ */}
              {step === 'channel' && (
                <motion.div key="channel" custom={dir} variants={slide}
                  initial="enter" animate="center" exit="exit" transition={trans}
                >
                  <button className="sg-back" onClick={() => goTo('contact')}>
                    <ArrowLeft size={13}/> Back
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <StepIcon color="#f59e0b" glow="rgba(245,158,11,0.3)">
                      <MessageCircle size={18} color="#fbbf24"/>
                    </StepIcon>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 3px' }}>How to receive your OTP?</h2>
                      <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>Choose your verification channel</p>
                    </div>
                  </div>

                  {error && <Err msg={error}/>}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                    <ChannelCard
                      channel="whatsapp"
                      icon={<MessageCircle size={20} color="#34d399"/>}
                      label="WhatsApp"
                      sublabel={hasPhone ? `Send to ${maskDest(validateNepalPhone(contact.phone) || contact.phone)}` : 'Requires a phone number'}
                      selected={channel === 'whatsapp'}
                      disabled={!hasPhone}
                      onClick={() => setChannel('whatsapp')}
                    />
                    <ChannelCard
                      channel="email"
                      icon={<Mail size={20} color="#60a5fa"/>}
                      label="Email"
                      sublabel={hasEmail ? `Send to ${maskDest(contact.email)}` : 'Requires an email address'}
                      selected={channel === 'email'}
                      disabled={!hasEmail}
                      onClick={() => setChannel('email')}
                    />
                  </div>

                  <form onSubmit={handleSendOTP}>
                    <GlowBtn type="submit" loading={loading} color="amber">
                      {!loading && (channel === 'whatsapp'
                        ? <><MessageCircle size={16}/> Send via WhatsApp</>
                        : <><Mail size={16}/> Send via Email</>
                      )}
                    </GlowBtn>
                  </form>
                </motion.div>
              )}

              {/* ══ STEP 4: OTP ══════════════════════════════════════════ */}
              {step === 'otp' && (
                <motion.div key="otp" custom={dir} variants={slide}
                  initial="enter" animate="center" exit="exit" transition={trans}
                >
                  <button className="sg-back" onClick={() => { goTo('channel'); setOtp('') }}>
                    <ArrowLeft size={13}/> Back
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
                    <StepIcon color="#10b981" glow="rgba(16,185,129,0.3)">
                      {channel === 'whatsapp'
                        ? <MessageCircle size={18} color="#34d399"/>
                        : <Mail size={18} color="#60a5fa"/>
                      }
                    </StepIcon>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 3px' }}>Verify your {channel === 'whatsapp' ? 'phone' : 'email'}</h2>
                      <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>
                        Code sent to{' '}
                        <span style={{ color: 'rgba(165,180,252,0.8)', fontWeight: 600 }}>{maskDest(destination)}</span>
                      </p>
                    </div>
                  </div>

                  {error && <Err msg={error}/>}

                  <div style={{ marginBottom: 20 }}>
                    <p style={{ textAlign: 'center', marginBottom: 14, fontSize: 11, fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'rgba(165,180,252,0.55)' }}>
                      6-digit code
                    </p>
                    <OTPBoxes value={otp} onChange={setOtp} disabled={loading}/>
                  </div>

                  <GlowBtn loading={loading} disabled={otp.length !== 6} onClick={handleVerifyOTP} color="teal">
                    {!loading && <><ShieldCheck size={16}/> Verify Code</>}
                  </GlowBtn>

                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    {timer > 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 13 }}>
                        Resend in{' '}
                        <span style={{ color: '#34d399', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          0:{String(timer).padStart(2, '0')}
                        </span>
                      </p>
                    ) : (
                      <button type="button" onClick={handleResend} disabled={loading} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: '#34d399',
                        fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
                        opacity: loading ? 0.5 : 1,
                      }}>
                        {loading ? <Spinner size={13}/> : <RefreshCw size={13}/>} Resend OTP
                      </button>
                    )}
                    <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, marginTop: 4 }}>Code expires in 5 minutes</p>
                  </div>
                </motion.div>
              )}

              {/* ══ STEP 5: COMPANY ══════════════════════════════════════ */}
              {step === 'company' && (
                <motion.div key="company" custom={dir} variants={slide}
                  initial="enter" animate="center" exit="exit" transition={trans}
                >
                  {/* Verified badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', borderRadius: 10, marginBottom: 18,
                    background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.28)',
                  }}>
                    <CheckCircle2 size={15} color="#34d399" style={{ flexShrink: 0 }}/>
                    <span style={{ color: '#6ee7b7', fontSize: 12, fontWeight: 500 }}>
                      {channel === 'whatsapp' ? 'Phone' : 'Email'} verified: {maskDest(destination)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <StepIcon color="#a855f7" glow="rgba(168,85,247,0.3)">
                      <Building2 size={18} color="#c084fc"/>
                    </StepIcon>
                    <div>
                      <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 3px' }}>Set up your company</h2>
                      <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>Almost done — a few more details</p>
                    </div>
                  </div>

                  {error && <Err msg={error}/>}

                  <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Section label */}
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', margin: '0 0 -2px', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      Company Details
                    </p>

                    {/* Company Name — full width */}
                    <div>
                      <FL>Company Name *</FL>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.4)', display:'flex', pointerEvents:'none' }}><Building2 size={15}/></span>
                        <input autoFocus placeholder="Nepal Pharma Pvt. Ltd."
                          className="sg-input" style={{ ...IS, paddingLeft: 38, paddingRight: 14 }}
                          value={company.company_name} onChange={e => setCompany(c => ({ ...c, company_name: e.target.value }))}/>
                      </div>
                    </div>

                    {/* PAN + Invoice Prefix — 2 col */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <FL>PAN / VAT No</FL>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.4)', display:'flex', pointerEvents:'none' }}><Hash size={14}/></span>
                          <input placeholder="123456789" className="sg-input"
                            style={{ ...IS, paddingLeft: 32, paddingRight: 10, fontSize: 13 }}
                            value={company.pan_no} onChange={e => setCompany(c => ({ ...c, pan_no: e.target.value }))}/>
                        </div>
                      </div>
                      <div>
                        <FL>Invoice Prefix</FL>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.4)', display:'flex', pointerEvents:'none' }}><FileText size={14}/></span>
                          <input placeholder="INV" maxLength={6} className="sg-input"
                            style={{ ...IS, paddingLeft: 32, paddingRight: 10, fontSize: 13 }}
                            value={company.invoice_prefix} onChange={e => setCompany(c => ({ ...c, invoice_prefix: e.target.value.toUpperCase() }))}/>
                        </div>
                      </div>
                    </div>

                    {/* Address */}
                    <div>
                      <FL>Address</FL>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.4)', display:'flex', pointerEvents:'none' }}><MapPin size={15}/></span>
                        <input placeholder="Kathmandu, Nepal" className="sg-input"
                          style={{ ...IS, paddingLeft: 38, paddingRight: 14 }}
                          value={company.company_address} onChange={e => setCompany(c => ({ ...c, company_address: e.target.value }))}/>
                      </div>
                    </div>

                    {/* Password section */}
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', margin: '4px 0 -2px', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      Password
                    </p>

                    <div>
                      <FL>Password <span style={{ fontWeight: 400, textTransform: 'none', color: 'rgba(255,255,255,0.2)' }}>(optional — OTP login also works)</span></FL>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.4)', display:'flex', pointerEvents:'none' }}><Lock size={15}/></span>
                        <input type={showPw ? 'text' : 'password'} placeholder="Min 8 characters" autoComplete="new-password"
                          className="sg-input" style={{ ...IS, paddingLeft: 38, paddingRight: 44 }}
                          value={company.password} onChange={e => setCompany(c => ({ ...c, password: e.target.value }))}/>
                        <button type="button" onClick={() => setShowPw(v => !v)} style={{
                          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 0, display: 'flex',
                        }}>
                          {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: 4 }}>
                      <GlowBtn type="submit" loading={loading} color="purple">
                        {!loading && <><UserPlus size={16}/> Create Account</>}
                      </GlowBtn>
                    </div>
                  </form>

                  <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 13, marginTop: 14 }}>
                    Already have an account?{' '}
                    <Link to={PATHS.LOGIN} style={{ color: '#a5b4fc', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
                  </p>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}