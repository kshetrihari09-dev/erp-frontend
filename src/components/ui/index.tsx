import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn, statusColor } from '@/utils'

// ─── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'success'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant
  size?:     ButtonSize
  loading?:  boolean
  icon?:     ReactNode
  iconRight?: ReactNode
}

const btnVariants: Record<ButtonVariant, string> = {
  primary:   'bg-brand text-white hover:bg-brand-dark shadow-sm',
  secondary: 'bg-[var(--surface-3)] text-[var(--text-2)] hover:bg-[var(--border)] border border-[var(--border)]',
  danger:    'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200',
  ghost:     'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]',
  outline:   'border border-[var(--border-2)] text-[var(--text-2)] hover:border-brand hover:text-brand bg-transparent',
  success:   'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200',
}
const btnSizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs rounded-md gap-1.5',
  md: 'h-8 px-4 text-sm rounded-lg gap-2',
  lg: 'h-10 px-5 text-sm rounded-lg gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', loading, icon, iconRight, children, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        btnVariants[variant], btnSizes[size], className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 16 : 14} /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
)
Button.displayName = 'Button'

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?:   string
  error?:   string
  prefix?:  ReactNode
  suffix?:  ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, prefix, suffix, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">{label}</label>}
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-[var(--text-4)] text-sm flex items-center">{prefix}</span>}
        <input
          ref={ref}
          className={cn(
            'erp-input',
            prefix && 'pl-8',
            suffix && 'pr-8',
            error && 'border-red-400 focus:border-red-500',
            className
          )}
          {...props}
        />
        {suffix && <span className="absolute right-3 text-[var(--text-4)] text-sm flex items-center">{suffix}</span>}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?:   string
  error?:   string
  options:  { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">{label}</label>}
      <select
        ref={ref}
        className={cn('erp-input', error && 'border-red-400', className)}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
)
Select.displayName = 'Select'

// ─── Textarea ─────────────────────────────────────────────────────────────────
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }>(
  ({ label, error, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">{label}</label>}
      <textarea
        ref={ref}
        className={cn('erp-input resize-none', error && 'border-red-400', className)}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
)
Textarea.displayName = 'Textarea'

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ status, children, className }: { status?: string; children?: ReactNode; className?: string }) {
  const cls = status ? statusColor(status) : ''
  return (
    <span className={cn('badge', cls, className)}>
      {children || status}
    </span>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn('animate-spin text-current', className)}
      width={size} height={size} viewBox="0 0 24 24" fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity=".25"/>
      <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className, padding = true }: { children: ReactNode; className?: string; padding?: boolean }) {
  return (
    <div className={cn('bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-card', padding && 'p-5', className)}>
      {children}
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label:    string
  value:    string
  sub?:     string
  color?:   string
  icon?:    ReactNode
  onClick?: () => void
}

export function StatCard({ label, value, sub, color = 'var(--brand)', icon, onClick }: StatCardProps) {
  return (
    <div
      className={cn('stat-card', onClick && 'cursor-pointer hover:border-brand/40')}
      onClick={onClick}
    >
      <div className="stat-top" style={{ background: color }} />
      {icon && <div className="mb-2" style={{ color }}>{icon}</div>}
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function Empty({ message = 'No data found', icon }: { message?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-[var(--text-4)]">
      <div className="text-3xl opacity-30">{icon || '📭'}</div>
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ w = '100%', h = 14, className }: { w?: string | number; h?: number; className?: string }) {
  return (
    <div
      className={cn('skel rounded', className)}
      style={{ width: w, height: h }}
    />
  )
}

export function SkeletonRows({ cols = 6, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-3 py-3">
              <Skeleton w={j === 0 ? '80%' : '60%'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ─── Alert / Flash ────────────────────────────────────────────────────────────
type AlertType = 'success' | 'danger' | 'warning' | 'info'

export function Alert({ type, message, onClose }: { type: AlertType; message: string; onClose?: () => void }) {
  return (
    <div className={`alert alert-${type} flex items-center gap-2`}>
      <span className="flex-1 text-sm">{message}</span>
      {onClose && (
        <button onClick={onClose} className="ml-auto opacity-60 hover:opacity-100 text-inherit leading-none p-0.5">✕</button>
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  open:      boolean
  onClose:   () => void
  title:     string
  children:  ReactNode
  size?:     'sm' | 'md' | 'lg' | 'xl'
  footer?:   ReactNode
}

const modalSizes = {
  sm:  'max-w-md',
  md:  'max-w-lg',
  lg:  'max-w-2xl',
  xl:  'max-w-4xl',
}

export function Modal({ open, onClose, title, children, size = 'md', footer }: ModalProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ animation: 'fadeIn .15s ease' }}
    >
      <div
        className={cn(
          'bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-modal w-full overflow-hidden flex flex-col',
          'max-h-[90vh]',
          modalSizes[size]
        )}
        style={{ animation: 'slideUp .2s ease' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-[15px] text-[var(--text)]">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-4)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors text-[16px] leading-none"
          >
            ✕
          </button>
        </div>
        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-end gap-2 bg-[var(--surface-2)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
interface Tab { id: string; label: string; icon?: ReactNode; badge?: number }

export function Tabs({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={cn('tab', active === t.id && 'active')}
          onClick={() => onChange(t.id)}
        >
          {t.icon && <span className="flex items-center">{t.icon}</span>}
          {t.label}
          {t.badge !== undefined && t.badge > 0 && (
            <span className="ml-1.5 bg-red-500 text-white text-[9px] font-mono px-1.5 py-0.5 rounded-full leading-none">
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────
interface PaginationProps {
  page:       number
  total:      number
  limit?:     number
  onChange:   (page: number) => void
}

export function Pagination({ page, total, limit = 20, onChange }: PaginationProps) {
  const pages = Math.ceil(total / limit) || 1
  if (pages <= 1 && total <= limit) return null
  const start = Math.max(1, Math.min(pages - 4, page - 2))
  const pageNums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i).filter((p) => p <= pages)
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)]">
      <span className="text-xs text-[var(--text-4)] font-mono">{total} records</span>
      <div className="flex items-center gap-1">
        <button className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
        {pageNums.map((p) => (
          <button
            key={p}
            className={cn('page-btn', page === p && 'active')}
            onClick={() => onChange(p)}
          >{p}</button>
        ))}
        <button className="page-btn" disabled={page >= pages} onClick={() => onChange(page + 1)}>›</button>
      </div>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-bold text-[var(--text-4)] uppercase tracking-widest mb-2.5 mt-4 pb-1.5 border-b border-[var(--border)]">
      {children}
    </div>
  )
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px bg-[var(--border)] my-3', className)} />
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────
export function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <span
        className={cn(
          'relative inline-flex items-center w-10 h-5.5 rounded-full transition-colors duration-200 flex-shrink-0',
          checked ? 'bg-brand' : 'bg-[var(--border-2)]'
        )}
        style={{ height: 22, width: 40 }}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            'absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-all duration-200',
          )}
          style={{
            width: 18, height: 18,
            left: checked ? 20 : 2,
            transition: 'left .2s',
          }}
        />
      </span>
      {label && <span className="text-sm text-[var(--text-2)] font-medium">{label}</span>}
    </label>
  )
}

// ─── Search Input ─────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-4)] text-sm pointer-events-none">⌕</span>
      <input
        className="erp-input pl-8 pr-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, danger = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message?: string; danger?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={() => { onConfirm(); onClose() }}>
            Confirm
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--text-2)]">{message || 'Are you sure you want to proceed?'}</p>
    </Modal>
  )
}

// ─── Table wrapper ────────────────────────────────────────────────────────────
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="erp-table">{children}</table>
    </div>
  )
}
