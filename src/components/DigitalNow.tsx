import { useMemo } from 'react'

export type DigitalNowProps = {
  now: Date
  timeZone?: string
  className?: string
}

function formatTime(d: Date, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone && timeZone !== 'local' ? { timeZone } : null),
  }).format(d)
}

function formatDate(d: Date, timeZone?: string) {
  // “Digital” numeric date + weekday, locale-aware.
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone && timeZone !== 'local' ? { timeZone } : null),
  }).format(d)
}

function formatTzShort(d: Date, timeZone?: string) {
  if (!timeZone || timeZone === 'local') return ''
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: 'short',
    hour: '2-digit',
  })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value ?? ''
}

export function DigitalNow(props: DigitalNowProps) {
  const { now, timeZone, className } = props

  const timeLabel = useMemo(() => formatTime(now, timeZone), [now, timeZone])
  const dateLabel = useMemo(() => formatDate(now, timeZone), [now, timeZone])
  const tzShort = useMemo(() => formatTzShort(now, timeZone), [now, timeZone])

  const dateGlowStyle = useMemo(
    () => ({
      textShadow:
        '0 0 10px rgba(34, 211, 238, 0.28), 0 0 22px rgba(34, 211, 238, 0.18), 0 0 28px rgba(168, 85, 247, 0.16)',
    }),
    [],
  )

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Now</div>
          <div
            className="mt-0.5 truncate text-xs text-slate-300"
            style={dateGlowStyle}
          >
            {dateLabel}
          </div>
        </div>

        <div className="text-right">
          <div className="tabular-nums font-mono text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">
            {timeLabel}
          </div>
          {tzShort ? <div className="-mt-0.5 text-[11px] text-slate-400">{tzShort}</div> : null}
        </div>
      </div>

      <div className="mt-2 h-px w-full bg-gradient-to-r from-transparent via-slate-700/40 to-transparent" />
    </div>
  )
}
