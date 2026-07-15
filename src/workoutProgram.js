const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const exercise = (name, min, max, category, sets = 2) => ({ id: slug(name), name, min, max, category, sets })

export const BUILTIN_SCHEDULE = { 1: 'A', 2: 'C', 3: 'B', 4: 'C', 5: ['A', 'B'], 6: null, 0: null }

export const LEAN_MASS_PROGRAM = {
  name: 'Full Body Male — Gain Lean Mass',
  weekTarget: 5,
  increment: 5,
  workouts: {
    A: { label: 'Workout A', tag: 'HEAVY', exercises: [
      exercise('Leg Press', 6, 8, 'quads'), exercise('Seated Leg Curl', 8, 10, 'hams'), exercise('Machine Chest Press', 6, 8, 'chest_press'),
      exercise('Chest-Supported Row', 6, 8, 'row'), exercise('Machine Shoulder Press', 6, 8, 'sh_press'), exercise('Lat Pulldown', 6, 8, 'vert_pull'),
      exercise('Cable Curl', 8, 12, 'biceps'), exercise('Tricep Pressdown', 8, 12, 'triceps'), exercise('Standing Calf Raise', 10, 15, 'calves'),
      exercise('Hanging Leg Raise', 10, 15, 'abs')
    ]},
    B: { label: 'Workout B', tag: 'HEAVY', exercises: [
      exercise('Hack Squat', 6, 8, 'quads'), exercise('Hip Thrust', 8, 10, 'glutes'), exercise('Incline Machine Press', 6, 8, 'incline_press'),
      exercise('Seated Cable Row', 6, 8, 'row'), exercise('Pull-Up', 6, 8, 'vert_pull'), exercise('Dumbbell Lateral Raise', 10, 15, 'side_delt'),
      exercise('Machine Preacher Curl', 8, 12, 'biceps'), exercise('Overhead Cable Tricep Ext', 8, 12, 'triceps'),
      exercise('Seated Calf Raise', 10, 15, 'calves'), exercise('Back Extension', 10, 15, 'glutes'), exercise('Cable Crunch', 12, 15, 'abs')
    ]},
    C: { label: 'Workout C', tag: 'PUMP', exercises: [
      exercise('Leg Extension', 10, 15, 'quads'), exercise('Lying Leg Curl', 10, 15, 'hams'), exercise('Pec Deck', 10, 15, 'chest_fly'),
      exercise('Machine Row', 10, 15, 'row'), exercise('Reverse Pec Deck', 10, 15, 'rear_delt'), exercise('Cable Lateral Raise', 12, 15, 'side_delt'),
      exercise('Hammer Curl', 10, 12, 'biceps'), exercise('Rope Pressdown', 10, 12, 'triceps'), exercise('Calf Raise', 12, 20, 'calves'),
      exercise('Ab Machine', 12, 15, 'abs')
    ]}
  }
}

export function todayWorkoutId(date = new Date()) {
  const scheduled = BUILTIN_SCHEDULE[date.getDay()]
  return Array.isArray(scheduled) ? scheduled[0] : scheduled || 'A'
}

export function normalizeProgram(programRow) {
  const data = programRow?.data
  if (!data?.workouts) return LEAN_MASS_PROGRAM
  const workouts = {}
  Object.entries(data.workouts).forEach(([id, workout]) => {
    workouts[id] = {
      label: workout.label || `Workout ${id}`,
      tag: workout.tag || '',
      exercises: (workout.exercises || []).map((item) => ({
        id: slug(item.name), name: item.name, min: Number(item.min) || 8, max: Number(item.max) || 12,
        sets: Number(item.sets) || 2, category: item.cat || null, note: item.note || '', rest: Number(item.rest) || 0
      }))
    }
  })
  return { name: programRow.name || LEAN_MASS_PROGRAM.name, workouts, schedule: data.schedule || BUILTIN_SCHEDULE, weekTarget: data.weekTarget || 5, increment: data.inc || 5 }
}

export function createDraft(program, workoutId, existingDraft) {
  if (existingDraft?.workoutId === workoutId) return existingDraft
  const workout = program.workouts[workoutId] || program.workouts[Object.keys(program.workouts)[0]]
  return {
    id: Date.now(), workoutId, workoutLabel: workout.label, startedAt: new Date().toISOString(), note: '',
    entries: Object.fromEntries(workout.exercises.map((item) => [item.id, Array.from({ length: item.sets }, () => ({ w: '', r: '', done: false }))]))
  }
}
