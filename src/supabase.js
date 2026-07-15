import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && key ? createClient(url, key) : null

export async function loadAthleteContext() {
  if (!supabase) return { mode: 'demo', logs: { data: { sessions: [] } } }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { mode: 'demo', logs: { data