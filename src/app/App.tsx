import { useEffect } from 'react'
import { Providers } from './providers'
import Router from './Router'
import DevBadge from '@/components/DevBadge'
import OfflineStatusIndicator from '@/components/offline/OfflineStatusIndicator'
import ServerGate from '@/modules/connect/ServerGate'
import { unlockAudioOnFirstGesture } from '@/utils/beep'
import '../styles/globals.css'

export default function App() {
  // As early as possible — even before login — so the very first click
  // or keypress anywhere (realistically, the login button) unlocks audio
  // long before any reminder alarm needs to ring. See beep.ts's docblock.
  useEffect(() => unlockAudioOnFirstGesture(), [])

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
