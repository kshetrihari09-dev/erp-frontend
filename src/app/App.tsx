import { Providers } from './providers'
import Router from './Router'
import DevBadge from '@/components/DevBadge'
import OfflineStatusIndicator from '@/components/offline/OfflineStatusIndicator'
import ServerGate from '@/modules/connect/ServerGate'
import '../styles/globals.css'

export default function App() {
  return (
    <ServerGate>
      <Providers>
        <Router />
        <OfflineStatusIndicator />
        <DevBadge />
      </Providers>
    </ServerGate>
  )
}
