import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePreferences } from '@/hooks/useQuery'
import { settingsAPI } from '@/services/api'
import { QK } from '@/constants'
import useUIStore from '@/store/uiStore'
import type { CompanyPreferences } from '@/types'
import { useSensitiveConfirm } from './useSensitiveConfirm'

/** Loads one section of companies.settings, tracks local edits, and saves
 *  it back (merged server-side, so other sections/tabs are untouched).
 *  Bakes in the sensitive-action password-confirm retry automatically. */
export function usePreferenceSection<K extends keyof CompanyPreferences>(section: K, savedMessage = 'Settings saved') {
  const { data: prefs, isLoading } = usePreferences()
  const { success, error } = useUIStore()
  const qc = useQueryClient()
  const { runWithConfirm, dialog } = useSensitiveConfirm()
  const [form, setForm] = useState<CompanyPreferences[K] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (prefs?.[section]) setForm(prefs[section])
  }, [prefs, section])

  const set = <Key extends keyof CompanyPreferences[K]>(key: Key, value: CompanyPreferences[K][Key]) =>
    setForm(f => (f ? { ...f, [key]: value } : f))

  async function save() {
    if (!form) return
    setSaving(true)
    try {
      await runWithConfirm(confirmPassword =>
        settingsAPI.updatePreferences({ [section]: form, ...(confirmPassword ? { confirmPassword } : {}) } as any)
      )
      qc.invalidateQueries({ queryKey: [QK.PREFERENCES] })
      success(savedMessage)
    } catch (e: any) {
      error('Save failed', e?.response?.data?.message)
    } finally {
      setSaving(false)
    }
  }

  return { form, set, save, saving, loading: isLoading || !form, dialog }
}
