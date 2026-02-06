import { addDays, addHours, formatISO, setHours, setMinutes, startOfDay, subDays } from 'date-fns'
import type { CalendarCategory, CalendarEvent } from '../types/calendar'

const CATEGORIES: CalendarCategory[] = ['Work', 'Personal', 'Birthday', 'Health', 'Learning', 'Social', 'Travel', 'Holiday', 'Observance']

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]!
}

function titleFor(category: CalendarCategory, rng: () => number): string {
  const titles: Record<CalendarCategory, string[]> = {
    Work: ['Design review', 'Sprint planning', '1:1', 'Deep work block', 'Ship release'],
    Personal: ['Family time', 'Errands', 'Home reset', 'Call a friend', 'Personal project'],
    Birthday: ['Birthday 🎂', 'Birthday dinner', 'Birthday call', 'Party prep', 'Surprise planning'],
    Health: ['Gym', 'Walk', 'Meal prep', 'Stretch + mobility', 'Meditation'],
    Learning: ['Read + notes', 'Course session', 'Practice problems', 'Write summary', 'Build a demo'],
    Social: ['Coffee', 'Dinner', 'Community meetup', 'Game night', 'Catch up'],
    Travel: ['Trip planning', 'Pack', 'Explore', 'Transit', 'Hotel check-in'],
    Holiday: ['Holiday (all-day)'],
    Observance: ['Observance (all-day)'],
  }

  return pick(rng, titles[category])
}

export function makeSampleEvents(now = new Date()): CalendarEvent[] {
  const start = startOfDay(subDays(now, 28))
  const rng = mulberry32(20260202)

  const events: CalendarEvent[] = []

  for (let i = 0; i < 90; i++) {
    const dayOffset = Math.floor(rng() * 29)
    const category = pick(rng, CATEGORIES)

    const base = addDays(start, dayOffset)
    const hour = 7 + Math.floor(rng() * 12)
    const minute = rng() > 0.7 ? 30 : 0

    const durationHours = category === 'Work' ? 1 + Math.floor(rng() * 2) : 1

    const startAt = setMinutes(setHours(base, hour), minute)
    const endAt = addHours(startAt, durationHours)

    events.push({
      id: `evt_${i}_${dayOffset}`,
      title: titleFor(category, rng),
      start: formatISO(startAt),
      end: formatISO(endAt),
      category,
    })
  }

  // A couple all-day anchors
  events.push({
    id: 'anchor_1',
    title: 'Quarterly goals (all-day)',
    start: formatISO(startOfDay(addDays(now, -2))),
    allDay: true,
    category: 'Work',
  })

  events.push({
    id: 'anchor_2',
    title: 'Weekend reset (all-day)',
    start: formatISO(startOfDay(addDays(now, 4))),
    allDay: true,
    category: 'Personal',
  })

  return events
}
