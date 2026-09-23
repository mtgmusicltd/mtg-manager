/*
  Four bipolar bars, one per voice A–D, growing up or down from a centre
  line. Height = |semitones| / 12 of half the box (so an octave fills it;
  anything beyond is clamped). Height changes animate via CSS (350 ms
  ease-out), and prefers-reduced-motion switches the animation off.
*/

const LABELS = ['A', 'B', 'C', 'D']

export default function VoiceBars({
  values, height = 40, showLabels = false, showValues = false,
}: { values: readonly number[]; height?: number; showLabels?: boolean; showValues?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="vbars" style={{ height }} aria-hidden="true">
        {values.map((v, i) => {
          const pct = Math.min(1, Math.abs(v) / 12) * 50
          return (
            <div key={i} className="vbar">
              <div
                className={`vbar-fill ${v >= 0 ? 'vbar-fill-up' : 'vbar-fill-down'} ${v === 0 ? 'vbar-fill-off' : ''}`}
                style={{ height: v === 0 ? 2 : `${pct}%` }}
              />
            </div>
          )
        })}
      </div>
      {(showLabels || showValues) && (
        <div className="flex gap-1.5">
          {values.map((v, i) => (
            <div key={i} className="flex-1 min-w-0 text-center leading-tight">
              {showLabels && (
                <div className="text-[11px] font-semibold" style={{ color: v !== 0 ? 'var(--color-lime)' : 'var(--color-muted)', letterSpacing: '0.8px' }}>
                  {LABELS[i]}
                </div>
              )}
              {showValues && (
                <div className="text-sm" style={{ fontFamily: 'var(--font-mono)', color: v !== 0 ? 'var(--color-text)' : 'var(--color-muted)' }}>
                  {v > 0 ? `+${v}` : v}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
