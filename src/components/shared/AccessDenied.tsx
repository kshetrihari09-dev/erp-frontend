import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

/** Shown when a signed-in user opens a module their role/permissions do not cover (direct URL, bookmark, nested route). */
export default function AccessDenied({ title = 'Access denied', message, homeTo }: { title?: string; message?: string; homeTo?: string | null }) {
  return (
    <div className="flex items-center justify-center h-64 text-[var(--text-3)]" role="alert" data-testid="access-denied">
      <div className="text-center max-w-sm px-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--red-50)', color: 'var(--red)' }}>
          <ShieldAlert size={22} />
        </div>
        <p className="font-semibold text-[var(--text-2)]">{title}</p>
        <p className="text-sm mt-1">{message ?? "You don't have permission to view this page. Ask an administrator if you need access."}</p>
        {homeTo && <Link to={homeTo} className="inline-block mt-3 text-sm underline text-[var(--brand)]">Go to a page you can open</Link>}
      </div>
    </div>
  )
}
