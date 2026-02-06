export type CalendarCategory =
  | 'Work'
  | 'Personal'
  | 'Birthday'
  | 'Health'
  | 'Learning'
  | 'Social'
  | 'Travel'
  | 'Holiday'
  | 'Observance'

export type CalendarEventSource = 'user' | 'holiday'

export type CalendarEvent = {
  id: string
  title: string
  start: string // ISO string
  end?: string // ISO string
  allDay?: boolean
  category: CalendarCategory
  notes?: string
  locationName?: string
  locationAddress?: string
  done?: boolean
  reminderMinutesBefore?: number
  source?: CalendarEventSource
}
