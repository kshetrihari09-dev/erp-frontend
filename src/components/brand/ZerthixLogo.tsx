import { useId } from 'react'

/**
 * Zerthix brand mark: the ribbon "Z" on a white rounded tile (reads on light and dark surfaces alike).
 * Pure inline SVG — no network request, works offline. Gradient ids are unique per instance so several
 * logos can be on screen at once (sidebar + login, etc.).
 */
export default function ZerthixLogo({ size = 40, tile = true, className, style }: {
  size?: number; tile?: boolean; className?: string; style?: React.CSSProperties
}) {
  const u = 'zx' + useId().replace(/[^a-zA-Z0-9]/g, '')
  // tile: full 1024 canvas with the mark scaled up slightly; no tile: just the mark, tightly cropped
  const viewBox = tile ? '0 0 1024 1024' : '470 150 600 480'
  return (
    <svg width={size} height={tile ? size : size * 0.8} viewBox={viewBox} className={className} style={style} role="img" aria-label="Zerthix">
      <defs>
<linearGradient id={`${u}-top`} x1="500" y1="250" x2="1040" y2="190" gradientUnits="userSpaceOnUse">
  <stop offset="0" stopColor="#2A1A9E"/><stop offset=".30" stopColor="#7A2A9A"/><stop offset=".58" stopColor="#F0603C"/><stop offset=".78" stopColor="#FF8A2A"/><stop offset="1" stopColor="#FFC926"/></linearGradient>
<linearGradient id={`${u}-diag`} x1="800" y1="300" x2="540" y2="600" gradientUnits="userSpaceOnUse">
  <stop offset="0" stopColor="#1E1180"/><stop offset=".5" stopColor="#4F26C8"/><stop offset="1" stopColor="#8A2BE2"/></linearGradient>
<linearGradient id={`${u}-diagShade`} x1="780" y1="0" x2="940" y2="0" gradientUnits="userSpaceOnUse">
  <stop offset="0" stopColor="#3A0A50" stopOpacity="0"/><stop offset="1" stopColor="#4A0C3C" stopOpacity=".5"/></linearGradient>
<linearGradient id={`${u}-bot`} x1="560" y1="600" x2="1040" y2="480" gradientUnits="userSpaceOnUse">
  <stop offset="0" stopColor="#FF5A1F"/><stop offset=".45" stopColor="#FF8A28"/><stop offset="1" stopColor="#FFC62A"/></linearGradient>
<linearGradient id={`${u}-botShade`} x1="560" y1="590" x2="700" y2="490" gradientUnits="userSpaceOnUse">
  <stop offset="0" stopColor="#5A0F1A" stopOpacity=".85"/><stop offset="1" stopColor="#7A1A1A" stopOpacity="0"/></linearGradient>
<clipPath id={`${u}-cBot`}><path d="M742 474 H1043 L977 566 Q946 610 898 610 H528 Z"/></clipPath>
<clipPath id={`${u}-cDiag`}><path d="M760 298 H918 Q948 300 936 328 Q916 356 896 368 L546 605 Q520 618 504 596 Q482 560 500 520 Q514 492 536 472 Z"/></clipPath>
</defs>
      {tile && <rect width="1024" height="1024" rx="230" fill="#FFFFFF" />}
      <g transform={tile ? 'translate(512 512) scale(1.3) translate(-768 -392)' : undefined}>
        
<path d="M497 298 L551 214 Q578 172 624 172 H1038 Q1050 172 1043 186 L941 322 Q936 300 918 298 Z" fill={`url(#${u}-top)`}/>
<path d="M742 474 H1043 L977 566 Q946 610 898 610 H528 Z" fill={`url(#${u}-bot)`}/>
<g clipPath={`url(#${u}-cBot)`}><path d="M520 612 L560 612 L760 470 L700 470 Z" fill={`url(#${u}-botShade)`}/></g>
<path d="M760 298 H918 Q948 300 936 328 Q916 356 896 368 L546 605 Q520 618 504 596 Q482 560 500 520 Q514 492 536 472 Z" fill={`url(#${u}-diag)`}/>
<g clipPath={`url(#${u}-cDiag)`}><rect x="780" y="290" width="170" height="90" fill={`url(#${u}-diagShade)`}/></g>

      </g>
    </svg>
  )
}
