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
    { name: STORAGE_KEYS.TEMPLATE }
  )
)

export default useTemplateStore
