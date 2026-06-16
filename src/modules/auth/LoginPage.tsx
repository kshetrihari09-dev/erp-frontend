/**
 * LoginPage.tsx — Premium Enterprise Authentication
 *
 * UI: Dark luxury pharma/fintech theme — glassmorphism, neon accents, split-screen
 * Logic: 100% unchanged — all auth flows, API calls, validation, OTP preserved exactly
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye, EyeOff, LogIn, ShieldCheck, MessageCircle,
  Mail, Phone, RefreshCw, ArrowLeft, CheckCircle2,
  BarChart3, Lock, Zap, Shield,
} from 'lucide-react'
import { authAPI } from '@/services/api'
import useAuthStore from '@/store/authStore'
import { PATHS } from '@/constants'
import { Spinner } from '@/components/ui'

type LoginMode  = 'password' | 'otp'
type OtpChannel = 'whatsapp' | 'email'
type OtpStep    = 'select' | 'send' | 'verify'

const pwSchema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
})
type PwForm = z.infer<typeof pwSchema>

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

/* ── OTP boxes ───────────────────────────────────────────────────────────── */
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
            border: value[i] ? '2px solid #6366f1' : '1.5px solid rgba(255,255,255,0.12)',
            background: value[i] ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
            color: '#fff', outline: 'none',
            boxShadow: value[i] ? '0 0 16px rgba(99,102,241,0.4)' : 'none',
            transition: 'all 0.2s', cursor: 'text',
          }}
        />
      ))}
    </div>
  )
}

/* ── Left panel ──────────────────────────────────────────────────────────── */
function LeftPanel() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      padding: '48px 40px', position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(145deg, #050B1A 0%, #0a1628 60%, #0d1f3c 100%)',
    }}>
      <div style={{ position:'absolute', top:-80, left:-80, width:320, height:320, borderRadius:'50%', background:'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', bottom:-60, right:-60, width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 70%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', top:'45%', right:-40, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle, rgba(16,185,129,0.09) 0%, transparent 70%)', pointerEvents:'none' }}/>

      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.035 }} aria-hidden>
        <defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5"/></pattern></defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>

      <div style={{ position:'relative', zIndex:1, maxWidth:380, width:'100%' }}>
        <motion.div initial={{ scale:0.85, opacity:0 }} animate={{ scale:1, opacity:1 }} transition={{ duration:0.6, ease:'easeOut' }} style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ position:'relative', display:'inline-block' }}>
            <motion.div animate={{ scale:[1,1.15,1], opacity:[0.25,0.08,0.25] }} transition={{ duration:3.5, repeat:Infinity, ease:'easeInOut' }}
              style={{ position:'absolute', inset:-20, borderRadius:'50%', border:'1.5px solid rgba(99,102,241,0.4)' }}/>
            <motion.div animate={{ scale:[1,1.09,1], opacity:[0.35,0.1,0.35] }} transition={{ duration:3.5, repeat:Infinity, ease:'easeInOut', delay:0.6 }}
              style={{ position:'absolute', inset:-10, borderRadius:'50%', border:'1px solid rgba(139,92,246,0.3)' }}/>
            <div style={{
              width:88, height:88, borderRadius:24,
              background:'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 0 48px rgba(99,102,241,0.55), 0 0 96px rgba(99,102,241,0.18), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}>
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden>
                <rect x="17" y="6" width="10" height="32" rx="3" fill="white"/>
                <rect x="6" y="17" width="32" height="10" rx="3" fill="white"/>
              </svg>
            </div>
          </div>
          <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3, duration:0.5 }}>
            <h1 style={{
              marginTop:22, marginBottom:5, fontSize:34, fontWeight:800, letterSpacing:'-0.5px',
              background:'linear-gradient(135deg, #fff 30%, #a5b4fc 100%)',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
            }}>MediERP</h1>
            <p style={{ color:'rgba(165,180,252,0.65)', fontSize:13, fontWeight:500, letterSpacing:'0.4px' }}>Pharma + Accounting System</p>
          </motion.div>
        </motion.div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[
            { icon:<Shield size={18} color="#6366f1"/>, title:'Secure Access', desc:'Enterprise-grade encryption with multi-factor authentication', glow:'rgba(99,102,241,0.14)', border:'rgba(99,102,241,0.25)', delay:0.5 },
            { icon:<BarChart3 size={18} color="#10b981"/>, title:'Smart Analytics', desc:'Real-time pharma inventory, sales & accounting reports', glow:'rgba(16,185,129,0.11)', border:'rgba(16,185,129,0.22)', delay:0.6 },
            { icon:<Zap size={18} color="#f59e0b"/>, title:'Fast & Reliable', desc:'99.9% uptime with instant transaction processing', glow:'rgba(245,158,11,0.11)', border:'rgba(245,158,11,0.22)', delay:0.7 },
          ].map((f, i) => (
            <motion.div key={i}
              initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }}
              transition={{ delay:f.delay, duration:0.45 }}
              whileHover={{ scale:1.02, transition:{ duration:0.15 } }}
              style={{
                display:'flex', alignItems:'center', gap:14, padding:'13px 15px', borderRadius:14,
                background:'rgba(255,255,255,0.035)', border:`1px solid ${f.border}`,
                backdropFilter:'blur(8px)', boxShadow:`0 4px 20px ${f.glow}`, cursor:'default',
              }}
            >
              <div style={{ width:40, height:40, borderRadius:10, flexShrink:0, background:f.glow, display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${f.border}` }}>{f.icon}</div>
              <div>
                <p style={{ color:'#fff', fontSize:13, fontWeight:600, marginBottom:2 }}>{f.title}</p>
                <p style={{ color:'rgba(255,255,255,0.4)', fontSize:11, lineHeight:1.5 }}>{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:1, duration:0.5 }}
          style={{ marginTop:28, display:'flex', alignItems:'center', gap:24, justifyContent:'center' }}>
          {[{ label:'Uptime', value:'99.9%' }, { label:'Secure', value:'256-bit' }, { label:'Support', value:'24/7' }].map((s, i) => (
            <div key={i} style={{ textAlign:'center' }}>
              <p style={{ color:'#a5b4fc', fontSize:15, fontWeight:700 }}>{s.value}</p>
              <p style={{ color:'rgba(255,255,255,0.3)', fontSize:10, marginTop:2, letterSpacing:'0.5px', textTransform:'uppercase' }}>{s.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

/* ── Shared input label ───────────────────────────────────────────────────── */
function FL({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', marginBottom:6, fontSize:11, fontWeight:600, letterSpacing:'0.6px', textTransform:'uppercase' as const, color:'rgba(165,180,252,0.65)' }}>{children}</label>
}

/* ── Glass input style ───────────────────────────────────────────────────── */
const IS: React.CSSProperties = {
  width:'100%', height:48, borderRadius:12, background:'rgba(255,255,255,0.05)',
  border:'1.5px solid rgba(255,255,255,0.1)', color:'#fff', fontSize:14,
  outline:'none', transition:'all 0.2s', boxSizing:'border-box',
}

/* ── Glow button ─────────────────────────────────────────────────────────── */
function GlowBtn({ onClick, type='button', disabled, loading, children }: {
  onClick?:()=>void; type?:'button'|'submit'; disabled?:boolean; loading?:boolean; children:React.ReactNode
}) {
  return (
    <motion.button type={type} onClick={onClick} disabled={disabled||loading}
      whileHover={!disabled&&!loading?{scale:1.015}:{}} whileTap={!disabled&&!loading?{scale:0.985}:{}}
      style={{
        width:'100%', height:50, borderRadius:14, border:'none',
        background:disabled||loading?'rgba(99,102,241,0.35)':'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        cursor:disabled||loading?'not-allowed':'pointer', color:'#fff',
        fontSize:15, fontWeight:700, letterSpacing:'0.3px',
        display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        boxShadow:disabled||loading?'none':'0 4px 24px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.1)',
        transition:'background 0.2s, box-shadow 0.2s', position:'relative', overflow:'hidden',
      }}
    >
      {!disabled && !loading && (
        <motion.div animate={{ x:['-100%','200%'] }} transition={{ duration:2.5, repeat:Infinity, ease:'linear', repeatDelay:1.5 }}
          style={{ position:'absolute', top:0, left:0, width:'40%', height:'100%', background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)', pointerEvents:'none' }}/>
      )}
      {loading ? <Spinner size={18}/> : children}
    </motion.button>
  )
}

/* ── Error box ───────────────────────────────────────────────────────────── */
function Err({ msg }: { msg:string }) {
  return (
    <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }}
      style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, marginBottom:16, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.28)', color:'#fca5a5', fontSize:13 }}>
      ⚠ {msg}
    </motion.div>
  )
}

/* ── Mode tab ────────────────────────────────────────────────────────────── */
function ModeTab({ active, label, icon, onClick }: { active:boolean; label:string; icon:React.ReactNode; onClick:()=>void }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7,
      padding:'10px 14px', borderRadius:12,
      background:active?'linear-gradient(135deg,#4f46e5,#7c3aed)':'transparent',
      border:'none', color:active?'#fff':'rgba(255,255,255,0.38)',
      fontSize:13, fontWeight:600, cursor:'pointer',
      boxShadow:active?'0 4px 16px rgba(99,102,241,0.35)':'none',
      transition:'all 0.2s',
    }}>
      {icon} {label}
    </button>
  )
}

/* ═══════════════════════════════════════ MAIN ═══════════════════════════════ */
export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setAuth  = useAuthStore(s => s.setAuth)

  const [mode, setMode]             = useState<LoginMode>('password')
  const [showPw, setShowPw]         = useState(false)
  const [pwErr, setPwErr]           = useState('')
  const [otpChannel, setOtpCh]      = useState<OtpChannel>('whatsapp')
  const [otpStep, setOtpStep]       = useState<OtpStep>('select')
  const [phoneInput, setPhoneInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [otp, setOtp]               = useState('')
  const [otpErr, setOtpErr]         = useState('')
  const [otpLoading, setOtpLoad]    = useState(false)
  const [timer, setTimer]           = useState(0)
  const [toast, setToast]           = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
    defaultValues: { email:'admin@demo.com', password:'admin123' },
  })

  const startTimer = useCallback(() => {
    setTimer(60)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimer(t => { if (t<=1) { clearInterval(timerRef.current!); return 0 } return t-1 })
    }, 1000)
  }, [])
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])
  useEffect(() => { if (otpStep==='verify' && otp.length===6) handleVerifyOTP() }, [otp]) // eslint-disable-line
  const showToast = (msg: string) => { setToast(msg); setTimeout(()=>setToast(''), 3000) }
  const destination = otpChannel==='email' ? emailInput.toLowerCase().trim() : validateNepalPhone(phoneInput)||phoneInput

  const onPasswordSubmit = async (data: PwForm) => {
    setPwErr('')
    try {
      const res  = await authAPI.login(data)
      const body = res.data.data
      const tok  = body.token || (body as any).access_token
      if (!tok) throw new Error('No token received')
      if (body.refresh_token) localStorage.setItem('erp_refresh_token', body.refresh_token)
      setAuth({ token:tok, user:body.user, company:body.company })
      const from = (location.state as any)?.from?.pathname || PATHS.DASHBOARD
      navigate(from, { replace:true })
    } catch (e: any) { setPwErr(e.message||'Login failed') }
  }

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault(); setOtpErr('')
    const payload: Record<string,string> = { method:otpChannel, purpose:'login' }
    if (otpChannel==='email') {
      if (!validateEmailFmt(emailInput)) { setOtpErr('Enter a valid email address'); return }
      payload.email = emailInput.toLowerCase().trim()
    } else {
      const norm = validateNepalPhone(phoneInput)
      if (!norm) { setOtpErr('Enter a valid phone number (e.g. 9841234567)'); return }
      payload.phone = norm
    }
    setOtpLoad(true)
    try { await authAPI.sendOTP(payload as any); startTimer(); setOtpStep('verify') }
    catch (e: any) { setOtpErr(e.message||'Failed to send OTP') }
    finally { setOtpLoad(false) }
  }

  const handleVerifyOTP = async () => {
    if (otp.length!==6) return; setOtpErr(''); setOtpLoad(true)
    try {
      const res  = await authAPI.verifyOTP({ method:otpChannel, destination, otp, purpose:'login' })
      const body = res.data.data
      if (!body.token) throw new Error('No token received')
      if (body.refresh_token) localStorage.setItem('erp_refresh_token', body.refresh_token)
      setAuth({ token:body.token, user:body.user!, company:body.company! })
      const from = (location.state as any)?.from?.pathname || PATHS.DASHBOARD
      navigate(from, { replace:true })
    } catch (e: any) { setOtpErr(e.message||'Invalid OTP') }
    finally { setOtpLoad(false) }
  }

  const handleResend = async () => {
    setOtpErr(''); setOtp(''); setOtpLoad(true)
    try {
      const payload: Record<string,string> = { method:otpChannel, purpose:'login' }
      if (otpChannel==='email') payload.email = emailInput.toLowerCase().trim()
      else payload.phone = validateNepalPhone(phoneInput)||phoneInput
      await authAPI.sendOTP(payload as any); startTimer(); showToast('New OTP sent!')
    } catch (e: any) { setOtpErr(e.message||'Failed to resend') }
    finally { setOtpLoad(false) }
  }

  const switchMode = (m: LoginMode) => { setMode(m); setOtpStep('select'); setOtp(''); setOtpErr(''); setPwErr('') }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#050B1A 0%,#081326 50%,#0D1B34 100%)', display:'flex', fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif" }}>

      {/* Responsive left panel */}
      <div className="medi-left">
        <LeftPanel />
      </div>

      <style>{`
        .medi-left { display: none; flex: 1; }
        @media (min-width: 900px) { .medi-left { display: flex; } }
        .gi:focus { border-color: rgba(99,102,241,0.65) !important; background: rgba(255,255,255,0.07) !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.15) !important; }
        .gi::placeholder { color: rgba(255,255,255,0.2); }
        .ml-only { display: block; }
        @media (min-width: 900px) { .ml-only { display: none !important; } }
      `}</style>

      {/* Right panel */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px 16px', background:'linear-gradient(160deg,#050B1A 0%,#081326 100%)', position:'relative', minHeight:'100vh' }}>
        <div style={{ position:'absolute', top:'18%', right:'8%', width:220, height:220, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,0.09) 0%,transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:'15%', left:'5%', width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,rgba(139,92,246,0.08) 0%,transparent 70%)', pointerEvents:'none' }}/>

        <motion.div initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45, ease:'easeOut' }}
          style={{ width:'100%', maxWidth:420, position:'relative', zIndex:1 }}>

          {/* Mobile logo */}
          <div className="ml-only" style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:64, height:64, borderRadius:18, background:'linear-gradient(135deg,#4f46e5,#7c3aed)', boxShadow:'0 0 32px rgba(99,102,241,0.5)', marginBottom:12 }}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
                <rect x="12" y="4" width="8" height="24" rx="2.5" fill="white"/>
                <rect x="4" y="12" width="24" height="8" rx="2.5" fill="white"/>
              </svg>
            </div>
            <h1 style={{ fontSize:24, fontWeight:800, background:'linear-gradient(135deg,#fff,#a5b4fc)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', marginBottom:4 }}>MediERP</h1>
            <p style={{ color:'rgba(165,180,252,0.6)', fontSize:13 }}>Pharma + Accounting System</p>
          </div>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div key="toast" initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, marginBottom:12, background:'rgba(16,185,129,0.11)', border:'1px solid rgba(16,185,129,0.28)', color:'#6ee7b7', fontSize:13 }}>
                <CheckCircle2 size={14}/> {toast}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Card */}
          <div style={{ borderRadius:24, overflow:'hidden', background:'rgba(255,255,255,0.03)', border:'1.5px solid rgba(255,255,255,0.08)', backdropFilter:'blur(24px)', boxShadow:'0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            {/* Gradient top stripe */}
            <div style={{ height:3, background:'linear-gradient(90deg,#4f46e5,#7c3aed,#ec4899)' }}/>

            {/* Mode tabs */}
            <div style={{ display:'flex', gap:6, padding:'16px 20px 12px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.14)' }}>
              <ModeTab active={mode==='password'} label="Password" icon={<LogIn size={14}/>} onClick={()=>switchMode('password')}/>
              <ModeTab active={mode==='otp'} label="OTP Login" icon={<ShieldCheck size={14}/>} onClick={()=>switchMode('otp')}/>
            </div>

            <AnimatePresence mode="wait">

              {/* PASSWORD */}
              {mode==='password' && (
                <motion.div key="pw" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} transition={{ duration:0.18 }} style={{ padding:'24px 24px 20px' }}>
                  <div style={{ marginBottom:22 }}>
                    <h2 style={{ color:'#fff', fontSize:18, fontWeight:700, marginBottom:4 }}>Welcome back</h2>
                    <p style={{ color:'rgba(255,255,255,0.32)', fontSize:13 }}>Sign in to your MediERP account</p>
                  </div>

                  {pwErr && <Err msg={pwErr}/>}

                  <form onSubmit={handleSubmit(onPasswordSubmit)} style={{ display:'flex', flexDirection:'column', gap:16 }}>
                    <div>
                      <FL>Email address</FL>
                      <div style={{ position:'relative' }}>
                        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.45)', display:'flex', pointerEvents:'none' }}><Mail size={15}/></span>
                        <input type="email" placeholder="you@company.com" className="gi"
                          style={{ ...IS, paddingLeft:42, paddingRight:16 }} {...register('email')}/>
                      </div>
                      {errors.email && <p style={{ color:'#f87171', fontSize:11, marginTop:4 }}>{errors.email.message}</p>}
                    </div>

                    <div>
                      <FL>Password</FL>
                      <div style={{ position:'relative' }}>
                        <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.45)', display:'flex', pointerEvents:'none' }}><Lock size={15}/></span>
                        <input type={showPw?'text':'password'} placeholder="••••••••" className="gi"
                          style={{ ...IS, paddingLeft:42, paddingRight:48 }} {...register('password')}/>
                        <button type="button" onClick={()=>setShowPw(v=>!v)}
                          style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.32)', display:'flex', padding:0 }}>
                          {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                        </button>
                      </div>
                      {errors.password && <p style={{ color:'#f87171', fontSize:11, marginTop:4 }}>{errors.password.message}</p>}
                    </div>

                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', color:'rgba(255,255,255,0.4)', fontSize:13 }}>
                        <input type="checkbox" style={{ accentColor:'#6366f1', width:14, height:14 }}/> Remember me
                      </label>
                      <button type="button" style={{ background:'none', border:'none', cursor:'pointer', color:'#a5b4fc', fontSize:13, fontWeight:500 }}>
                        Forgot password?
                      </button>
                    </div>

                    <GlowBtn type="submit" loading={isSubmitting}>
                      {!isSubmitting && <><LogIn size={16}/> Sign In</>}
                    </GlowBtn>
                  </form>

                  <div style={{ marginTop:18, textAlign:'center', color:'rgba(255,255,255,0.28)', fontSize:13 }}>
                    No password?{' '}
                    <button type="button" onClick={()=>switchMode('otp')}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#a5b4fc', fontWeight:600, fontSize:13 }}>
                      Sign in with OTP
                    </button>
                  </div>
                </motion.div>
              )}

              {/* OTP */}
              {mode==='otp' && (
                <motion.div key="otp-mode" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-10 }} transition={{ duration:0.18 }}>
                  <AnimatePresence mode="wait">

                    {otpStep==='select' && (
                      <motion.div key="otp-sel" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} transition={{ duration:0.18 }} style={{ padding:'24px 24px 20px' }}>
                        <div style={{ marginBottom:20 }}>
                          <h2 style={{ color:'#fff', fontSize:18, fontWeight:700, marginBottom:4 }}>OTP Login</h2>
                          <p style={{ color:'rgba(255,255,255,0.32)', fontSize:13 }}>Choose how to receive your one-time code</p>
                        </div>
                        {otpErr && <Err msg={otpErr}/>}

                        <div style={{ display:'flex', gap:10, marginBottom:20 }}>
                          {([
                            { ch:'whatsapp', label:'WhatsApp', icon:<MessageCircle size={15}/>, ac:'#10b981', bg:'rgba(16,185,129,0.11)', br:'rgba(16,185,129,0.28)' },
                            { ch:'email',    label:'Email',    icon:<Mail size={15}/>,          ac:'#60a5fa', bg:'rgba(96,165,250,0.11)',  br:'rgba(96,165,250,0.28)' },
                          ] as const).map(({ ch, label, icon, ac, bg, br }) => (
                            <button key={ch} type="button" onClick={()=>setOtpCh(ch)} style={{
                              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                              padding:'10px 12px', borderRadius:12, cursor:'pointer',
                              background:otpChannel===ch?bg:'rgba(255,255,255,0.03)',
                              border:`1.5px solid ${otpChannel===ch?br:'rgba(255,255,255,0.08)'}`,
                              color:otpChannel===ch?ac:'rgba(255,255,255,0.32)',
                              fontSize:13, fontWeight:600, transition:'all 0.2s',
                            }}>
                              {icon} {label}
                            </button>
                          ))}
                        </div>

                        <form onSubmit={handleSendOTP} style={{ display:'flex', flexDirection:'column', gap:16 }}>
                          {otpChannel==='whatsapp' ? (
                            <div>
                              <FL>Phone Number</FL>
                              <div style={{ position:'relative' }}>
                                <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.45)', display:'flex', pointerEvents:'none' }}><Phone size={15}/></span>
                                <span style={{ position:'absolute', left:40, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.3)', fontSize:13, pointerEvents:'none', userSelect:'none' }}>+977</span>
                                <input type="tel" inputMode="tel" autoFocus autoComplete="tel" placeholder="98XXXXXXXX" className="gi"
                                  style={{ ...IS, paddingLeft:86 }} value={phoneInput} onChange={e=>setPhoneInput(e.target.value)}/>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <FL>Email Address</FL>
                              <div style={{ position:'relative' }}>
                                <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'rgba(165,180,252,0.45)', display:'flex', pointerEvents:'none' }}><Mail size={15}/></span>
                                <input type="email" inputMode="email" autoFocus autoComplete="email" placeholder="you@company.com" className="gi"
                                  style={{ ...IS, paddingLeft:42, paddingRight:16 }} value={emailInput} onChange={e=>setEmailInput(e.target.value)}/>
                              </div>
                            </div>
                          )}
                          <GlowBtn type="submit" loading={otpLoading} disabled={!phoneInput.trim()&&!emailInput.trim()}>
                            {!otpLoading && (otpChannel==='whatsapp' ? <><MessageCircle size={16}/>Send via WhatsApp</> : <><Mail size={16}/>Send via Email</>)}
                          </GlowBtn>
                        </form>
                      </motion.div>
                    )}

                    {otpStep==='verify' && (
                      <motion.div key="otp-ver" initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-20 }} transition={{ duration:0.18 }} style={{ padding:'20px 24px 24px' }}>
                        <button type="button" onClick={()=>{ setOtpStep('select'); setOtp('') }}
                          style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.32)', fontSize:12, marginBottom:18, padding:0 }}>
                          <ArrowLeft size={13}/> Back
                        </button>

                        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:22 }}>
                          <div style={{ width:44, height:44, borderRadius:12, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:otpChannel==='whatsapp'?'rgba(16,185,129,0.11)':'rgba(96,165,250,0.11)', border:`1px solid ${otpChannel==='whatsapp'?'rgba(16,185,129,0.28)':'rgba(96,165,250,0.28)'}` }}>
                            {otpChannel==='whatsapp' ? <MessageCircle size={20} color="#10b981"/> : <Mail size={20} color="#60a5fa"/>}
                          </div>
                          <div>
                            <h2 style={{ color:'#fff', fontSize:16, fontWeight:700, marginBottom:3 }}>Enter your code</h2>
                            <p style={{ color:'rgba(255,255,255,0.32)', fontSize:12 }}>
                              Sent via {otpChannel==='whatsapp'?'WhatsApp':'Email'} to{' '}
                              <span style={{ color:'rgba(165,180,252,0.8)', fontWeight:600 }}>{maskDest(destination)}</span>
                            </p>
                          </div>
                        </div>

                        {otpErr && <Err msg={otpErr}/>}

                        <div style={{ marginBottom:20 }}>
                          <p style={{ textAlign:'center', marginBottom:14, fontSize:11, fontWeight:600, letterSpacing:'0.6px', textTransform:'uppercase', color:'rgba(165,180,252,0.6)' }}>6-digit code</p>
                          <OTPBoxes value={otp} onChange={setOtp} disabled={otpLoading}/>
                        </div>

                        <GlowBtn loading={otpLoading} disabled={otp.length!==6} onClick={handleVerifyOTP}>
                          {!otpLoading && <><ShieldCheck size={16}/> Verify & Sign In</>}
                        </GlowBtn>

                        <div style={{ textAlign:'center', marginTop:16 }}>
                          {timer > 0 ? (
                            <p style={{ color:'rgba(255,255,255,0.28)', fontSize:13 }}>
                              Resend in <span style={{ color:'#a5b4fc', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>0:{String(timer).padStart(2,'0')}</span>
                            </p>
                          ) : (
                            <button type="button" onClick={handleResend} disabled={otpLoading}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#a5b4fc', fontSize:13, fontWeight:600, display:'inline-flex', alignItems:'center', gap:6, opacity:otpLoading?0.5:1 }}>
                              {otpLoading ? <Spinner size={13}/> : <RefreshCw size={13}/>} Resend OTP
                            </button>
                          )}
                          <p style={{ color:'rgba(255,255,255,0.18)', fontSize:11, marginTop:4 }}>Code expires in 5 minutes</p>
                        </div>
                      </motion.div>
                    )}

                  </AnimatePresence>
                </motion.div>
              )}

            </AnimatePresence>

            {/* Footer */}
            <div style={{ padding:'14px 24px 20px', textAlign:'center', borderTop:'1px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.1)' }}>
              <p style={{ color:'rgba(255,255,255,0.28)', fontSize:13 }}>
                Don't have an account?{' '}
                <Link to={PATHS.SIGNUP} style={{ color:'#a5b4fc', fontWeight:600, textDecoration:'none' }}>Create account</Link>
              </p>
            </div>
          </div>

          <p style={{ textAlign:'center', color:'rgba(255,255,255,0.15)', fontSize:11, marginTop:16 }}>Demo: admin@demo.com / admin123</p>
        </motion.div>
      </div>
    </div>
  )
}
