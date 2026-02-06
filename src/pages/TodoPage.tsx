import { useMemo, useState } from 'react'
import { endOfWeek, format, getWeekOfMonth, isValid, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { CATEGORY_COLORS } from '../lib/colors'
import { cn } from '../lib/cn'
import { ALL_CATEGORIES, useCalendarStore } from '../store/useCalendarStore'
import type { CalendarCategory, CalendarEvent } from '../types/calendar'

function safeParse(dateIso: string) {
  const d = parseISO(dateIso)
  return isValid(d) ? d : null
}

function dayKeyFromStart(startIso: string) {
  const d = safeParse(startIso)
  if (!d) return 'Invalid'
  return format(d, 'yyyy-MM-dd')
}

function weekLabelFromStart(startIso: string) {
  const d = safeParse(startIso)
  if (!d) return 'Invalid week'
  const wom = getWeekOfMonth(d, { weekStartsOn: 1 })
  const ws = startOfWeek(d, { weekStartsOn: 1 })
  const we = endOfWeek(d, { weekStartsOn: 1 })
  return `${format(d, 'MMMM yyyy')} · Week ${wom} · ${format(ws, 'MMM d')}–${format(we, 'MMM d')}`
}

function formatWhen(startIso: string, endIso?: string, allDay?: boolean) {
  const start = safeParse(startIso)
  const end = endIso ? safeParse(endIso) : null
  if (!start) return 'Invalid date'

  const day = format(start, 'EEE, MMM d')
  if (allDay) return `${day} · All day`

  const t1 = format(start, 'p')
  if (end) {
    return `${day} · ${t1}–${format(end, 'p')}`
  }
  return `${day} · ${t1}`
}

function splitForEdit(iso: string) {
  const d = safeParse(iso)
  if (!d) return { date: '', time: '' }
  return { date: format(d, 'yyyy-MM-dd'), time: format(d, 'HH:mm') }
}

function isoFromLocal(date: string, time: string) {
  if (!date) return ''
  if (!time) return new Date(`${date}T00:00:00`).toISOString()
  return new Date(`${date}T${time}:00`).toISOString()
}

function mapsSearchUrl(query: string) {
  const q = query.trim()
  if (!q) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export function TodoPage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const updateEvent = useCalendarStore((s) => s.updateEvent)
  const removeEvent = useCalendarStore((s) => s.removeEvent)
  const events = useCalendarStore((s) => s.events)

  const [selectedCategories, setSelectedCategories] = useState<Set<CalendarCategory>>(
    () => new Set(ALL_CATEGORIES),
  )

  const [query, setQuery] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [timeRange, setTimeRange] = useState<'upcoming' | 'all'>('upcoming')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{
    title: string
    notes: string
    category: CalendarCategory
    allDay: boolean
    date: string
    startTime: string
    hasEnd: boolean
    endTime: string
  } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cutoff = startOfDay(new Date()).getTime()
    return events
      .filter((e) => selectedCategories.has(e.category))
      .filter((e) => {
        if (timeRange === 'all') return true
        const ms = safeParse(e.start)?.getTime() ?? 0
        return ms >= cutoff
      })
      .filter((e) => (hideDone ? !e.done : true))
      .filter((e) =>
        q
          ? e.title.toLowerCase().includes(q) ||
            (e.notes ?? '').toLowerCase().includes(q) ||
            (e.locationName ?? '').toLowerCase().includes(q) ||
            (e.locationAddress ?? '').toLowerCase().includes(q)
          : true,
      )
      .slice()
      .sort((a, b) => {
        // Sort by start time, then title
        const da = safeParse(a.start)?.getTime() ?? 0
        const db = safeParse(b.start)?.getTime() ?? 0
        if (da !== db) return da - db
        return a.title.localeCompare(b.title)
      })
  }, [events, selectedCategories, timeRange, hideDone, query])

  const grouped = useMemo(() => {
    const byWeek = new Map<
      string,
      {
        monthKey: string
        weekOfMonth: number
        label: string
        events: CalendarEvent[]
      }
    >()

    for (const e of filtered) {
      const d = safeParse(e.start)
      if (!d) continue

      const monthKey = format(d, 'yyyy-MM')
      const weekOfMonth = getWeekOfMonth(d, { weekStartsOn: 1 })
      const key = `${monthKey}-w${weekOfMonth}`

      const bucket = byWeek.get(key)
      if (bucket) {
        bucket.events.push(e)
        continue
      }

      byWeek.set(key, {
        monthKey,
        weekOfMonth,
        label: weekLabelFromStart(e.start),
        events: [e],
      })
    }

    const groups = Array.from(byWeek.entries())
      .sort((a, b) => {
        const ga = a[1]
        const gb = b[1]
        if (ga.monthKey !== gb.monthKey) return ga.monthKey.localeCompare(gb.monthKey)
        return ga.weekOfMonth - gb.weekOfMonth
      })
      .map(([key, g]) => ({ key, label: g.label, events: g.events }))

    return groups
  }, [filtered])

  const stats = useMemo(() => {
    const total = filtered.length
    const done = filtered.filter((e) => e.done).length
    return { total, done }
  }, [filtered])

  function beginEdit(e: CalendarEvent) {
    const startParts = splitForEdit(e.start)
    const endParts = e.end ? splitForEdit(e.end) : { date: startParts.date, time: '' }

    setEditingId(e.id)
    setEditDraft({
      title: e.title,
      notes: e.notes ?? '',
      category: e.category,
      allDay: Boolean(e.allDay),
      date: startParts.date,
      startTime: startParts.time,
      hasEnd: Boolean(e.end) && !e.allDay,
      endTime: endParts.time,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(null)
  }

  function saveEdit(id: string) {
    if (!editDraft) return
    const title = editDraft.title.trim()
    if (!title) return

    const startIso = editDraft.allDay
      ? `${editDraft.date}T00:00:00.000Z`
      : isoFromLocal(editDraft.date, editDraft.startTime)

    let endIso: string | undefined
    if (!editDraft.allDay && editDraft.hasEnd && editDraft.endTime) {
      const endCandidate = isoFromLocal(editDraft.date, editDraft.endTime)
      if (endCandidate) {
        const startMs = safeParse(startIso)?.getTime() ?? 0
        const endMs = safeParse(endCandidate)?.getTime() ?? 0
        // If user picks an end time earlier than start time, assume it ends next day.
        endIso = endMs >= startMs ? endCandidate : new Date(endMs + 24 * 60 * 60 * 1000).toISOString()
      }
    }

    updateEvent(id, {
      title,
      notes: editDraft.notes.trim() ? editDraft.notes.trim() : undefined,
      category: editDraft.category,
      allDay: editDraft.allDay,
      start: startIso,
      end: endIso,
    })

    cancelEdit()
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Todo 📝✅</h1>
          <p className="mt-1 text-sm text-slate-400">
            A list view of your calendar — color coded, dated, and checkable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
            {stats.done}/{stats.total} done
          </div>
          <button
            type="button"
            onClick={() => setSelectedCategories(new Set(ALL_CATEGORIES))}
            className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
          >
            Reset filters
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/25 p-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Search</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events…"
            className="w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none ring-cyan-400/30 placeholder:text-slate-500 focus:ring-2"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 md:mt-6">
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-800/60 bg-slate-950/30">
            <button
              type="button"
              onClick={() => setTimeRange('upcoming')}
              className={cn(
                'px-3 py-2 text-xs font-semibold transition',
                timeRange === 'upcoming'
                  ? 'bg-slate-100/10 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-100/5 hover:text-slate-200',
              )}
            >
              Upcoming
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('all')}
              className={cn(
                'px-3 py-2 text-xs font-semibold transition',
                timeRange === 'all'
                  ? 'bg-slate-100/10 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-100/5 hover:text-slate-200',
              )}
            >
              All
            </button>
          </div>

          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-950/30 px-3 py-2 text-xs font-semibold text-slate-300">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950/40"
            />
            Hide done
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/60 bg-slate-950/25 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-2 text-xs font-semibold text-slate-300">Categories</div>
          {ALL_CATEGORIES.map((c) => {
            const isOn = selectedCategories.has(c)
            const colors = CATEGORY_COLORS[c]
            return (
              <button
                key={c}
                type="button"
                onClick={() =>
                  setSelectedCategories((prev) => {
                    const next = new Set(prev)
                    if (next.has(c)) next.delete(c)
                    else next.add(c)
                    return next
                  })
                }
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  isOn ? 'text-slate-950' : 'text-slate-300 hover:text-slate-100',
                )}
                style={
                  isOn
                    ? { backgroundColor: colors.bg, color: colors.fg, borderColor: colors.bg }
                    : { backgroundColor: 'rgba(2,6,23,0.25)', borderColor: 'rgba(148,163,184,0.2)' }
                }
              >
                {c}
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800/60 bg-slate-950/25">
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">No events match your filters.</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {grouped.map((group) => (
              <div key={group.key} className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-300">{group.label}</div>
                  <div className="text-xs text-slate-500">{group.events.length} items</div>
                </div>

                <motion.ul layout className="space-y-2">
                  <AnimatePresence initial={false}>
                    {group.events.map((e) => {
                    const colors = CATEGORY_COLORS[e.category]
                    const when = formatWhen(e.start, e.end, e.allDay)
                    const done = Boolean(e.done)
                    const isEditing = editingId === e.id
                    const mapUrl = e.locationAddress ? mapsSearchUrl(e.locationAddress) : ''
                      const isHoliday = (e.source ?? (e.id.startsWith('holiday_') ? 'holiday' : 'user')) === 'holiday'

                    return (
                      <motion.li
                        key={e.id}
                        layout
                        initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.995 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.995 }}
                        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 38, mass: 0.55 }}
                        whileHover={reduceMotion ? undefined : { y: -1, scale: 1.005 }}
                        className={cn(
                          'rounded-2xl border border-slate-800/60 bg-slate-950/25 p-3',
                          isEditing ? 'ring-2 ring-cyan-400/25' : '',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={(ev) => updateEvent(e.id, { done: ev.target.checked })}
                            className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-950/40"
                            aria-label={done ? 'Mark not done' : 'Mark done'}
                          />

                          <div
                            className="mt-1 h-3 w-3 rounded-full"
                            style={
                              isHoliday
                                ? {
                                    backgroundColor: colors.bg,
                                    backgroundImage:
                                      'repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 2px, rgba(255,255,255,0) 2px 4px)',
                                  }
                                : { backgroundColor: colors.bg }
                            }
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                              <div
                                className={cn(
                                  'text-sm font-semibold',
                                  done ? 'text-slate-500 line-through' : 'text-slate-100',
                                )}
                              >
                                {e.title}
                              </div>
                              <div className="text-xs text-slate-400">{when}</div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span
                                  className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                                  style={{ borderColor: 'rgba(148,163,184,0.25)', color: 'rgba(226,232,240,0.9)' }}
                                >
                                  {e.category}
                                </span>

                                {e.locationName || e.locationAddress ? (
                                  <span className={cn('truncate text-xs', done ? 'text-slate-600' : 'text-slate-400')}>
                                    {(e.locationName ? `${e.locationName}` : '') +
                                      (e.locationName && e.locationAddress ? ' · ' : '') +
                                      (e.locationAddress ?? '')}
                                  </span>
                                ) : null}

                                {e.notes ? (
                                  <span className={cn('truncate text-xs', done ? 'text-slate-600' : 'text-slate-400')}>
                                    {e.notes}
                                  </span>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/?date=${dayKeyFromStart(e.start)}`)}
                                  className="rounded-xl border border-slate-800/60 bg-slate-950/30 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
                                >
                                  Open in calendar
                                </button>

                                {mapUrl ? (
                                  <a
                                    href={mapUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-xl border border-slate-800/60 bg-slate-950/30 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
                                  >
                                    Map
                                  </a>
                                ) : null}

                                {isEditing ? (
                                  <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="rounded-xl border border-slate-800/60 bg-slate-950/30 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
                                  >
                                    Cancel
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => beginEdit(e)}
                                    className="rounded-xl border border-slate-800/60 bg-slate-950/30 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
                                  >
                                    Edit
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm('Delete this event?')) removeEvent(e.id)
                                  }}
                                  className="rounded-xl border border-rose-900/40 bg-rose-950/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-950/40"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <AnimatePresence initial={false}>
                          {isEditing && editDraft ? (
                          <motion.div
                            layout
                            initial={reduceMotion ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={reduceMotion ? { opacity: 0, height: 0 } : { opacity: 0, height: 0 }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' }}
                            className="mt-3 grid grid-cols-1 gap-3 overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/30 p-3 md:grid-cols-2"
                          >
                            <div className="md:col-span-2">
                              <label className="text-xs font-semibold text-slate-300">Title</label>
                              <input
                                value={editDraft.title}
                                onChange={(ev) => setEditDraft({ ...editDraft, title: ev.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/30"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-slate-300">Category</label>
                              <select
                                value={editDraft.category}
                                onChange={(ev) => setEditDraft({ ...editDraft, category: ev.target.value as CalendarCategory })}
                                className="mt-1 w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/30"
                              >
                                {ALL_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-slate-300">Date</label>
                              <input
                                type="date"
                                value={editDraft.date}
                                onChange={(ev) => setEditDraft({ ...editDraft, date: ev.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/30"
                              />
                            </div>

                            <label className="md:col-span-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-300">
                              <input
                                type="checkbox"
                                checked={editDraft.allDay}
                                onChange={(ev) =>
                                  setEditDraft({
                                    ...editDraft,
                                    allDay: ev.target.checked,
                                    hasEnd: ev.target.checked ? false : editDraft.hasEnd,
                                  })
                                }
                                className="h-4 w-4 rounded border-slate-700 bg-slate-950/40"
                              />
                              All-day
                            </label>

                            <div>
                              <label className="text-xs font-semibold text-slate-300">Start time</label>
                              <input
                                type="time"
                                value={editDraft.startTime}
                                disabled={editDraft.allDay}
                                onChange={(ev) => setEditDraft({ ...editDraft, startTime: ev.target.value })}
                                className="mt-1 w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none disabled:opacity-50 focus:ring-2 focus:ring-cyan-400/30"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-slate-300">End time</label>
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={editDraft.hasEnd}
                                  disabled={editDraft.allDay}
                                  onChange={(ev) => setEditDraft({ ...editDraft, hasEnd: ev.target.checked })}
                                  className="h-4 w-4 rounded border-slate-700 bg-slate-950/40 disabled:opacity-50"
                                  aria-label="Has end time"
                                />
                                <input
                                  type="time"
                                  value={editDraft.endTime}
                                  disabled={editDraft.allDay || !editDraft.hasEnd}
                                  onChange={(ev) => setEditDraft({ ...editDraft, endTime: ev.target.value })}
                                  className="w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none disabled:opacity-50 focus:ring-2 focus:ring-cyan-400/30"
                                />
                              </div>
                            </div>

                            <div className="md:col-span-2">
                              <label className="text-xs font-semibold text-slate-300">Notes</label>
                              <input
                                value={editDraft.notes}
                                onChange={(ev) => setEditDraft({ ...editDraft, notes: ev.target.value })}
                                placeholder="Optional"
                                className="mt-1 w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/30"
                              />
                            </div>

                            <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(e.id)}
                                className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                              >
                                Save
                              </button>
                            </div>
                          </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </motion.li>
                    )
                    })}
                  </AnimatePresence>
                </motion.ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
