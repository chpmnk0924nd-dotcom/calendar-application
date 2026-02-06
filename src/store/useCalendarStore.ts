import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { CalendarCategory, CalendarEvent } from '../types/calendar'
import { getSupabaseClient } from '../lib/supabaseClient'
import { makeUsFederalHolidays } from '../lib/usFederalHolidays'

type CalendarState = {
  events: CalendarEvent[]
  visibleCategories: Set<CalendarCategory>
  timeZone: string

  savedPlaces: SavedPlace[]

  authStatus: 'unconfigured' | 'loading' | 'signedOut' | 'signedIn'
  userEmail?: string
  authError?: string

  init: () => void
  signInWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refreshFromDb: () => Promise<void>
  clearLocalData: () => void

  setCategoryVisible: (category: CalendarCategory, visible: boolean) => void
  toggleCategory: (category: CalendarCategory) => void
  resetCategories: () => void
  setTimeZone: (timeZone: string) => void

  upsertSavedPlace: (place: { label?: string; address: string }) => void
  removeSavedPlace: (key: string) => void
  clearSavedPlaces: () => void

  addEvent: (event: CalendarEvent) => void
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void
  removeEvent: (id: string) => void
}

const ALL_CATEGORIES: CalendarCategory[] = ['Work', 'Personal', 'Birthday', 'Health', 'Learning', 'Social', 'Travel', 'Holiday', 'Observance']

const DEFAULT_VISIBLE_CATEGORIES: CalendarCategory[] = ['Birthday', 'Health', 'Holiday']

export type SavedPlace = {
  key: string
  label: string
  address: string
  createdAt: number
  lastUsedAt: number
}

function normalizePlaceKey(address: string) {
  return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

function safePlaceLabel(label: string | undefined, address: string) {
  const clean = typeof label === 'string' ? label.trim() : ''
  if (clean) return clean

  const a = address.trim()
  if (!a) return 'Saved place'
  const first = a.split(',')[0]?.trim()
  return first || a
}

function sanitizeVisibleCategories(input: unknown): Set<CalendarCategory> {
  const arr = Array.isArray(input) ? input : []
  const cleaned = arr.filter((c): c is CalendarCategory => typeof c === 'string' && (ALL_CATEGORIES as string[]).includes(c))
  return new Set(cleaned.length > 0 ? cleaned : DEFAULT_VISIBLE_CATEGORIES)
}

function isHolidayEvent(e: CalendarEvent) {
  return e.source === 'holiday' || e.category === 'Holiday' || e.id.startsWith('holiday_')
}

function baseHolidayEvents() {
  return makeUsFederalHolidays({ now: new Date() })
}

function keepUserEvents(events: CalendarEvent[]) {
  return events.filter((e) => !isHolidayEvent(e))
}

function rebuildEventsWithFreshHolidays(existing: CalendarEvent[]) {
  const userEvents = keepUserEvents(existing)
  const byId = new Map<string, CalendarEvent>()
  for (const e of userEvents) byId.set(e.id, e)
  return [...baseHolidayEvents(), ...Array.from(byId.values())]
}

function normalizeAllDay(e: CalendarEvent): CalendarEvent {
  if (!e.allDay) return e

  const start = typeof e.start === 'string' && e.start.length >= 10 ? e.start.slice(0, 10) : e.start
  const end = typeof e.end === 'string' && e.end.length >= 10 ? e.end.slice(0, 10) : e.end
  return { ...e, start, end }
}

type PersistedCalendarSlice = {
  userEvents: CalendarEvent[]
  visibleCategories: CalendarCategory[]
  timeZone?: string
  savedPlaces?: SavedPlace[]
}

let initOnce = false

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      events: baseHolidayEvents(),
      visibleCategories: new Set(DEFAULT_VISIBLE_CATEGORIES),
      timeZone: 'local',

      savedPlaces: [],

      authStatus: getSupabaseClient() ? 'signedOut' : 'unconfigured',
      userEmail: undefined,
      authError: undefined,

      init: () => {
        if (initOnce) return
        initOnce = true

        const supabase = getSupabaseClient()
        if (!supabase) {
          set({ authStatus: 'unconfigured' })
          // Still refresh holidays each launch while keeping local events.
          set((state) => ({ events: rebuildEventsWithFreshHolidays(state.events) }))
          return
        }

        set({ authStatus: 'loading' })

        void supabase.auth.getSession().then(({ data, error }) => {
          if (error) {
            set({ authStatus: 'signedOut', authError: error.message })
            return
          }

          const session = data.session
          if (session?.user) {
            set({ authStatus: 'signedIn', userEmail: session.user.email ?? undefined, authError: undefined })
            void get().refreshFromDb()
          } else {
            set({ authStatus: 'signedOut', userEmail: undefined, authError: undefined })
            set((state) => ({ events: rebuildEventsWithFreshHolidays(state.events) }))
          }
        })

        supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user) {
            set({ authStatus: 'signedIn', userEmail: session.user.email ?? undefined, authError: undefined })
            void get().refreshFromDb()
          } else {
            set({ authStatus: 'signedOut', userEmail: undefined, authError: undefined })
            set((state) => ({ events: rebuildEventsWithFreshHolidays(state.events) }))
          }
        })
      },

  signInWithEmail: async (email: string) => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      set({ authStatus: 'unconfigured', authError: 'Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).' })
      return
    }

    const clean = email.trim()
    if (!clean) return

    set({ authError: undefined })
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      set({ authError: error.message })
    }
  },

      signOut: async () => {
        const supabase = getSupabaseClient()
        if (!supabase) {
          set({ authStatus: 'unconfigured', userEmail: undefined })
          set((state) => ({ events: rebuildEventsWithFreshHolidays(state.events) }))
          return
        }
        await supabase.auth.signOut()
        set({ authStatus: 'signedOut', userEmail: undefined })
        set((state) => ({ events: rebuildEventsWithFreshHolidays(state.events) }))
      },

      refreshFromDb: async () => {
        const supabase = getSupabaseClient()
        if (!supabase) return

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          set({ authError: sessionError.message })
          return
        }

        const user = sessionData.session?.user
        if (!user) {
          set((state) => ({ events: rebuildEventsWithFreshHolidays(state.events) }))
          return
        }

        const baseSelect = 'id,title,start,end,all_day,category,notes,location_name,location_address,done'
        const selectWithReminder = `${baseSelect},reminder_minutes_before`

        let warning: string | undefined

        let data: unknown[] | null = null
        let error: { message: string } | null = null

        {
          const res = await supabase.from('events').select(selectWithReminder).order('start', { ascending: true })
          data = res.data as unknown[] | null
          error = res.error as { message: string } | null
        }

        if (error) {
          const msg = String(error.message || '')
          if (msg.includes('reminder_minutes_before')) {
            warning = 'Supabase schema is missing reminders columns. Run supabase/schema.sql (or a migration) to sync reminders.'
            const res2 = await supabase.from('events').select(baseSelect).order('start', { ascending: true })
            if (res2.error) {
              set({ authError: res2.error.message })
              return
            }
            data = res2.data as unknown[] | null
          } else {
            set({ authError: msg })
            return
          }
        }

        const dbEvents: CalendarEvent[] = (data ?? []).map((rowUnknown) => {
          const row = rowUnknown as Record<string, unknown>
          const rawCategory = row.category
          const category: CalendarCategory =
            typeof rawCategory === 'string' && (ALL_CATEGORIES as readonly string[]).includes(rawCategory)
              ? (rawCategory as CalendarCategory)
              : 'Personal'

          return {
            id: String(row.id),
            title: String(row.title),
            start: String(row.start),
            end: row.end ? String(row.end) : undefined,
            allDay: Boolean(row.all_day),
            category,
            notes: row.notes ? String(row.notes) : undefined,
            locationName: row.location_name ? String(row.location_name) : undefined,
            locationAddress: row.location_address ? String(row.location_address) : undefined,
            done: Boolean(row.done),
            reminderMinutesBefore:
              row.reminder_minutes_before === null || row.reminder_minutes_before === undefined
                ? undefined
                : Number(row.reminder_minutes_before),
            source: 'user',
          }
        })

        const localUserEvents = keepUserEvents(get().events)
        const byId = new Map<string, CalendarEvent>()
        for (const e of dbEvents) byId.set(e.id, e)

        const toUpsert: CalendarEvent[] = []
        for (const e of localUserEvents) {
          if (!byId.has(e.id)) {
            byId.set(e.id, { ...e, source: 'user' })
            toUpsert.push({ ...e, source: 'user' })
          }
        }

        const mergedUserEvents = Array.from(byId.values()).sort((a, b) => a.start.localeCompare(b.start))
        set({ events: [...baseHolidayEvents(), ...mergedUserEvents], authError: warning })

        if (toUpsert.length > 0) {
          void supabase
            .from('events')
            .upsert(
              toUpsert.map((e) => ({
                id: e.id,
                title: e.title,
                start: e.start,
                end: e.end ?? null,
                all_day: Boolean(e.allDay),
                category: e.category,
                notes: e.notes ?? null,
                location_name: e.locationName ?? null,
                location_address: e.locationAddress ?? null,
                done: Boolean(e.done),
                reminder_minutes_before: e.reminderMinutesBefore ?? null,
              })),
              { onConflict: 'id' },
            )
            .then(({ error: upsertError }) => {
              if (!upsertError) return

              const msg = String(upsertError.message || '')
              if (msg.includes('reminder_minutes_before')) {
                set({ authError: 'Supabase schema is missing reminders columns. Run supabase/schema.sql (or a migration) to sync reminders.' })
                void supabase
                  .from('events')
                  .upsert(
                    toUpsert.map((e) => ({
                      id: e.id,
                      title: e.title,
                      start: e.start,
                      end: e.end ?? null,
                      all_day: Boolean(e.allDay),
                      category: e.category,
                      notes: e.notes ?? null,
                      location_name: e.locationName ?? null,
                      location_address: e.locationAddress ?? null,
                      done: Boolean(e.done),
                    })),
                    { onConflict: 'id' },
                  )
                return
              }

              set({ authError: msg })
            })
        }
      },

      clearLocalData: () => {
        try {
          localStorage.removeItem('cala_calendar_v1')
        } catch {
          // ignore
        }

        set({
          events: baseHolidayEvents(),
          visibleCategories: new Set(DEFAULT_VISIBLE_CATEGORIES),
          savedPlaces: [],
          authError: undefined,
        })

        if (get().authStatus === 'signedIn') {
          void get().refreshFromDb()
        }
      },

      setCategoryVisible: (category, visible) => {
        set((state) => {
          const next = new Set(state.visibleCategories)
          if (visible) next.add(category)
          else next.delete(category)
          return { visibleCategories: next }
        })
      },

      toggleCategory: (category) => {
        const { visibleCategories } = get()
        const visible = visibleCategories.has(category)
        get().setCategoryVisible(category, !visible)
      },

      resetCategories: () => {
        set({ visibleCategories: new Set(DEFAULT_VISIBLE_CATEGORIES) })
      },

      setTimeZone: (timeZone) => {
        const clean = typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : 'local'
        set({ timeZone: clean })
      },

      upsertSavedPlace: (place) => {
        const address = typeof place?.address === 'string' ? place.address.trim() : ''
        if (!address) return

        const key = normalizePlaceKey(address)
        const now = Date.now()
        const label = safePlaceLabel(place?.label, address)

        set((state) => {
          const existing = state.savedPlaces.find((p) => p.key === key)
          const next: SavedPlace = existing
            ? { ...existing, label, address, lastUsedAt: now }
            : { key, label, address, createdAt: now, lastUsedAt: now }

          const without = state.savedPlaces.filter((p) => p.key !== key)
          const merged = [next, ...without]
          merged.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
          return { savedPlaces: merged.slice(0, 50) }
        })
      },

      removeSavedPlace: (key) => {
        const clean = typeof key === 'string' ? key : ''
        if (!clean) return
        set((state) => ({ savedPlaces: state.savedPlaces.filter((p) => p.key !== clean) }))
      },

      clearSavedPlaces: () => {
        set({ savedPlaces: [] })
      },

      addEvent: (event) => {
        const nextEvent: CalendarEvent = {
          ...event,
          source: event.source ?? 'user',
        }

        const normalized = normalizeAllDay(nextEvent)

        set((state) => {
          const nextVisible = new Set(state.visibleCategories)
          nextVisible.add(normalized.category)
          return { events: [normalized, ...state.events], visibleCategories: nextVisible }
        })

        if (isHolidayEvent(normalized)) return
        const supabase = getSupabaseClient()
        if (!supabase) return
        if (get().authStatus !== 'signedIn') return

        void supabase
          .from('events')
          .upsert(
            {
              id: normalized.id,
              title: normalized.title,
              start: normalized.start,
              end: normalized.end ?? null,
              all_day: Boolean(normalized.allDay),
              category: normalized.category,
              notes: normalized.notes ?? null,
              location_name: normalized.locationName ?? null,
              location_address: normalized.locationAddress ?? null,
              done: Boolean(normalized.done),
              reminder_minutes_before: normalized.reminderMinutesBefore ?? null,
            },
            { onConflict: 'id' },
          )
          .then(({ error }) => {
            if (!error) return

            const msg = String(error.message || '')
            if (msg.includes('reminder_minutes_before')) {
              set({ authError: 'Supabase schema is missing reminders columns. Run supabase/schema.sql (or a migration) to sync reminders.' })
              void supabase
                .from('events')
                .upsert(
                  {
                    id: normalized.id,
                    title: normalized.title,
                    start: normalized.start,
                    end: normalized.end ?? null,
                    all_day: Boolean(normalized.allDay),
                    category: normalized.category,
                    notes: normalized.notes ?? null,
                    location_name: normalized.locationName ?? null,
                    location_address: normalized.locationAddress ?? null,
                    done: Boolean(normalized.done),
                  },
                  { onConflict: 'id' },
                )
              return
            }

            set({ authError: msg })
          })
      },

      updateEvent: (id, patch) => {
        const current = get().events.find((e) => e.id === id)
        if (current && isHolidayEvent(current)) return

        set((state) => {
          const nextVisible = new Set(state.visibleCategories)
          if (patch.category) nextVisible.add(patch.category)

          return {
            events: state.events.map((e) => {
              if (e.id !== id) return e
              return normalizeAllDay({ ...e, ...patch })
            }),
            visibleCategories: nextVisible,
          }
        })

        const supabase = getSupabaseClient()
        if (!supabase) return
        if (get().authStatus !== 'signedIn') return

        const update: Record<string, unknown> = {}
        if (patch.title !== undefined) update.title = patch.title
        if (patch.start !== undefined) update.start = patch.start
        if (patch.end !== undefined) update.end = patch.end ?? null
        if (patch.allDay !== undefined) update.all_day = Boolean(patch.allDay)
        if (patch.category !== undefined) update.category = patch.category
        if (patch.notes !== undefined) update.notes = patch.notes ?? null
        if (patch.locationName !== undefined) update.location_name = patch.locationName ?? null
        if (patch.locationAddress !== undefined) update.location_address = patch.locationAddress ?? null
        if (patch.done !== undefined) update.done = Boolean(patch.done)
        if (patch.reminderMinutesBefore !== undefined) update.reminder_minutes_before = patch.reminderMinutesBefore ?? null

        if (Object.keys(update).length === 0) return

        void supabase
          .from('events')
          .update(update)
          .eq('id', id)
          .then(({ error }) => {
            if (!error) return

            const msg = String(error.message || '')
            if (msg.includes('reminder_minutes_before')) {
              set({ authError: 'Supabase schema is missing reminders columns. Run supabase/schema.sql (or a migration) to sync reminders.' })
              const updateNoReminder: Record<string, unknown> = { ...update }
              delete updateNoReminder.reminder_minutes_before
              if (Object.keys(updateNoReminder).length === 0) return
              void supabase.from('events').update(updateNoReminder).eq('id', id)
              return
            }

            set({ authError: msg })
          })
      },

      removeEvent: (id) => {
        const current = get().events.find((e) => e.id === id)
        if (current && isHolidayEvent(current)) return

        set((state) => ({ events: state.events.filter((e) => e.id !== id) }))

        const supabase = getSupabaseClient()
        if (!supabase) return
        if (get().authStatus !== 'signedIn') return

        void supabase
          .from('events')
          .delete()
          .eq('id', id)
          .then(({ error }) => {
            if (error) set({ authError: error.message })
          })
      },
    }),
    {
      name: 'cala_calendar_v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedCalendarSlice => ({
        userEvents: keepUserEvents(state.events),
        visibleCategories: Array.from(state.visibleCategories),
        timeZone: state.timeZone,
        savedPlaces: state.savedPlaces,
      }),
      merge: (persisted, current) => {
        const p = persisted as unknown as PersistedCalendarSlice
        const userEvents = Array.isArray(p?.userEvents) ? p.userEvents : []
        const nextVisible = sanitizeVisibleCategories(p?.visibleCategories)
        const nextTz = typeof p?.timeZone === 'string' && p.timeZone.trim() ? p.timeZone.trim() : 'local'
        const nextPlacesRaw = Array.isArray(p?.savedPlaces) ? p.savedPlaces : []
        const nextPlaces: SavedPlace[] = nextPlacesRaw
          .filter((x): x is SavedPlace => {
            const p = x as SavedPlace
            return (
              Boolean(p) &&
              typeof p.key === 'string' &&
              typeof p.label === 'string' &&
              typeof p.address === 'string' &&
              typeof p.createdAt === 'number' &&
              typeof p.lastUsedAt === 'number'
            )
          })
          .slice(0, 50)

        const byId = new Map<string, CalendarEvent>()
        for (const e of userEvents) {
          if (e && typeof e.id === 'string' && !isHolidayEvent(e)) byId.set(e.id, normalizeAllDay({ ...e, source: 'user' }))
        }

        return {
          ...current,
          events: [...baseHolidayEvents(), ...Array.from(byId.values())],
          visibleCategories: nextVisible,
          timeZone: nextTz,
          savedPlaces: nextPlaces,
        }
      },
    },
  ),
)

export const selectFilteredEvents: (
  state: Pick<CalendarState, 'events' | 'visibleCategories'>,
) => CalendarEvent[] = (() => {
  let lastEvents: CalendarEvent[] | undefined
  let lastVisible: Set<CalendarCategory> | undefined
  let lastResult: CalendarEvent[] | undefined

  return (state) => {
    if (state.events === lastEvents && state.visibleCategories === lastVisible && lastResult) {
      return lastResult
    }

    lastEvents = state.events
    lastVisible = state.visibleCategories
    lastResult = state.events.filter((e) => state.visibleCategories.has(e.category))
    return lastResult
  }
})()

export { ALL_CATEGORIES }
