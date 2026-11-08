import { useState } from 'react'
import { CalendarRange, Lock } from 'lucide-react'
import { useFiscalYears } from '@/hooks/useQuery'
import { useSelectedFiscalYear } from '@/hooks/useSelectedFiscalYear'
import useUIStore from '@/store/uiStore'
import type { FiscalYear } from '@/types'

const label = (y: FiscalYear) => y.name.replace(/^FY\s*/i, '')

/**
 * Top-bar fiscal-year dropdown. Lists the company's years with an Open / Closed indicator; choosing one is the ONLY way
 * the working year changes. A closed year can be selected (to view reports and history) — posting into it is refused by
 * the server. Renders nothing for a company with no fiscal years configured.
 */
export default function FiscalYearSelector() {
  const { data } = useFiscalYears()
  const { selectedId, select } = useSelectedFiscalYear()
  const { error: toastErr } = useUIStore()
  const [busy, setBusy] = useState(false)
  const years: FiscalYear[] = (Array.isArray(data) ? data : []) as FiscalYear[]
  if (!years.length) return null

  const current = years.find((y) => y.id === selectedId) ?? null
  const closed = !!current?.is_locked
  const change = async (id: string) => {
    setBusy(true)
    try { await select(id) }
    catch (e: any) { toastErr(e?.response?.data?.message || 'Could not switch fiscal year') }
    finally { setBusy(false) }
  }

  return (
    <label className="flex items-center gap-1.5" title={current ? `${current.start_date_ad} → ${current.end_date_ad}` : 'Select fiscal year'} data-testid="fy-selector">
      {closed ? <Lock size={14} className="text-[var(--text-3)]" /> : <CalendarRange size={14} className="text-[var(--text-3)]" />}
      <select
        className="input !py-1 !text-xs"
        style={{ minWidth: 150 }}
        value={current?.id ?? ''}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        aria-label="Fiscal year"
      >
        {!current && <option value="" disabled>Select fiscal year…</option>}
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {label(y)} · {y.is_locked ? 'Closed' : 'Open'}{y.is_default ? ' · Default' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
