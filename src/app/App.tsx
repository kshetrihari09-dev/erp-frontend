import { Providers } from './providers'
import Router from './Router'
import DevBadge from '@/components/DevBadge'
import OfflineStatusIndicator from '@/components/offline/OfflineStatusIndicator'
import '../styles/globals.css'

export default function App() {
  return (
    <Providers>
      <Router />
      <OfflineStatusIndicator />
      <DevBadge />
    </Providers>
  )
}
