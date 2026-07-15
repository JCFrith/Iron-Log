import './styles.css'
import { loadAthleteContext } from './supabase.js'
import { views } from './views.js'

const navigation = [['dashboard', 'Command'], ['workout', 'Workout'], ['analytics', 'Analytics'], ['nutrition', 'Nutrition'], ['body', 'Body'], ['trainer', 'AI Trainer'], ['library', 'Library'], ['records', 'Records'], ['social', 'Social'], ['coach', 'Coach']]
const state = { page: 'dashboard', readiness: 82, mission: 'Upper Body Hypertrophy', name: 'Chase', role: 'Athlete · Level 18', status: 'AI systems online', adjusted: false }
const root = document.querySelector('#root')
let toastTimer

function nav(items, mobile = false) {
  return items.map(([id, label]) => `<button class="${state.page === id ? 'on' : ''}" data-action="go:${id}">${label}</button>`).join('')
}

function render() {
  root.innerHTML = `<div class="app"><aside><div class="brand"><div class="logo">IL</div><div><b>IRON LOG</b><small>PERFORMANCE OS</small></div></div><nav class="nav">${nav(navigation)}</nav><div class="user"><b>${state.name}</b><small>${state.role}</small></div></aside><main class="main"><header class="top"><span class="online">${state.status}</span><button class="secondary" data-action="toast:Settings ready" aria-label="Open settings">⚙</button></header><div class="content">${views[state.page](state)}</div></main></div><nav class="mobile">${nav(navigation.slice(0, 6), true)}</nav><form class="command" id="command-form"><input id="command-input" aria-label="AI command" placeholder="Tell Iron Log what you need…" /><button aria-label="Send command">↑</button></form><div class="toast" id="toast" role="status"></div>`
}

function showToast(message) {
  const toast = document.querySelector('#toast')
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2100)
}

function go(page) {
  state.page = page
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function handleCommand(command) {
  const query = command.trim().toLowerCase()
  if (!query) return
  if (query.includes('45') && query.includes('push')) { go('workout'); showToast('45-minute push mission generated') }
  else if (query.includes('weak')) { go('analytics'); showToast('Weakest area: lower-body frequency') }
  else if (query.includes('nutrition') || query.includes('meal')) go('nutrition')
  else if (query.includes('shoulder') || query.includes('hurt')) showToast('Shoulder-safe substitutions applied')
  else if (query.includes('volume') && query.includes('20')) showToast('Next week volume reduced 20%')
  else showToast('Command applied')
}

root.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]')
  if (!button) return
  const [type, ...parts] = button.dataset.action.split(':')
  const value = parts.join(':')
  if (type === 'go') go(value)
  if (type === 'toast') showToast(value)
  if (type === 'adjust') { state.adjusted = true; state.mission = 'AI-Adjusted Upper Body'; render(); showToast('Mission adjusted') }
})

root.addEventListener('submit', (event) => {
  if (event.target.id !== 'command-form') return
  event.preventDefault()
  handleCommand(event.target.elements['command-input'].value)
})

async function hydrate() {
  try {
    const context = await loadAthleteContext()
    if (context.mode === 'demo') {
      state.status = 'Demo mode · configure VITE_SUPABASE_* for live data'
    } else {
      const { profile, whoopDay, session } = context
      state.name = profile?.display_name || session.user.email.split('@')[0]
      state.role = `${profile?.is_coach ? 'Coach + Athlete' : 'Athlete'} · Level 18`
      if (whoopDay?.recovery_score != null) state.readiness = Math.round(whoopDay.recovery_score)
      state.status = 'Supabase + WHOOP synchronized'
    }
  } catch (error) {
    console.warn('Unable to hydrate athlete context', error)
    state.status = 'Connected · partial data mode'
  }
  render()
}

render()
hydrate()
