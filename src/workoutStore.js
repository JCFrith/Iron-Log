const DRAFT_KEY = 'iron-log-v2-active-workout'
const HISTORY_KEY = 'iron-log-v2-sessions'

export function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') } catch { return null }
}

export function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

export function loadLocalSessions() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

export function saveLocalSessions(sessions) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions))
}

export function mergeSessions(localSessions = [], cloudSessions = []) {
  const merged = new Map()
  ;[...cloudSessions, ...localSessions].forEach((session) => merged.set(session.id, session))
  return [...merged.values()].sort((a, b) => new Date(a.date) - new Date(b.date))
}

export function previousExercisePerformance(sessions, exerciseId) {
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const sets = sessions[index]?.entries?.[exerciseId]
    if (Array.isArray(sets) && sets.length) {
      const completed = sets.filter((set) => Number(set.r) > 0)
      if (!completed.length) continue
      const best = completed.reduce((winner, set) => {
        const score = Number(set.w || 0) * Number(set.r || 0)
        const winnerScore = Number(winner.w || 0) * Number(winner.r || 0)
        return score > winnerScore ? set : winner
      }, completed[0])
      return { session: sessions[index], sets: completed, best }
    }
  }
  return null
}

export function workoutVolume(draft) {
  return Object.values(draft?.entries || {}).flat().reduce((total, set) => {
    if (!set.done) return total
    return total + (Number(set.w) || 0) * (Number(set.r) || 0)
  }, 0)
}

export function completionStats(draft) {
  const sets = Object.values(draft?.entries || {}).flat()
  const completed = sets.filter((set) => set.done).length
  return { completed, total: sets.length, percent: sets.length ? Math.round(completed / sets.length * 100) : 0 }
}
