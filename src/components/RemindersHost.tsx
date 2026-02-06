import { useEffect, useMemo, useRef, useState } from 'react'
import { parseISO, isValid } from 'date-fns'

import type { CalendarEvent } from '../types/calendar'
import { useCalendarStore } from '../store/useCalendarStore'
import { cn } from '../lib/cn'

type Toast = {
  id: string
  title: string
  body: string
  whenMs: number
}

function isUserEvent(e: CalendarEvent) {
  return e.source !== 'holiday' && !e.id.startsWith('holiday_')
}

function safeMs(iso: string) {
  const d = parseISO(iso)
  if (!isValid(d)) return null
  return d.getTime()
}

function formatWhen(whenMs: number, timeZone: string) {
  const d = new Date(whenMs)
  const tz = timeZone && timeZone !== 'local' ? timeZone : undefined
  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(tz ? { timeZone: tz } : {}),
  })
  return fmt.format(d)
}

function tryPlayChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.value = 784 // G5-ish
    gain.gain.value = 0.0001

    osc.connect(gain)
    gain.connect(ctx.destination)

    const t0 = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)

    osc.start(t0)
    osc.stop(t0 + 0.2)

    osc.onended = () => {
      void ctx.close().catch(() => {})
    }
  } catch {
    // ignore
  }
}

export function RemindersHost() {
  const events = useCalendarStore((s) => s.events)
  const timeZone = useCalendarStore((s) => s.timeZone)

  const [nowMs, setNowMs] = useState(0)

  const [permission, setPermission] = useState<'unsupported' | NotificationPermission>(() => {
    if (typeof window === 'undefined') return 'unsupported'
    if (!('Notification' in window)) return 'unsupported'
    return Notification.permission
  })

  const [toasts, setToasts] = useState<Toast[]>([])

  const firedRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return

    const update = () => setPermission(Notification.permission)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  useEffect(() => {
    // Keep render pure: compute current time outside of render/memos.
    const refresh = () => setNowMs(Date.now())
    const warm = window.setTimeout(refresh, 0)
    const id = window.setInterval(refresh, 15_000)
    return () => {
      window.clearTimeout(warm)
      window.clearInterval(id)
    }
  }, [])

  const reminders = useMemo(() => {
    const horizonMs = nowMs + 24 * 60 * 60 * 1000

    const rows: Array<{ key: string; event: CalendarEvent; remindAtMs: number; startMs: number }> = []
    for (const e of events) {
      if (!isUserEvent(e)) continue
      if (e.done) continue
      if (e.allDay) continue
      if (typeof e.reminderMinutesBefore !== 'number' || !Number.isFinite(e.reminderMinutesBefore)) continue

      const startMs = safeMs(e.start)
      if (startMs === null) continue

      const remindAtMs = startMs - Math.max(0, Math.round(e.reminderMinutesBefore)) * 60 * 1000
      if (remindAtMs > horizonMs) continue
      if (remindAtMs < nowMs - 2 * 60 * 1000) continue

      rows.push({
        key: `${e.id}@${remindAtMs}`,
        event: e,
        remindAtMs,
        startMs,
      })
    }

    rows.sort((a, b) => a.remindAtMs - b.remindAtMs)
    return rows.slice(0, 30)
  }, [events, nowMs])

  useEffect(() => {
    const timers = timersRef.current
    // Clear existing timers and reschedule.
    for (const t of timers.values()) window.clearTimeout(t)
    timers.clear()

    const now = Date.now()

    const fire = (key: string, event: CalendarEvent, startMs: number, remindAtMs: number) => {
      if (firedRef.current.has(key)) return
      firedRef.current.add(key)

      const timeLabel = formatWhen(startMs, timeZone)
      const body = `Starts at ${timeLabel}`

      setToasts((prev) => {
        const next: Toast[] = [{ id: key, title: event.title, body, whenMs: remindAtMs }, ...prev]
        return next.slice(0, 4)
      })

      tryPlayChime()

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(event.title, {
            body,
            tag: event.id,
            silent: true,
          })
        } catch {
          // ignore
        }
      }
    }

    for (const r of reminders) {
      const delay = r.remindAtMs - now
      const run = () => fire(r.key, r.event, r.startMs, r.remindAtMs)

      if (delay <= 0) {
        // If we're within a small window of "missed", fire ASAP.
        const id = window.setTimeout(run, 0)
        timers.set(r.key, id)
      } else {
        const id = window.setTimeout(run, delay)
        timers.set(r.key, id)
      }
    }

    return () => {
      for (const t of timers.values()) window.clearTimeout(t)
      timers.clear()
    }
  }, [reminders, timeZone])

  async function requestPermission() {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) {
      setPermission('unsupported')
      return
    }

    try {
      const next = await Notification.requestPermission()
      setPermission(next)
    } catch {
      // ignore
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800/60 bg-slate-950/30 px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-200">Reminders</div>
          <div className="text-[11px] text-slate-500">
            {permission === 'granted'
              ? 'Desktop alerts enabled.'
              : permission === 'denied'
                ? 'Desktop alerts blocked (using in-app banners).'
                : permission === 'unsupported'
                  ? 'Browser alerts not supported (using in-app banners).'
                  : 'Enable desktop alerts for pop-up reminders.'}
          </div>
        </div>

        {permission === 'default' ? (
          <button
            type="button"
            onClick={() => void requestPermission()}
            className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
          >
            Enable alerts
          </button>
        ) : null}
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-2xl border border-slate-800/60 bg-slate-950/85 p-3 shadow-2xl backdrop-blur',
              'ring-1 ring-cyan-400/15',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-slate-100">⏰ {t.title}</div>
                <div className="mt-1 text-[11px] text-slate-400">{t.body}</div>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-900/60"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
