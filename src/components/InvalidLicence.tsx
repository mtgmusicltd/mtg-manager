import { Icon, Wordmark } from './ui'

/* Shown when the stored key is reported revoked (HTTP 410) at start-up. */
export default function InvalidLicence() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'var(--color-navy)', WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="w-full max-w-md px-6 fade-up" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex justify-center mb-8 opacity-60">
          <Wordmark size="lg" />
        </div>

        <div className="card p-7 text-center" style={{ borderColor: 'rgba(224,82,82,0.35)' }}>
          <div
            className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(224,82,82,0.12)', color: 'var(--color-danger)' }}
          >
            <Icon name="lock" size={22} />
          </div>
          <h2 className="text-lg font-bold m-0 mb-2" style={{ color: 'var(--color-text)' }}>
            This licence is no longer valid
          </h2>
          <p className="text-sm m-0 mb-4 leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            The key saved on this computer has been revoked, or this computer is no longer registered to it.
          </p>
          <p className="text-sm m-0" style={{ color: 'var(--color-text-soft)' }}>
            Get in touch with MIDI Trumpet Guy and we will sort it out.
          </p>
        </div>
      </div>
    </div>
  )
}
