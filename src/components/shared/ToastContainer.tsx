import { motion, AnimatePresence } from 'framer-motion'
import useUIStore from '@/store/uiStore'
import { cn } from '@/utils'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const icons = {
  success: <CheckCircle2 size={16} className="text-green-500" />,
  error:   <AlertTriangle size={16} className="text-red-500" />,
  warning: <AlertTriangle size={16} className="text-amber-500" />,
  info:    <Info size={16} className="text-blue-500" />,
}

const colors = {
  success: 'border-l-green-500 bg-[var(--surface)]',
  error:   'border-l-red-500 bg-[var(--surface)]',
  warning: 'border-l-amber-500 bg-[var(--surface)]',
  info:    'border-l-blue-500 bg-[var(--surface)]',
}

export default function ToastContainer() {
  const { toasts, removeToast } = useUIStore()

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 340 }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: .96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: .96 }}
            transition={{ duration: .2 }}
            className={cn(
              'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border border-[var(--border)]',
              'shadow-modal border-l-4',
              colors[t.type]
            )}
          >
            <div className="mt-0.5 flex-shrink-0">{icons[t.type]}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-[var(--text)] leading-tight">{t.title}</div>
              {t.message && <div className="text-xs text-[var(--text-3)] mt-0.5 leading-snug">{t.message}</div>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[var(--text-4)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors mt-0.5"
            >
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
