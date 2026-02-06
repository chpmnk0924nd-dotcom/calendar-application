import { useMemo } from 'react'
import { cn } from '../lib/cn'

export type TimeZoneOption = {
  id: string
  label: string
  short: string
}

const US_TZ: TimeZoneOption[] = [
  { id: 'America/New_York', label: 'Eastern', short: 'ET' },
  { id: 'America/Chicago', label: 'Central', short: 'CT' },
  { id: 'America/Denver', label: 'Mountain', short: 'MT' },
  { id: 'America/Phoenix', label: 'Arizona', short: 'AZ' },
  { id: 'America/Los_Angeles', label: 'Pacific', short: 'PT' },
  { id: 'America/Anchorage', label: 'Alaska', short: 'AK' },
  { id: 'Pacific/Honolulu', label: 'Hawaii', short: 'HI' },
]

export type TimeZoneSwitcherProps = {
  value: string
  onChange: (timeZone: string) => void
  className?: string
}

export function TimeZoneSwitcher(props: TimeZoneSwitcherProps) {
  const { value, onChange, className } = props

  const options = useMemo(() => US_TZ, [])
  const isLocal = value === 'local'

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <button
        type="button"
        onClick={() => onChange('local')}
        className={cn(
          'rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition',
          isLocal
            ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100'
            : 'border-slate-800/60 bg-slate-950/30 text-slate-300 hover:bg-slate-900/40 hover:text-slate-100',
        )}
        title="Use your device timezone"
      >
        Local
      </button>

      {options.map((tz) => {
        const active = value === tz.id
        return (
          <button
            key={tz.id}
            type="button"
            onClick={() => onChange(tz.id)}
            className={cn(
              'rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition',
              active
                ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100'
                : 'border-slate-800/60 bg-slate-950/30 text-slate-300 hover:bg-slate-900/40 hover:text-slate-100',
            )}
            title={tz.label}
          >
            {tz.short}
          </button>
        )
      })}
    </div>
  )
}
