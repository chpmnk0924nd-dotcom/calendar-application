import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventContentArg, EventHoveringArg, EventMountArg } from '@fullcalendar/core'
import { formatISO } from 'date-fns'
import { useSearchParams } from 'react-router-dom'

import '../styles/fullcalendar.css'
import { CATEGORY_COLORS } from '../lib/colors'
import type { CalendarCategory, CalendarEvent } from '../types/calendar'
import { ALL_CATEGORIES, useCalendarStore } from '../store/useCalendarStore'
import { cn } from '../lib/cn'
import { EventModal } from '../components/EventModal'
import { uuidv4 } from '../lib/uuid'

function isHolidayEvent(e?: CalendarEvent) {
  if (!e) return false
  return e.source === 'holiday' || e.category === 'Holiday' || e.id.startsWith('holiday_')
}

function isCalendarCategory(value: unknown): value is CalendarCategory {
  return typeof value === 'string' && (ALL_CATEGORIES as readonly string[]).includes(value)
}

function toDateOnly(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return formatISO(new Date(value), { representation: 'date' })
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return true
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
}

export function CalendarPage() {
  const calendarRef = useRef<FullCalendar | null>(null)
  const calendarSurfaceRef = useRef<HTMLDivElement | null>(null)
  const orbLayerRef = useRef<HTMLDivElement | null>(null)
  const orbGlowTimeoutsRef = useRef<WeakMap<HTMLElement, number>>(new WeakMap())
  const [searchParams] = useSearchParams()
  const jumpDate = searchParams.get('date')

  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)

  const visibleCategories = useCalendarStore((s) => s.visibleCategories)
  const setCategoryVisible = useCalendarStore((s) => s.setCategoryVisible)
  const resetCategories = useCalendarStore((s) => s.resetCategories)
  const timeZone = useCalendarStore((s) => s.timeZone)
  const addEvent = useCalendarStore((s) => s.addEvent)
  const updateEvent = useCalendarStore((s) => s.updateEvent)
  const removeEvent = useCalendarStore((s) => s.removeEvent)

  const events = useCalendarStore((s) => s.events)

  const filteredEvents = useMemo(() => {
    return events.filter((e) => visibleCategories.has(e.category))
  }, [events, visibleCategories])

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create')
  const [modalDate, setModalDate] = useState<string | undefined>(undefined)
  const [modalEvent, setModalEvent] = useState<CalendarEvent | undefined>(undefined)
  const [modalKey, setModalKey] = useState(0)

  useEffect(() => {
    const layer = document.createElement('div')
    layer.className = 'cala-orb-layer'
    document.body.appendChild(layer)
    orbLayerRef.current = layer
    return () => {
      layer.remove()
      if (orbLayerRef.current === layer) orbLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!jumpDate) return
    const api = calendarRef.current?.getApi()
    if (!api) return
    api.gotoDate(jumpDate)
  }, [jumpDate])

  const calendarEvents = useMemo(() => {
    return filteredEvents.map((e) => {
      const colors = CATEGORY_COLORS[e.category]
      return {
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        backgroundColor: colors.bg,
        borderColor: colors.bg,
        textColor: colors.fg,
        extendedProps: {
          category: e.category,
          locationName: e.locationName,
          locationAddress: e.locationAddress,
          source: e.source ?? (e.id.startsWith('holiday_') ? 'holiday' : 'user'),
        },
      }
    })
  }, [filteredEvents])

  const eventClassNames = useCallback(
    (arg: EventContentArg) => {
      const classes: string[] = ['cala-event']
      const id = String(arg.event.id)

      const ext = arg.event.extendedProps as Record<string, unknown>
      const hasLocation = typeof ext.locationAddress === 'string' && ext.locationAddress.trim().length > 0
      if (hasLocation) classes.push('cala-event--has-location')

      const source = typeof ext.source === 'string' ? ext.source : undefined
      const isHoliday = source === 'holiday' || id.startsWith('holiday_')
      classes.push(isHoliday ? 'cala-event--holiday' : 'cala-event--user')

      const start: Date | null = arg.event.start
      const isAllDay: boolean = Boolean(arg.event.allDay)
      const now = Date.now()
      const ms = start ? start.getTime() : 0
      const isSoon = !isAllDay && ms >= now && ms - now <= 2 * 60 * 60 * 1000

      if (isSoon) classes.push('cala-event--soon')
      if (hoveredEventId && id && id !== hoveredEventId) classes.push('cala-event--dim')
      if (hoveredEventId && id === hoveredEventId) classes.push('cala-event--focus')

      return classes
    },
    [hoveredEventId],
  )

  const animateCategoryOrb = useCallback(
    (category: CalendarCategory, sourceEl: HTMLElement) => {
      const api = calendarRef.current?.getApi()
      const surface = calendarSurfaceRef.current
      const layer = orbLayerRef.current
      if (!api || !surface || !layer) return

      const viewType = api.view.type
      const isDayGrid = viewType.startsWith('dayGrid')
      if (!isDayGrid) return

      const startRect = sourceEl.getBoundingClientRect()
      const startX = startRect.left + startRect.width / 2
      const startY = startRect.top + startRect.height / 2

      const colors = CATEGORY_COLORS[category]
      const reduced = prefersReducedMotion()

      // Slower travel so you can actually watch them reach the day
      const ORB_DURATION_MS = 2750
      const ORB_STAGGER_MS = 100
      const LAND_OFFSET = 0.78

      const spawnSparks = (x: number, y: number, rand: () => number) => {
        const burst = document.createElement('div')
        burst.className = 'cala-spark-burst'
        burst.style.left = `${x}px`
        burst.style.top = `${y}px`
        burst.style.setProperty('--spark-color', colors.bg)
        layer.appendChild(burst)

        const count = 26 + Math.floor(rand() * 14)
        for (let i = 0; i < count; i++) {
          const spark = document.createElement('div')
          spark.className = 'cala-spark'
          burst.appendChild(spark)

          const angle = (Math.PI * 2 * (i / count)) + (rand() * 0.7 - 0.35)
          const dist = 60 + rand() * 110
          const dx2 = Math.cos(angle) * dist
          const dy2 = Math.sin(angle) * dist
          const rot = angle * (180 / Math.PI) + (rand() * 40 - 20)
          const dur = 540 + rand() * 340
          const delay = rand() * 40

          spark.animate(
            [
              { transform: `translate(0px, 0px) rotate(${rot}deg) scale(1)`, opacity: 1 },
              { transform: `translate(${dx2 * 0.35}px, ${dy2 * 0.35}px) rotate(${rot + 18}deg) scale(1.05)`, opacity: 0.98 },
              { transform: `translate(${dx2}px, ${dy2}px) rotate(${rot + 55}deg) scale(0.75)`, opacity: 0 },
            ],
            {
              duration: dur,
              delay,
              easing: 'cubic-bezier(0.15, 0.9, 0.2, 1)',
              fill: 'forwards',
            },
          )
        }

        // Remove after the last spark has finished.
        window.setTimeout(() => burst.remove(), 1250)
      }

      // Targets: unique dates (within current view range) that have events of this category.
      const viewStart = api.view.activeStart
      const viewEnd = api.view.activeEnd

      const dateSet = new Set<string>()
      for (const e of events) {
        if (e.category !== category) continue
        const dateOnly = toDateOnly(e.start)

        const d = new Date(dateOnly + 'T00:00:00')
        if (Number.isNaN(d.getTime())) continue
        if (d < viewStart || d >= viewEnd) continue

        dateSet.add(dateOnly)
      }

      const targets = Array.from(dateSet).sort()
      if (targets.length === 0) return

      // Always burst-highlight all relevant days in the current view.
      for (const dateStr of targets) {
        const cell = surface.querySelector<HTMLElement>(`.fc-daygrid-day[data-date="${dateStr}"]`)
        if (!cell) continue
        cell.style.setProperty('--cala-burst-color', colors.bg)
        cell.classList.remove('cala-day-burst')
        void cell.offsetWidth
        cell.classList.add('cala-day-burst')
        window.setTimeout(() => {
          cell.classList.remove('cala-day-burst')
        }, 650)
      }

      if (reduced) return

      // Avoid spawning an absurd number of orbs (e.g. holidays).
      const MAX_ORBS = 14
      const picked =
        targets.length <= MAX_ORBS
          ? targets
          : Array.from({ length: MAX_ORBS }, (_, i) => targets[Math.floor((i * (targets.length - 1)) / (MAX_ORBS - 1))])

      picked.forEach((dateStr, idx) => {
        const cell = surface.querySelector<HTMLElement>(`.fc-daygrid-day[data-date="${dateStr}"]`)
        if (!cell) return

        const rect = cell.getBoundingClientRect()
        const endX = rect.left + rect.width * (0.35 + (idx % 3) * 0.12)
        const endY = rect.top + rect.height * (0.22 + ((idx + 1) % 3) * 0.06)

        const orb = document.createElement('div')
        orb.className = 'cala-orb'
        orb.style.left = `${startX}px`
        orb.style.top = `${startY}px`
        orb.style.setProperty('--orb-color', colors.bg)
        orb.style.setProperty('--orb-fg', colors.fg)
        layer.appendChild(orb)

        const dx = endX - startX
        const dy = endY - startY

        // Deterministic pseudo-randomness per target for natural “float”.
        let seed = 0
        for (let i = 0; i < dateStr.length; i++) seed = (seed * 31 + dateStr.charCodeAt(i)) >>> 0
        seed = (seed + idx * 1013904223) >>> 0
        const rand = () => {
          // mulberry32
          seed |= 0
          seed = (seed + 0x6d2b79f5) | 0
          let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }

        const driftBase = 18 + rand() * 16
        const driftSign = rand() > 0.5 ? 1 : -1
        const drift = driftSign * driftBase
        const sway1 = (rand() * 2 - 1) * (12 + rand() * 10)
        const sway2 = (rand() * 2 - 1) * (10 + rand() * 10)
        const bob1 = (rand() * 2 - 1) * (10 + rand() * 14)
        const bob2 = (rand() * 2 - 1) * (8 + rand() * 12)

        const anim = orb.animate(
          [
            { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
            {
              transform: `translate(${dx * 0.18 + drift}px, ${dy * 0.16 + bob1}px) scale(1.08)`,
              opacity: 1,
              offset: 0.22,
            },
            {
              transform: `translate(${dx * 0.38 + sway1}px, ${dy * 0.38 + bob2}px) scale(1.12)`,
              opacity: 0.98,
              offset: 0.45,
            },
            {
              transform: `translate(${dx * 0.62 + sway2}px, ${dy * 0.62}px) scale(1.06)`,
              opacity: 0.96,
              offset: 0.68,
            },
            {
              // Arrive and “occupy” the spot
              transform: `translate(${dx}px, ${dy}px) scale(0.98)`,
              opacity: 0.92,
              offset: 0.78,
            },
            {
              // Brief settle, then fade quickly
              transform: `translate(${dx}px, ${dy - 2}px) scale(0.98)`,
              opacity: 0.35,
              offset: 0.88,
            },
            { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0.0, offset: 1 },
          ],
          {
            duration: ORB_DURATION_MS,
            delay: idx * ORB_STAGGER_MS,
            easing: 'cubic-bezier(0.2, 0, 0.2, 1)',
            fill: 'forwards',
          },
        )

        // Sparks when the orb “lands” in the day cell.
        const landDelay = idx * ORB_STAGGER_MS + Math.floor(ORB_DURATION_MS * LAND_OFFSET)
        window.setTimeout(() => {
          cell.style.setProperty('--cala-orb-glow-color', colors.bg)

          const previousTimeout = orbGlowTimeoutsRef.current.get(cell)
          if (previousTimeout) window.clearTimeout(previousTimeout)

          cell.classList.remove('cala-day-orb-glow')
          void cell.offsetWidth
          cell.classList.add('cala-day-orb-glow')

          const removeTimeout = window.setTimeout(() => {
            cell.classList.remove('cala-day-orb-glow')
            orbGlowTimeoutsRef.current.delete(cell)
          }, 6000)
          orbGlowTimeoutsRef.current.set(cell, removeTimeout)

          if (!prefersReducedMotion()) spawnSparks(endX, endY, rand)
        }, landDelay)

        anim.onfinish = () => {
          orb.remove()
        }
      })
    },
    [events],
  )

  function openCreate(dateStr?: string) {
    setModalKey((k) => k + 1)
    setModalMode('create')
    setModalEvent(undefined)
    setModalDate(dateStr ?? formatISO(new Date(), { representation: 'date' }))
    setModalOpen(true)
  }

  function openEditById(id: string) {
    const found = events.find((e) => e.id === id)
    if (!found) return

    setModalKey((k) => k + 1)
    setModalEvent(found)
    setModalDate(undefined)
    setModalMode(isHolidayEvent(found) ? 'view' : 'edit')
    setModalOpen(true)
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Calendar 📅</h1>
          <p className="mt-1 text-sm text-slate-400">Your schedule, but treated like a data visualization.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
            {filteredEvents.length} visible
          </div>

          <button
            type="button"
            onClick={resetCategories}
            className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
          >
            Reset filters
          </button>

          <button
            type="button"
            onClick={() => openCreate()}
            className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_40px_rgba(34,211,238,0.55)] hover:bg-cyan-400 hover:shadow-[0_0_52px_rgba(34,211,238,0.65)]"
          >
            New event
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-800/60 bg-slate-950/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 text-xs font-semibold text-slate-300">Categories</div>
          {ALL_CATEGORIES.map((c) => {
            const isOn = visibleCategories.has(c)
            const colors = CATEGORY_COLORS[c]
            return (
              <button
                key={c}
                type="button"
                onClick={(ev) => {
                  const nextOn = !isOn
                  setCategoryVisible(c, nextOn)
                  if (nextOn) animateCategoryOrb(c, ev.currentTarget)
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  isOn ? 'text-slate-950' : 'text-slate-300 hover:text-slate-100',
                )}
                style={
                  isOn
                    ? {
                        backgroundColor: colors.bg,
                        color: colors.fg,
                        borderColor: colors.bg,
                        boxShadow: `0 0 0 1px rgba(255,255,255,0.14), 0 0 22px ${colors.bg}88, 0 0 44px ${colors.bg}55`,
                      }
                    : { backgroundColor: 'rgba(2,6,23,0.25)', borderColor: 'rgba(148,163,184,0.2)' }
                }
              >
                {c}
              </button>
            )
          })}
        </div>
      </section>

      <section
        ref={calendarSurfaceRef}
        className="cala-calendar-surface min-w-0 rounded-2xl border border-slate-800/60 bg-slate-950/25 p-3"
      >
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          timeZone={timeZone}
          height="auto"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          events={calendarEvents}
          nowIndicator
          eventClassNames={eventClassNames}
          eventContent={(arg: EventContentArg) => {
            const ext = arg.event.extendedProps as Record<string, unknown>
            const hasLocation = typeof ext.locationAddress === 'string' && ext.locationAddress.trim().length > 0
            return (
              <div className="cala-event-content">
                {arg.timeText ? <span className="cala-event-time">{arg.timeText}</span> : null}
                {hasLocation ? <span className="cala-event-pin" aria-hidden="true">⌖</span> : null}
                <span className="cala-event-title">{arg.event.title}</span>
              </div>
            )
          }}
          eventDidMount={(info: EventMountArg) => {
            const ext = info.event.extendedProps as Record<string, unknown>
            const raw = ext?.category
            const cat = typeof raw === 'string' ? raw.trim() : raw
            if (!isCalendarCategory(cat)) return

            const colors = CATEGORY_COLORS[cat]
            // Used for glow/shadow styling.
            info.el.style.setProperty('--cala-event-bg', colors.bg)
            info.el.style.setProperty('--cala-event-fg', colors.fg)

            // Force the actual event block to match the category color in every FC view.
            const el = info.el as HTMLElement
            el.style.backgroundColor = colors.bg
            el.style.borderColor = colors.bg
            el.style.color = colors.fg
          }}
          eventMouseEnter={(info: EventHoveringArg) => setHoveredEventId(String(info.event.id))}
          eventMouseLeave={() => setHoveredEventId(null)}
          editable={false}
          selectable
          dayMaxEvents
          dateClick={(arg) => {
            openCreate(arg.dateStr)
          }}
          eventClick={(arg) => {
            openEditById(String(arg.event.id))
          }}
        />
      </section>

      <EventModal
        key={modalKey}
        open={modalOpen}
        mode={modalMode}
        initialDate={modalDate}
        initialEvent={modalEvent}
        onClose={() => setModalOpen(false)}
        onCreate={(evt) => addEvent(evt)}
        onUpdate={(id, patch) => updateEvent(id, patch)}
        onDelete={(id) => removeEvent(id)}
        newId={() => uuidv4()}
      />
    </div>
  )
}
