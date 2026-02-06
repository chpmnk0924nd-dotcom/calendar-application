import type { CalendarEvent } from '../types/calendar'

const WEEKDAY = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
} as const

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number) {
  const first = new Date(Date.UTC(year, monthIndex, 1))
  const firstWeekday = first.getUTCDay()
  const delta = (weekday - firstWeekday + 7) % 7
  const day = 1 + delta + (n - 1) * 7
  return new Date(Date.UTC(year, monthIndex, day))
}

// Gregorian Easter Sunday (UTC date at midnight)
// Algorithm: Meeus/Jones/Butcher
function easterSundayUtc(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number) {
  // Go to last day of month, then walk backwards to weekday
  const last = new Date(Date.UTC(year, monthIndex + 1, 0))
  const lastWeekday = last.getUTCDay()
  const delta = (lastWeekday - weekday + 7) % 7
  const day = last.getUTCDate() - delta
  return new Date(Date.UTC(year, monthIndex, day))
}

function dateKey(utcDate: Date) {
  const y = utcDate.getUTCFullYear()
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utcDate.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function emojiForHolidayTitle(baseTitle: string): string {
  const t = baseTitle.toLowerCase()

  if (t.includes("new year's")) return '🎊'
  if (t.includes('martin luther king')) return '✊'
  if (t.includes("washington's birthday") || t.includes("president")) return '🇺🇸'
  if (t.includes('memorial day')) return '🕯️'
  if (t.includes('juneteenth')) return '✊'
  if (t.includes('independence day')) return '🎆'
  if (t.includes('labor day')) return '🛠️'
  if (t.includes('columbus day')) return '🧭'
  if (t.includes('veterans day')) return '🎖️'
  if (t.includes('thanksgiving')) return '🦃'
  if (t.includes('christmas')) return '🎄'
  if (t.includes("valentine")) return '❤️'
  if (t.includes("mother's day") || t.includes('mothers day')) return '💖'
  if (t.includes('st. patrick') || t.includes('st patrick')) return '🍀'
  if (t.includes('halloween')) return '🎃'
  if (t.includes('easter')) return '🐰'
  if (t.includes("father's day") || t.includes('fathers day')) return '🧔'
  if (t.includes("new year's eve")) return '🥂'
  if (t.includes('christmas eve')) return '🕯️'
  if (t.includes('black friday')) return '🛍️'
  if (t.includes('cyber monday')) return '🖥️'
  if (t.includes('earth day')) return '🌎'
  if (t.includes('arbor day')) return '🌳'
  if (t.includes('cinco de mayo')) return '🇲🇽'
  if (t.includes("april fool")) return '🤡'
  if (t.includes('groundhog')) return '🦫'
  if (t.includes('super bowl')) return '🏈'
  if (t.includes('mardi gras')) return '🎭'
  if (t.includes('ash wednesday')) return '⛪'
  if (t.includes('good friday')) return '✝️'
  if (t.includes('palm sunday')) return '🌿'
  if (t.includes('election day')) return '🗳️'
  if (t.includes('tax day')) return '🧾'
  if (t.includes('flag day')) return '🏳️'
  if (t.includes('patriot day')) return '🕊️'
  if (t.includes('constitution day')) return '📜'
  if (t.includes('daylight saving') || t.includes('dst')) return '⏰'

  return '📅'
}

function slugifyTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

function addDaysUtc(utcDate: Date, deltaDays: number) {
  return new Date(utcDate.getTime() + deltaDays * 24 * 60 * 60 * 1000)
}

function makeGeneratedEvent(baseTitle: string, utcDate: Date, category: 'Holiday' | 'Observance'): CalendarEvent {
  const startIso = dateKey(utcDate)
  const emoji = emojiForHolidayTitle(baseTitle)
  const title = emoji ? `${emoji} ${baseTitle}` : baseTitle
  return {
    id: `holiday_${dateKey(utcDate)}_${slugifyTitle(baseTitle)}_${category.toLowerCase()}`,
    title,
    start: startIso,
    allDay: true,
    category,
    source: 'holiday',
  }
}

export function makeUsFederalHolidays(options?: { now?: Date; startYear?: number; endYear?: number }): CalendarEvent[] {
  const now = options?.now ?? new Date()
  const currentYear = now.getFullYear()

  const startYear = options?.startYear ?? currentYear - 1
  const endYear = options?.endYear ?? currentYear + 2

  const events: CalendarEvent[] = []

  for (let year = startYear; year <= endYear; year += 1) {
    // Fixed-date holidays (actual date)
    const newYears = new Date(Date.UTC(year, 0, 1))
    const juneteenth = new Date(Date.UTC(year, 5, 19))
    const independence = new Date(Date.UTC(year, 6, 4))
    const veterans = new Date(Date.UTC(year, 10, 11))
    const christmas = new Date(Date.UTC(year, 11, 25))

    // Floating holidays
    const mlk = nthWeekdayOfMonth(year, 0, WEEKDAY.Monday, 3) // 3rd Monday in Jan
    const presidents = nthWeekdayOfMonth(year, 1, WEEKDAY.Monday, 3) // 3rd Monday in Feb
    const memorial = lastWeekdayOfMonth(year, 4, WEEKDAY.Monday) // last Monday in May
    const labor = nthWeekdayOfMonth(year, 8, WEEKDAY.Monday, 1) // 1st Monday in Sep
    const columbus = nthWeekdayOfMonth(year, 9, WEEKDAY.Monday, 2) // 2nd Monday in Oct
    const thanksgiving = nthWeekdayOfMonth(year, 10, WEEKDAY.Thursday, 4) // 4th Thu in Nov

    // Popular non-federal holidays (fixed-date; not observed)
    const valentines = new Date(Date.UTC(year, 1, 14))
    const stPatricks = new Date(Date.UTC(year, 2, 17))
    const halloween = new Date(Date.UTC(year, 9, 31))
    const mothersDay = nthWeekdayOfMonth(year, 4, WEEKDAY.Sunday, 2) // 2nd Sunday in May
    const easter = easterSundayUtc(year)

    // Common US observances (unofficial) — curated to avoid flooding the calendar.
    const newYearsEve = new Date(Date.UTC(year, 11, 31))
    const christmasEve = new Date(Date.UTC(year, 11, 24))
    const groundhogDay = new Date(Date.UTC(year, 1, 2))
    const aprilFools = new Date(Date.UTC(year, 3, 1))
    const earthDay = new Date(Date.UTC(year, 3, 22))
    const cincoDeMayo = new Date(Date.UTC(year, 4, 5))
    const flagDay = new Date(Date.UTC(year, 5, 14))
    const fathersDay = nthWeekdayOfMonth(year, 5, WEEKDAY.Sunday, 3) // 3rd Sunday in June
    const patriotDay = new Date(Date.UTC(year, 8, 11))
    const constitutionDay = new Date(Date.UTC(year, 8, 17))
    const arborDay = nthWeekdayOfMonth(year, 3, WEEKDAY.Friday, 4) // approximates “last Friday in April”

    // DST (US): 2nd Sunday in March, 1st Sunday in November
    const dstStart = nthWeekdayOfMonth(year, 2, WEEKDAY.Sunday, 2)
    const dstEnd = nthWeekdayOfMonth(year, 10, WEEKDAY.Sunday, 1)

    // Election Day (US): Tuesday after the first Monday in November
    const firstMondayNov = nthWeekdayOfMonth(year, 10, WEEKDAY.Monday, 1)
    const electionDay = addDaysUtc(firstMondayNov, 1) // Tuesday

    // Thanksgiving-adjacent observances
    const blackFriday = addDaysUtc(thanksgiving, 1)
    const cyberMonday = addDaysUtc(thanksgiving, 4)

    // Easter-adjacent observances
    const palmSunday = addDaysUtc(easter, -7)
    const goodFriday = addDaysUtc(easter, -2)
    const ashWednesday = addDaysUtc(easter, -46)
    const mardiGras = addDaysUtc(easter, -47)

    // Super Bowl Sunday (approx): 2nd Sunday in February (works for recent years)
    const superBowlSunday = nthWeekdayOfMonth(year, 1, WEEKDAY.Sunday, 2)

    // Tax Day (approx): April 15 (ignores Emancipation Day/weekend shifts)
    const taxDay = new Date(Date.UTC(year, 3, 15))

    const holidayCandidates: Array<[string, Date]> = [
      ["New Year's Day", newYears],
      ['Martin Luther King Jr. Day', mlk],
      ["Washington's Birthday", presidents],
      ['Memorial Day', memorial],
      ['Juneteenth National Independence Day', juneteenth],
      ['Independence Day', independence],
      ['Labor Day', labor],
      ['Columbus Day', columbus],
      ['Veterans Day', veterans],
      ['Thanksgiving Day', thanksgiving],
      ['Christmas Day', christmas],
      ["Valentine's Day", valentines],
      ["St. Patrick's Day", stPatricks],
      ['Halloween', halloween],
      ["Mother's Day", mothersDay],
      ['Easter', easter],
    ]

    const observanceCandidates: Array<[string, Date]> = [
      ["New Year's Eve", newYearsEve],
      ['Christmas Eve', christmasEve],
      ['Groundhog Day', groundhogDay],
      ["April Fools' Day", aprilFools],
      ['Earth Day', earthDay],
      ['Arbor Day', arborDay],
      ['Cinco de Mayo', cincoDeMayo],
      ["Father's Day", fathersDay],
      ['Flag Day', flagDay],
      ['Patriot Day', patriotDay],
      ['Constitution Day', constitutionDay],
      ['Daylight Saving Time Begins', dstStart],
      ['Daylight Saving Time Ends', dstEnd],
      ['Election Day', electionDay],
      ['Black Friday', blackFriday],
      ['Cyber Monday', cyberMonday],
      ['Palm Sunday', palmSunday],
      ['Good Friday', goodFriday],
      ['Ash Wednesday', ashWednesday],
      ['Mardi Gras', mardiGras],
      ['Super Bowl Sunday', superBowlSunday],
      ['Tax Day', taxDay],
    ]

    for (const [title, d] of holidayCandidates) {
      // Only include events that land inside the requested year range.
      const y = d.getUTCFullYear()
      if (y < startYear || y > endYear) continue
      events.push(makeGeneratedEvent(title, d, 'Holiday'))
    }

    for (const [title, d] of observanceCandidates) {
      const y = d.getUTCFullYear()
      if (y < startYear || y > endYear) continue
      events.push(makeGeneratedEvent(title, d, 'Observance'))
    }
  }

  // De-dupe by id (in case observed dates collide across year loop)
  const seen = new Set<string>()
  return events.filter((e) => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })
}
