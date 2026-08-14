import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queryClient'
import { OfflineProvider } from '@/offline/OfflineProvider'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <OfflineProvider>
        {children}
      </OfflineProvider>
    </QueryClientProvider>
  )
}
