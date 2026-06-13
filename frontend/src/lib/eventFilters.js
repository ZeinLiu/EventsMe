import { supabase } from './supabase'

export const DEFAULT_FILTERS = {
  categories: [],
  sources: [],
  price: 'any',
  priceMin: 0,
  priceMax: 500,
  date: 'any',
  dateFrom: null,
  dateTo: null,
  audience: [],
  admission: 'both',
}

export function matchesAudience(event, audiences) {
  if (audiences.length === 0) return true
  const text = (
    (event.category ?? '') + ' ' +
    (event.short_summary ?? '') + ' ' +
    (event.description ?? '')
  ).toLowerCase()

  return audiences.some(a => {
    if (a === 'toddlers')
      return text.includes('toddler') || text.includes('baby') || text.includes('infant') ||
             text.includes('0-3') || text.includes('under 3')
    if (a === 'young_kids')
      return text.includes('preschool') || text.includes('4-6') || text.includes('kindergarten') ||
             text.includes('nursery') || text.includes('aged 4') || text.includes('aged 5') ||
             text.includes('aged 6')
    if (a === 'kids')
      return text.includes('kids') || text.includes('children') || text.includes('7-12') ||
             text.includes('primary school') || text.includes('aged 7') || text.includes('aged 8') ||
             text.includes('aged 9') || text.includes('aged 10') || text.includes('aged 11') ||
             text.includes('aged 12')
    if (a === 'teens')
      return text.includes('teen') || text.includes('youth') || text.includes('13-17') ||
             text.includes('secondary school') || text.includes('adolescent')
    if (a === 'adults')
      return text.includes('adult') || text.includes('parent') || text.includes('family') ||
             text.includes('all ages') || text.includes('everyone')
    return false
  })
}

export function buildEventsQuery(filters) {
  let query = supabase
    .from('events')
    .select('*')
    .eq('is_archived', false)

  if (filters.categories.length > 0)
    query = query.in('category', filters.categories)

  if (filters.sources.length > 0)
    query = query.in('source_name', filters.sources)

  if (filters.admission === 'free' || filters.price === 'free')
    query = query.eq('is_free', true)
  else if (filters.admission === 'paid')
    query = query.eq('is_free', false)

  if (filters.price === 'under20')
    query = query.lte('price_min', 20)
  else if (filters.price === 'under50')
    query = query.lte('price_min', 50)
  else if (filters.price === 'above50')
    query = query.gte('price_min', 50)
  else if (filters.price === 'custom')
    query = query.gte('price_min', filters.priceMin).lte('price_max', filters.priceMax)

  const now = new Date()
  if (filters.date === 'weekend') {
    const daysToFri = (5 - now.getDay() + 7) % 7
    const fri = new Date(now)
    fri.setDate(now.getDate() + (daysToFri === 0 ? 7 : daysToFri))
    fri.setHours(0, 0, 0, 0)
    const sun = new Date(fri)
    sun.setDate(fri.getDate() + 2)
    sun.setHours(23, 59, 59, 999)
    query = query.gte('event_date', fri.toISOString()).lte('event_date', sun.toISOString())
  } else if (filters.date === 'week') {
    const next7 = new Date(now)
    next7.setDate(now.getDate() + 7)
    query = query.gte('event_date', now.toISOString()).lte('event_date', next7.toISOString())
  } else if (filters.date === 'month') {
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    query = query.gte('event_date', now.toISOString()).lte('event_date', endMonth.toISOString())
  } else if (filters.date === 'custom' && filters.dateFrom && filters.dateTo) {
    query = query.gte('event_date', filters.dateFrom).lte('event_date', filters.dateTo)
  }

  return query
}
