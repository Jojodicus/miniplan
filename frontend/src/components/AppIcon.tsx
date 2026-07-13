/** App-Icon (Kalenderblatt mit Kreuz) für Platzierungen mit eigenem Hintergrund (z.B. der
 * `bg-pine`-Badge in Header/Login) - passend zum SVG-Favicon (`public/favicon.svg`), dort inkl.
 * eigenem Badge-Hintergrund. */
export function AppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <clipPath id="app-icon-card-clip">
          <rect x="5.5" y="6.5" width="13" height="12.5" rx="2" />
        </clipPath>
      </defs>
      <rect x="8.5" y="4.25" width="1.5" height="4" rx="0.75" fill="currentColor" opacity=".7" />
      <rect x="14" y="4.25" width="1.5" height="4" rx="0.75" fill="currentColor" opacity=".7" />
      <g clipPath="url(#app-icon-card-clip)">
        <rect x="5.5" y="6.5" width="13" height="12.5" fill="currentColor" opacity=".95" />
        <rect x="5.5" y="6.5" width="13" height="4" fill="currentColor" opacity=".55" />
      </g>
      <circle cx="8.75" cy="13.5" r="0.7" fill="currentColor" opacity=".5" />
      <circle cx="12" cy="13.5" r="0.7" fill="currentColor" opacity=".5" />
      <circle cx="15.25" cy="13.5" r="0.7" fill="currentColor" opacity=".5" />
      <rect x="11.3" y="11.7" width="1.4" height="5.1" rx=".7" fill="currentColor" />
      <rect x="9.45" y="13.55" width="5.1" height="1.4" rx=".7" fill="currentColor" />
    </svg>
  )
}
