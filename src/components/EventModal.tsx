import { useMemo, useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { motion, AnimatePresence } from 'framer-motion'

import type { CalendarCategory, CalendarEvent } from '../types/calendar'
import { ALL_CATEGORIES } from '../store/useCalendarStore'
import { CATEGORY_COLORS } from '../lib/colors'
import { cn } from '../lib/cn'
import { useCalendarStore } from '../store/useCalendarStore'

function safeParse(dateIso: string) {
  const d = parseISO(dateIso)
  return isValid(d) ? d : null
}

function splitForEdit(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { date: iso, time: '' }
  const d = safeParse(iso)
  if (!d) return { date: '', time: '' }
  return { date: format(d, 'yyyy-MM-dd'), time: format(d, 'HH:mm') }
}

function isoFromLocal(date: string, time: string) {
  if (!date) return ''
  if (!time) return new Date(`${date}T00:00:00`).toISOString()
  return new Date(`${date}T${time}:00`).toISOString()
}

function isoFromZoned(date: string, time: string, timeZone?: string) {
  if (!date || !time) return ''
  if (!timeZone || timeZone === 'local') return isoFromLocal(date, time)
  return fromZonedTime(`${date}T${time}:00`, timeZone).toISOString()
}

function dateOnly(date: string) {
  // FullCalendar treats YYYY-MM-DD as an all-day date in the user's local timezone.
  // Storing all-day events as UTC midnight (....Z) can shift the visible day.
  return date
}

type Draft = {
  title: string
  notes: string
  locationName: string
  locationAddress: string
  category: CalendarCategory
  allDay: boolean
  date: string
  startTime: string
  hasEnd: boolean
  endTime: string
  done: boolean
  reminderMinutesBefore: string
}

function mapsSearchUrl(query: string) {
  const q = query.trim()
  if (!q) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export type EventModalMode = 'create' | 'edit' | 'view'

export type EventModalProps = {
  open: boolean
  mode: EventModalMode
  initialEvent?: CalendarEvent
  initialDate?: string // YYYY-MM-DD
  onClose: () => void
  onCreate: (event: CalendarEvent) => void
  onUpdate: (id: string, patch: Partial<CalendarEvent>) => void
  onDelete: (id: string) => void
  newId: () => string
}

function initialDraftFrom(mode: EventModalMode, initialDate?: string, initialEvent?: CalendarEvent): Draft {
  if (mode !== 'create' && initialEvent) {
    const startParts = splitForEdit(initialEvent.start)
    const endParts = initialEvent.end ? splitForEdit(initialEvent.end) : { date: startParts.date, time: '' }
    return {
      title: initialEvent.title,
      notes: initialEvent.notes ?? '',
      locationName: initialEvent.locationName ?? '',
      locationAddress: initialEvent.locationAddress ?? '',
      category: initialEvent.category,
      allDay: Boolean(initialEvent.allDay),
      date: startParts.date,
      startTime: startParts.time,
      hasEnd: Boolean(initialEvent.end) && !initialEvent.allDay,
      endTime: endParts.time,
      done: Boolean(initialEvent.done),
      reminderMinutesBefore:
        typeof initialEvent.reminderMinutesBefore === 'number' && Number.isFinite(initialEvent.reminderMinutesBefore)
          ? String(initialEvent.reminderMinutesBefore)
          : '',
    }
  }

  const today = initialDate ?? format(new Date(), 'yyyy-MM-dd')
  return {
    title: '',
    notes: '',
    locationName: '',
    locationAddress: '',
    category: 'Work',
    allDay: true,
    date: today,
    startTime: '09:00',
    hasEnd: false,
    endTime: '10:00',
    done: false,
    reminderMinutesBefore: '',
  }
}

function isHolidayEvent(e?: CalendarEvent) {
  if (!e) return false
  return e.source === 'holiday' || e.category === 'Holiday' || e.id.startsWith('holiday_')
}

export function EventModal(props: EventModalProps) {
  const { open, mode, initialEvent, initialDate, onClose, onCreate, onUpdate, onDelete, newId } = props

  const timeZone = useCalendarStore((s) => s.timeZone)
  const savedPlaces = useCalendarStore((s) => s.savedPlaces)
  const upsertSavedPlace = useCalendarStore((s) => s.upsertSavedPlace)

  const readOnly = mode === 'view' || isHolidayEvent(initialEvent)

  const [draft, setDraft] = useState<Draft>(() => {
    if (mode !== 'create' && initialEvent) {
      const tz = timeZone && timeZone !== 'local' ? timeZone : undefined
      if (tz && !/^\d{4}-\d{2}-\d{2}$/.test(initialEvent.start)) {
        const startZ = toZonedTime(parseISO(initialEvent.start), tz)
        const endZ = initialEvent.end ? toZonedTime(parseISO(initialEvent.end), tz) : null
        const startParts = { date: format(startZ, 'yyyy-MM-dd'), time: format(startZ, 'HH:mm') }
        const endParts = endZ ? { date: startParts.date, time: format(endZ, 'HH:mm') } : { date: startParts.date, time: '' }

        return {
          title: initialEvent.title,
          notes: initialEvent.notes ?? '',
          locationName: initialEvent.locationName ?? '',
          locationAddress: initialEvent.locationAddress ?? '',
          category: initialEvent.category,
          allDay: Boolean(initialEvent.allDay),
          date: startParts.date,
          startTime: startParts.time,
          hasEnd: Boolean(initialEvent.end) && !initialEvent.allDay,
          endTime: endParts.time,
          done: Boolean(initialEvent.done),
          reminderMinutesBefore:
            typeof initialEvent.reminderMinutesBefore === 'number' && Number.isFinite(initialEvent.reminderMinutesBefore)
              ? String(initialEvent.reminderMinutesBefore)
              : '',
        }
      }
    }

    return initialDraftFrom(mode, initialDate, initialEvent)
  })

  const header = useMemo(() => {
    if (readOnly) return 'Event'
    return mode === 'edit' ? 'Edit event' : 'New event'
  }, [mode, readOnly])

  const colors = CATEGORY_COLORS[draft.category]
  const mapUrl = useMemo(() => mapsSearchUrl(draft.locationAddress), [draft.locationAddress])

  const selectableCategories: CalendarCategory[] = ALL_CATEGORIES.filter((c) => c !== 'Observance')

  function rememberCurrentPlace() {
    if (readOnly) return
    const address = draft.locationAddress.trim()
    if (!address) return
    upsertSavedPlace({ label: draft.locationName.trim(), address })
  }

  function save() {
    const title = draft.title.trim()
    if (!title || !draft.date) return

    const reminderMinutesBefore =
      !draft.allDay && draft.reminderMinutesBefore !== '' && Number.isFinite(Number(draft.reminderMinutesBefore))
        ? Math.max(0, Math.round(Number(draft.reminderMinutesBefore)))
        : undefined

    const startIso = draft.allDay
      ? dateOnly(draft.date)
      : isoFromZoned(draft.date, draft.startTime, timeZone)

    let endIso: string | undefined
    if (!draft.allDay && draft.hasEnd && draft.endTime) {
      const endCandidate = isoFromZoned(draft.date, draft.endTime, timeZone)
      if (endCandidate) {
        const startMs = safeParse(startIso)?.getTime() ?? 0
        const endMs = safeParse(endCandidate)?.getTime() ?? 0
        endIso = endMs >= startMs ? endCandidate : new Date(endMs + 24 * 60 * 60 * 1000).toISOString()
      }
    }

    if (mode === 'edit' && initialEvent) {
      onUpdate(initialEvent.id, {
        title,
        notes: draft.notes.trim() ? draft.notes.trim() : undefined,
        locationName: draft.locationName.trim() ? draft.locationName.trim() : undefined,
        locationAddress: draft.locationAddress.trim() ? draft.locationAddress.trim() : undefined,
        category: draft.category,
        allDay: draft.allDay,
        start: startIso,
        end: endIso,
        done: draft.done,
        reminderMinutesBefore,
      })
      rememberCurrentPlace()
      onClose()
      return
    }

    const evt: CalendarEvent = {
      id: newId(),
      title,
      start: startIso,
      end: endIso,
      allDay: draft.allDay,
      category: draft.category,
      notes: draft.notes.trim() ? draft.notes.trim() : undefined,
      locationName: draft.locationName.trim() ? draft.locationName.trim() : undefined,
      locationAddress: draft.locationAddress.trim() ? draft.locationAddress.trim() : undefined,
      done: draft.done,
      reminderMinutesBefore,
      source: 'user',
    }
    onCreate(evt)
    rememberCurrentPlace()
    onClose()
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/70 backdrop-blur"
          />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/85 shadow-2xl backdrop-blur"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800/60 p-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100">{header}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {readOnly ? 'Read-only' : 'Saved to your calendar'}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 p-4">
              {isHolidayEvent(initialEvent) ? (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
                  US federal holidays are generated automatically and are read-only.
                </div>
              ) : null}

              <div>
                <label className="text-xs font-semibold text-slate-300">Title</label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  disabled={readOnly}
                  placeholder="e.g. Deep work block"
                  className="mt-1 w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none ring-cyan-400/30 placeholder:text-slate-500 focus:ring-2 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Category</label>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as CalendarCategory }))}
                    disabled={readOnly}
                    className={cn(
                      'mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-60',
                      'border-slate-800/60 bg-slate-950/40 focus:ring-cyan-400/30',
                    )}
                    style={!readOnly ? { borderColor: colors.bg } : undefined}
                  >
                      {selectableCategories.map((c) => (
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
                    value={draft.date}
                    onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                    disabled={readOnly}
                    className="mt-1 w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/30 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Start</label>
                  <input
                    type="time"
                    value={draft.startTime}
                    onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
                    disabled={readOnly || draft.allDay}
                    className="mt-1 w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none disabled:opacity-60 focus:ring-2 focus:ring-cyan-400/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">End</label>
                  <div className="mt-1 flex gap-2">
                    <label className="inline-flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-300">
                      <input
                        type="checkbox"
                        checked={draft.hasEnd}
                        onChange={(e) => setDraft((d) => ({ ...d, hasEnd: e.target.checked }))}
                        disabled={readOnly || draft.allDay}
                        className="h-4 w-4 rounded border-slate-700 bg-slate-950/40"
                      />
                      Has end
                    </label>
                    <input
                      type="time"
                      value={draft.endTime}
                      onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
                      disabled={readOnly || draft.allDay || !draft.hasEnd}
                      className="min-w-0 flex-1 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none disabled:opacity-60 focus:ring-2 focus:ring-cyan-400/30"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Reminder</label>
                <select
                  value={draft.reminderMinutesBefore}
                  onChange={(e) => setDraft((d) => ({ ...d, reminderMinutesBefore: e.target.value }))}
                  disabled={readOnly || draft.allDay}
                  className={cn(
                    'mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-60',
                    'border-slate-800/60 bg-slate-950/40 focus:ring-cyan-400/30',
                  )}
                >
                  <option value="">None</option>
                  <option value="0">At start time</option>
                  <option value="5">5 minutes before</option>
                  <option value="10">10 minutes before</option>
                  <option value="15">15 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="120">2 hours before</option>
                </select>
                <div className="mt-1 text-[11px] text-slate-500">
                  Reminders trigger while the app is open. For all-day events, reminders are disabled.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.allDay}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        allDay: e.target.checked,
                        hasEnd: e.target.checked ? false : d.hasEnd,
                      }))
                    }
                    disabled={readOnly}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950/40"
                  />
                  All-day
                </label>

                <label className="inline-flex items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={draft.done}
                    onChange={(e) => setDraft((d) => ({ ...d, done: e.target.checked }))}
                    disabled={readOnly}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950/40"
                  />
                  Done
                </label>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Notes</label>
                <textarea
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  disabled={readOnly}
                  rows={3}
                  placeholder="Optional notes…"
                  className="mt-1 w-full resize-none rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none ring-cyan-400/30 placeholder:text-slate-500 focus:ring-2 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Location</label>
                  <input
                    value={draft.locationName}
                    onChange={(e) => setDraft((d) => ({ ...d, locationName: e.target.value }))}
                    disabled={readOnly}
                    placeholder="e.g. Dr. Patel"
                    className="mt-1 w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none ring-cyan-400/30 placeholder:text-slate-500 focus:ring-2 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Address</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={draft.locationAddress}
                      onChange={(e) => setDraft((d) => ({ ...d, locationAddress: e.target.value }))}
                      disabled={readOnly}
                      placeholder="Street, city, state"
                      list={savedPlaces.length > 0 ? 'cala-saved-places' : undefined}
                      className="min-w-0 flex-1 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-sm outline-none ring-cyan-400/30 placeholder:text-slate-500 focus:ring-2 disabled:opacity-60"
                    />

                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={rememberCurrentPlace}
                        disabled={!draft.locationAddress.trim()}
                        className="shrink-0 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Save this place for reuse"
                      >
                        Remember
                      </button>
                    ) : null}
                  </div>

                  {savedPlaces.length > 0 ? (
                    <datalist id="cala-saved-places">
                      {savedPlaces.map((p) => (
                        <option key={p.key} value={p.address} />
                      ))}
                    </datalist>
                  ) : null}
                </div>

                {!readOnly && savedPlaces.length > 0 ? (
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-slate-300">Saved places</label>
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const key = e.target.value
                        if (!key) return
                        const found = savedPlaces.find((p) => p.key === key)
                        if (!found) return

                        setDraft((d) => ({
                          ...d,
                          locationName: found.label,
                          locationAddress: found.address,
                        }))
                        upsertSavedPlace({ label: found.label, address: found.address })

                        // Reset to placeholder so user can pick again later.
                        e.target.value = ''
                      }}
                      className={cn(
                        'mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-60',
                        'border-slate-800/60 bg-slate-950/40 focus:ring-cyan-400/30',
                      )}
                    >
                      <option value="" disabled>
                        Pick a saved place…
                      </option>
                      {savedPlaces.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label} — {p.address}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Tip: click “Remember” after typing an address.
                    </div>
                  </div>
                ) : null}

                {mapUrl ? (
                  <div className="md:col-span-2">
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
                    >
                      Open in Maps
                    </a>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-800/60 p-4">
              <div className="text-xs text-slate-500">
                {mode === 'edit' && initialEvent ? `ID: ${initialEvent.id}` : null}
              </div>

              <div className="flex items-center gap-2">
                {mode === 'edit' && initialEvent && !readOnly ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm('Delete this event?')) return
                      onDelete(initialEvent.id)
                      onClose()
                    }}
                    className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/15"
                  >
                    Delete
                  </button>
                ) : null}

                {!readOnly ? (
                  <button
                    type="button"
                    onClick={save}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.35)] hover:bg-cyan-400"
                  >
                    Save
                  </button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
