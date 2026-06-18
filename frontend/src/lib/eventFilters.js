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

export function buildEventsQuery(filters) {
  let query = supabase
    .from('events')
    .select('*')
    .or('is_archived.is.null,is_archived.eq.false')

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

  if (filters.audience.length > 0) {
    const list = filters.audience.join(',')
    query = query.or(`audience.ov.{${list}},audience.is.null`)
  }

  return query
}
