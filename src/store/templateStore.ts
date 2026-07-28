import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { STORAGE_KEYS } from '@/constants'

export interface TemplateConfig {
  // Header
  showLogo:        boolean
  showCompanyName: boolean
  showAddress:     boolean
  showPhone:       boolean
  showPAN:         boolean
  // Document
  docTitle:        string
  showDateBS:      boolean
  // Columns
  showBatch:       boolean
  showExpiry:      boolean
  showBonus:       boolean
  showCC:          boolean
  // Footer
  showNotes:       boolean
  showSignature:   boolean
  showThankYou:    boolean
  thankYouMessage: string 
  // Style
  fontSize:        'small' | 'medium' | 'large'
  primaryColor:    string
  paperSize:       'A4' | 'thermal' | 'A5'
  // Printing (Settings → Printing)
  copies:          number          // how many copies usePrint() prints per click
  marginMM:        number          // page margin in millimeters
  footerText:      string          // small print line at the very bottom (separate from thankYouMessage)
  duplicateLabel:  string          // label shown on copies after the first (was hardcoded 'DUPLICATE')
}

export const DEFAULT_TPL: TemplateConfig = {
  showLogo:        true,
  showCompanyName: true,
  showAddress:     true,
  showPhone:       true,
  showPAN:         true,
  docTitle:        'INVOICE',
  showDateBS:      true,
  showBatch:       true,
  showExpiry:      true,
  showBonus:       true,
  showCC:          true,
  showNotes:       true,
  showSignature:   true,
  showThankYou:    true,
  thankYouMessage: 'Thank you for your business!',
  fontSize:        'medium',
  primaryColor:    '#1d4ed8',
  paperSize:       'A4',
  copies:          1,
  marginMM:        10,
  footerText:      '',
  duplicateLabel:  'DUPLICATE',
}

interface TemplateState {
  activeTemplate: TemplateConfig
  setTemplate: (t: Partial<TemplateConfig>) => void
  resetTemplate: () => void
}

const useTemplateStore = create<TemplateState>()(
  persist(
    (set) => ({
      activeTemplate: DEFAULT_TPL,
      setTemplate: (t) =>
        set((s) => ({ activeTemplate: { ...s.activeTemplate, ...t } })),
      resetTemplate: () => set({ activeTemplate: DEFAULT_TPL }),
    }),
    {
      name: STORAGE_KEYS.TEMPLATE,
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<TemplateState>),
        activeTemplate: { ...current.activeTemplate, ...(persisted as any)?.activeTemplate },
      }),
    }
  )
)

export default useTemplateStore
