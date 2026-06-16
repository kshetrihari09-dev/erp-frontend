import { Providers } from './providers'
import Router from './Router'
import DevBadge from '@/components/DevBadge'
import '../styles/globals.css'

export default function App() {
  return (
    <Providers>
      <Router />
      <DevBadge />
    </Providers>
  )
}
