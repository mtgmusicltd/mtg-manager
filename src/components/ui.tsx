import type { ReactNode } from 'react'

/*
  Small presentational primitives shared by every screen.
  No IPC, no state — styling only. All colours come from src/index.css tokens.
*/

// ─── Icons (inline so the renderer stays dependency-free) ────────────────────

type IconName =
  | 'keys' | 'chip' | 'settings' | 'usb' | 'plug' | 'check' | 'alert'
  | 'download' | 'upload' | 'save' | 'plus' | 'trash' | 'edit' | 'copy'
  | 'refresh' | 'chevron' | 'info' | 'lock' | 'sparkle'

const PATHS: Record<IconName, ReactNode> = {
  keys: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 10h18M9 10v10M15 10v10" /></>,
  chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  usb: <><path d="M12 22V8" /><circle cx="12" cy="5" r="2" /><path d="M8 12l4-4 4 4M7 16h2a2 2 0 0 0 2-2v-1M17 14h-2a2 2 0 0 1-2-2" /><rect x="6" y="15" width="3" height="3" /><circle cx="17" cy="13" r="1.5" /></>,
  plug: <><path d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0V8zM12 17v5" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  alert: <><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></>,
  edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  refresh: <><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></>,
  chevron: <path d="M6 9l6 6 6-6" />,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17z" /></>,
}

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

// ─── Layout helpers ──────────────────────────────────────────────────────────

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-6">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-6 ${className}`}>
      <h2 className="eyebrow mb-3">{title}</h2>
      {children}
    </section>
  )
}

// ─── Numbered steps ──────────────────────────────────────────────────────────

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3 m-0 p-0 list-none">
      {items.map((text, i) => (
        <li key={i} className="flex items-start gap-3">
          <span
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-px"
            style={{ background: 'rgba(200,211,0,0.12)', color: 'var(--color-lime)', fontFamily: 'var(--font)' }}
          >
            {i + 1}
          </span>
          <p className="text-sm m-0 leading-relaxed" style={{ color: 'var(--color-text-soft)' }}>{text}</p>
        </li>
      ))}
    </ol>
  )
}

export function Em({ children }: { children: ReactNode }) {
  return <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{children}</span>
}

export function Lime({ children }: { children: ReactNode }) {
  return <span className="font-semibold" style={{ color: 'var(--color-lime)' }}>{children}</span>
}

// ─── Empty state ─────────────────────────────────────────────────────────────

export function EmptyState({
  icon, title, description, children,
}: { icon: IconName; title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10 fade-up">
      <div className="relative flex items-center justify-center mb-6">
        <div className="absolute w-28 h-28 rounded-full animate-ping" style={{ background: 'rgba(200,211,0,0.06)', animationDuration: '2.4s' }} />
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'var(--color-navy-light)', border: '1px solid var(--color-navy-raised)', color: 'var(--color-muted)' }}>
          <Icon name={icon} size={30} />
        </div>
      </div>
      <h2 className="text-xl font-bold m-0 mb-2 text-center" style={{ color: 'var(--color-text)' }}>{title}</h2>
      {description && (
        <p className="text-sm m-0 mb-6 text-center max-w-md leading-relaxed" style={{ color: 'var(--color-muted)' }}>{description}</p>
      )}
      {children}
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function Modal({
  title, children, onClose, tone = 'default',
}: { title: string; children: ReactNode; onClose?: () => void; tone?: 'default' | 'danger' }) {
  return (
    <div
      className="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget && onClose) onClose() }}
    >
      <div
        className="modal fade-up"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={tone === 'danger' ? { borderColor: 'rgba(224,82,82,0.35)' } : undefined}
      >
        <h3 className="text-lg font-bold m-0 mb-3" style={{ color: 'var(--color-text)' }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

// ─── Brand ───────────────────────────────────────────────────────────────────

export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg'
  return (
    <div className={`flex items-center ${lg ? 'gap-4' : 'gap-3'}`}>
      <img src="./logo.png" alt="" className={`${lg ? 'w-14 h-14' : 'w-8 h-8'} object-contain`} draggable={false} />
      <div className="leading-none">
        <div
          className={lg ? 'text-[32px]' : 'text-[12px] uppercase'}
          style={{
            fontFamily: 'var(--font)',
            color: 'var(--color-lime)',
            fontWeight: lg ? 800 : 600,
            letterSpacing: lg ? '-1px' : '0.8px',
            lineHeight: 1.02,
          }}
        >
          MTG Manager
        </div>
        {lg && (
          <div className="text-sm mt-1.5" style={{ color: 'var(--color-muted)' }}>
            Companion app for the MTG MIDI Harmonizer
          </div>
        )}
      </div>
    </div>
  )
}
