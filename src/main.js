import './styles.css'
import { loadAthleteContext } from './supabase.js'
import { views } from './views.js'
import { LEAN_MASS_PROGRAM, createDraft, todayWorkoutId } from './workoutProgram.js'
import { clearDraft, loadDraft, loadLocalSessions, mergeSessions, saveDraft, saveLocalSessions } from './workoutStore.js'

const navigation = [
  ['dashboard', 'Command'],
  ['workout', 'Workout'],
  ['analytics', 'Analytics'],
  ['body', 'Body'],
