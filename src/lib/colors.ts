import type { CalendarCategory } from '../types/calendar'
import type { CSSProperties } from 'react'

export const CATEGORY_COLORS: Record<CalendarCategory, { bg: string; fg: string }> = {
  Work: { bg: '#22D3EE', fg: '#06121B' },
  Personal: { bg: '#C084FC', fg: '#12051A' },
  Birthday: { bg: '#FB7185', fg: '#25030A' },
  Health: { bg: '#2DFF9A', fg: '#042013' },
  Learning: { bg: '#FDE047', fg: '#201A00' },
  Social: { bg: '#FF4FD8', fg: '#21001A' },
  Travel: { bg: '#8B5CF6', fg: '#0E071F' },
  Holiday: { bg: '#FF7A18', fg: '#230B00' },
  Observance: { bg: '#FF7AF6', fg: '#240025' },
}

export function categoryToCss(category: CalendarCategory): CSSProperties {
  const { bg, fg } = CATEGORY_COLORS[category]
  return {
    backgroundColor: bg,
    borderColor: bg,
    color: fg,
  }
}
