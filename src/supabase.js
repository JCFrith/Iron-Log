import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && key ? createClient(url, key) : null

export async function loadAthleteContext() {
  if (!supabase) return { mode: 'demo' }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { mode: 'demo' }

  const userId = session.user.id
  const [{ data: profile }, { data: whoopDay }, { data: logs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('whoop_days').select('*').eq('user_id', userId).order('day', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('logs').select('data').eq('user_id', userId).maybeSingle(),
  ])

  return { mode: 'live', session, profile, whoopDay, logs }
}
