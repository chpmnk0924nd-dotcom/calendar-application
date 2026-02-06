import { useEffect, useMemo, useState } from 'react'
import type { CalendarEvent } from '../types/calendar'
import { CATEGORY_COLORS } from '../lib/colors'
import { selectFilteredEvents, useCalendarStore } from '../store/useCalendarStore'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

export type TodayTimelineProps = {
  now?: Date
  showClock?: boolean
  timeZone?: string
}

type LaneSegment = {
  id: string
  title: string
  category: keyof typeof CATEGORY_COLORS
  leftPx: number
  widthPx: number
  row: number
  startsAt: Date
  endsAt: Date
}

const AXIS_STEP_MINUTES = 30
const AXIS_STEP_PX = 44
const AXIS_HEIGHT = 16

function startOfLocalDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfLocalDay(d: Date) {
  const x = startOfLocalDay(d)
  x.setDate(x.getDate() + 1)
  return x
}

function isValidDate(d: Date) {
  return Number.isFinite(d.getTime())
}

function localYmd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ymdInTimeZone(d: Date, timeZone?: string) {
  if (!timeZone || timeZone === 'local') return localYmd(d)

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)

  const y = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const m = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${day}`
}

function formatClockInTimeZone(d: Date, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone && timeZone !== 'local' ? { timeZone } : null),
  }).format(d)
}

function eventIsAllDay(e: CalendarEvent) {
  return Boolean(e.allDay) || (typeof e.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.start))
}

function approxEndFor(e: CalendarEvent, start: Date) {
  if (e.end) {
    const end = new Date(e.end)
    if (isValidDate(end)) return end
  }
  // A reasonable default so “single time” events still show up.
  return new Date(start.getTime() + 45 * 60 * 1000)
}

function format24hFromMinutes(minutesFromStartOfDay: number) {
  const total = ((Math.round(minutesFromStartOfDay) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function overlapsRange(startMs: number, endMs: number, rangeStartMs: number, rangeEndMs: number) {
  return endMs > rangeStartMs && startMs < rangeEndMs
}

export function TodayTimeline(props: TodayTimelineProps) {
  const events = useCalendarStore(selectFilteredEvents)

  const { now: externalNow, showClock = true, timeZone } = props

  const [internalNow, setInternalNow] = useState(() => new Date())
  const [reducedMotion, setReducedMotion] = useState(false)

  const now = externalNow ?? internalNow

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(mq.matches)
    update()

    // `addEventListener` is supported in modern browsers; `addListener` for older ones.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyMq = mq as any
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', update)
    else if (typeof anyMq.addListener === 'function') anyMq.addListener(update)

    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', update)
      else if (typeof anyMq.removeListener === 'function') anyMq.removeListener(update)
    }
  }, [])

  useEffect(() => {
    if (externalNow) return
    const id = window.setInterval(() => setInternalNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [externalNow])

  const {
    dayLabel,
    timeLabel,
    segments,
    allDayToday,
    nextUp,
    laneCount,
    axisWidthPx,
    axisTickCount,
  } = useMemo(() => {
    const tz = timeZone && timeZone !== 'local' ? timeZone : undefined
    const zNow = tz ? toZonedTime(now, tz) : now
    const dayStart = startOfLocalDay(zNow)
    const dayEnd = endOfLocalDay(zNow)
    const dayStartMs = dayStart.getTime()
    const dayEndMs = dayEnd.getTime()

    const axisTickCount = Math.round((24 * 60) / AXIS_STEP_MINUTES)
    const axisWidthPx = axisTickCount * AXIS_STEP_PX

    const dayLabel = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(timeZone && timeZone !== 'local' ? { timeZone } : null),
    }).format(now)

    const timeLabel = formatClockInTimeZone(now, timeZone)
    // (marker positioning uses pixel axis below)

    const todayYmd = ymdInTimeZone(now, timeZone)

    const allDayToday: CalendarEvent[] = []
    const timed: Array<{ e: CalendarEvent; startUtc: Date; endUtc: Date; startZ: Date; endZ: Date }> = []

    for (const e of events) {
      if (!e || typeof e.start !== 'string') continue

      if (eventIsAllDay(e)) {
        // Compare by local date. For date-only strings we can compare directly.
        if (e.start === todayYmd) allDayToday.push(e)
        else {
          const start = new Date(e.start)
          if (isValidDate(start) && ymdInTimeZone(start, timeZone) === todayYmd) allDayToday.push(e)
        }
        continue
      }

      const startUtc = new Date(e.start)
      if (!isValidDate(startUtc)) continue
      const endUtc = approxEndFor(e, startUtc)

      const startZ = tz ? toZonedTime(startUtc, tz) : startUtc
      const endZ = tz ? toZonedTime(endUtc, tz) : endUtc
      if (!overlapsRange(startZ.getTime(), endZ.getTime(), dayStartMs, dayEndMs)) continue

      timed.push({ e, startUtc, endUtc, startZ, endZ })
    }

    timed.sort((a, b) => a.startZ.getTime() - b.startZ.getTime() || b.endZ.getTime() - a.endZ.getTime())

    const maxLanes = 3
    const lanesEndMs = Array.from({ length: maxLanes }, () => dayStartMs)
    const segs: LaneSegment[] = []

    for (const { e, startZ, endZ } of timed) {
      const clampedStartMs = Math.max(startZ.getTime(), dayStartMs)
      const clampedEndMs = Math.min(endZ.getTime(), dayEndMs)

      // Ensure at least a visible sliver.
      const minMs = 10 * 60 * 1000
      const visibleEndMs = Math.max(clampedEndMs, Math.min(dayEndMs, clampedStartMs + minMs))

      const leftMin = (clampedStartMs - dayStartMs) / 60_000
      const widthMin = (visibleEndMs - clampedStartMs) / 60_000
      const leftPx = (leftMin / AXIS_STEP_MINUTES) * AXIS_STEP_PX
      const widthPx = (widthMin / AXIS_STEP_MINUTES) * AXIS_STEP_PX

      let row = 0
      for (let i = 0; i < lanesEndMs.length; i++) {
        if (clampedStartMs >= lanesEndMs[i]) {
          row = i
          break
        }
        row = i
      }
      lanesEndMs[row] = visibleEndMs

      segs.push({
        id: e.id,
        title: e.title,
        category: e.category,
        leftPx,
        widthPx,
        row,
        startsAt: tz ? fromZonedTime(new Date(clampedStartMs), tz) : new Date(clampedStartMs),
        endsAt: tz ? fromZonedTime(new Date(visibleEndMs), tz) : new Date(visibleEndMs),
      })
    }

    const nextUp = timed
      .filter(({ startZ }) => startZ.getTime() >= zNow.getTime())
      .sort((a, b) => a.startZ.getTime() - b.startZ.getTime())[0]

    const laneCount = segs.length ? Math.min(maxLanes, Math.max(...segs.map((s) => s.row)) + 1) : 1

    return {
      dayLabel,
      timeLabel,
      segments: segs,
      allDayToday,
      nextUp,
      laneCount,
      axisWidthPx,
      axisTickCount,
    }
  }, [events, now, timeZone])

  const nextUpLabel = useMemo(() => {
    if (!nextUp) return null
    const t = formatClockInTimeZone(nextUp.startUtc, timeZone)
    return `${t} · ${nextUp.e.title}`
  }, [nextUp, timeZone])

  const baseHeight = laneCount === 1 ? 22 : laneCount === 2 ? 30 : 38

  const zNow = useMemo(() => (timeZone && timeZone !== 'local' ? toZonedTime(now, timeZone) : now), [now, timeZone])
  const dayStart = startOfLocalDay(zNow)
  const nowX = useMemo(() => {
    const mins = (zNow.getTime() - dayStart.getTime()) / 60_000
    const x = (mins / AXIS_STEP_MINUTES) * AXIS_STEP_PX
    return Math.max(0, Math.min(axisWidthPx, x))
  }, [axisWidthPx, dayStart, zNow])

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300">Today</span>
          <span className="text-slate-500">•</span>
          <span>{dayLabel}</span>
          {allDayToday.length ? (
            <span className="rounded-full border border-slate-800/60 bg-slate-950/40 px-2 py-0.5 text-[10px] text-slate-300">
              {allDayToday.length} all‑day
            </span>
          ) : null}
        </div>
        {showClock ? <div className="tabular-nums text-slate-300">{timeLabel}</div> : null}
      </div>

      {nextUpLabel ? (
        <div className="mt-1 text-[11px] text-slate-500">
          Next: <span className="text-slate-300">{nextUpLabel}</span>
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-slate-600">No more timed events today.</div>
      )}

      <div
        className="relative mt-2"
      >
        {/* Side fades so the scroller feels intentional */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-slate-950/70 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-slate-950/70 to-transparent" />

        <div className="overflow-x-auto rounded-2xl border border-slate-800/60 bg-slate-950/30">
          <div className="relative" style={{ width: axisWidthPx }}>
            {/* Axis labels (30-min increments) */}
            <div className="relative border-b border-slate-800/40" style={{ height: AXIS_HEIGHT }}>
              {Array.from({ length: axisTickCount + 1 }).map((_, i) => {
                const x = i * AXIS_STEP_PX
                const isHour = i % 2 === 0
                const labelMinutes = i * AXIS_STEP_MINUTES
                const label = format24hFromMinutes(labelMinutes)

                // Don’t label the final 24:00 tick; it wraps and clutters.
                const showLabel = i < axisTickCount

                return (
                  <div key={i} className="absolute bottom-0" style={{ left: x }}>
                    <div
                      className={isHour ? 'h-2 w-px bg-slate-200/20' : 'h-1.5 w-px bg-slate-200/12'}
                    />
                    {showLabel ? (
                      <div
                        className="absolute -top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-slate-500"
                        style={{ left: 0 }}
                      >
                        {label}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {/* Timeline bar */}
            <div className="relative overflow-hidden" style={{ height: baseHeight }}>
              <div
                className={
                  reducedMotion
                    ? 'absolute inset-0'
                    : 'cala-timeline-sheen absolute inset-0'
                }
              />

              {/* Hour grid */}
              <div className="pointer-events-none absolute inset-0 opacity-35">
                {Array.from({ length: 25 }).map((_, hour) => {
                  const x = hour * 2 * AXIS_STEP_PX
                  return <div key={hour} className="absolute top-0 bottom-0 w-px bg-slate-200/10" style={{ left: x }} />
                })}
              </div>

              {/* Event segments */}
              <div className="absolute inset-0">
                {segments.map((s) => {
                  const c = CATEGORY_COLORS[s.category]
                  const top = 6 + s.row * 9
                  const height = 6

                  return (
                    <div
                      key={s.id}
                      title={`${formatClockInTimeZone(s.startsAt, timeZone)}–${formatClockInTimeZone(s.endsAt, timeZone)} · ${s.title}`}
                      className="absolute rounded-full"
                      style={{
                        left: s.leftPx,
                        width: Math.max(6, s.widthPx),
                        top,
                        height,
                        backgroundColor: c.bg,
                        background: `linear-gradient(90deg, ${c.bg}, color-mix(in oklab, ${c.bg} 55%, #ffffff 45%))`,
                        boxShadow: `0 0 0 1px color-mix(in oklab, ${c.bg} 35%, transparent), 0 0 18px color-mix(in oklab, ${c.bg} 40%, transparent)`,
                      }}
                    />
                  )
                })}
              </div>

              {/* Now marker */}
              <div
                className={reducedMotion ? 'absolute top-0 bottom-0 w-px bg-cyan-200/80' : 'cala-now-marker absolute top-0 bottom-0 w-px bg-cyan-200/80'}
                style={{ left: nowX }}
              />

              {/* Tiny “cap” */}
              <div
                className={
                  reducedMotion
                    ? 'absolute top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-cyan-200/80'
                    : 'cala-now-cap absolute top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-cyan-200/80'
                }
                style={{ left: nowX }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* All-day titles (kept minimal to avoid clutter) */}
      {allDayToday.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {allDayToday.slice(0, 5).map((e) => {
            const c = CATEGORY_COLORS[e.category]
            return (
              <div
                key={e.id}
                className="rounded-full border px-2 py-0.5 text-[10px]"
                style={{
                  borderColor: 'color-mix(in oklab, #ffffff 12%, transparent)',
                  backgroundColor: 'color-mix(in oklab, #0b1220 65%, transparent)',
                  color: 'rgba(226, 232, 240, 0.9)',
                  boxShadow: `0 0 0 1px color-mix(in oklab, ${c.bg} 20%, transparent), 0 0 14px color-mix(in oklab, ${c.bg} 25%, transparent)`,
                }}
                title={e.title}
              >
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.bg }} />
                {e.title}
              </div>
            )
          })}
          {allDayToday.length > 5 ? (
            <div className="rounded-full border border-slate-800/60 bg-slate-950/30 px-2 py-0.5 text-[10px] text-slate-400">
              +{allDayToday.length - 5} more
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
