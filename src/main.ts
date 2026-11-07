import './style.css'
import type { Session } from '@supabase/supabase-js'
import { api } from './lib/api'
import { h } from './lib/dom'
import { configured, supabase } from './lib/supabase'
import type { Profile } from './lib/types'
import { adminView } from './views/admin'
import { boardView } from './views/board'
import { dashboardView } from './views/dashboard'
import { loginView } from './views/login'
import { defectsView } from './views/defects'
import { readyView } from './views/ready'
import { stockView } from './views/stock'
import { timingView } from './views/timing'
import { traceView } from './views/trace'

const app = document.getElementById('app')!
let session: Session | null = null
let profile: Profile | null = null
let destroyView: (() => void) | undefined
let renderToken = 0

async function render() {
  const token = ++renderToken
  destroyView?.()
  destroyView = undefined

  if (!configured) {
    app.replaceChildren(h('div', { class: 'center' }, h('div', { class: 'card' }, h('h1', null, 'Supabase not configured'),
      h('p', null, 'Copy .env.example to .env, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.'))))
    return
  }
  if (!session) return app.replaceChildren(loginView())

  profile ??= await api.profile(session.user.id).catch(() => null)
  if (token !== renderToken) return
  const me: Profile = profile ?? { id: session.user.id, email: session.user.email ?? null, role: 'operator' }

  const route = location.hash.replace(/^#\/?/, '')
  const body = h('main', { class: 'page' }, h('p', { class: 'muted' }, 'Loading…'))
  app.replaceChildren(
    h('header', { class: 'top' },
      h('strong', null, 'PACT Assembly'),
      h('a', { href: '#/', class: route === '' || route.startsWith('board/') ? 'active' : '' }, 'Boards'),
      h('a', { href: '#/stock', class: route === 'stock' ? 'active' : '' }, 'Stock'),
      h('a', { href: '#/ready', class: route === 'ready' ? 'active' : '' }, 'Build check'),
      h('a', { href: '#/trace', class: route === 'trace' ? 'active' : '' }, 'Trace'),
      h('a', { href: '#/defects', class: route === 'defects' ? 'active' : '' }, 'Defects'),
      h('a', { href: '#/timing', class: route === 'timing' ? 'active' : '' }, 'Timing'),
      me.role === 'admin' ? h('a', { href: '#/admin', class: route === 'admin' ? 'active' : '' }, 'Admin') : null,
      h('span', { class: 'grow' }),
      h('span', { class: 'muted small' }, `${me.email} (${me.role})`),
      h('button', { class: 'btn small', onclick: () => void supabase.auth.signOut() }, 'Sign out')),
    body)

  try {
    let el: HTMLElement
    let destroy: (() => void) | undefined
    if (route.startsWith('board/')) {
      const v = await boardView(decodeURIComponent(route.slice(6)), me)
      el = v.el
      destroy = v.destroy
    } else if (route === 'ready') {
      el = await readyView()
    } else if (route === 'defects') {
      el = await defectsView()
    } else if (route === 'timing') {
      el = await timingView()
    } else if (route === 'trace') {
      const v = await traceView()
      el = v.el
      destroy = v.destroy
    } else if (route === 'stock') {
      el = await stockView(me)
    } else if (route === 'admin') {
      el = await adminView(me)
    } else {
      const v = await dashboardView()
      el = v.el
      destroy = v.destroy
    }
    if (token !== renderToken) return destroy?.()
    destroyView = destroy
    body.replaceChildren(el)
  } catch (e) {
    body.replaceChildren(h('div', { class: 'banner error' }, e instanceof Error ? e.message : String(e)))
  }
}

supabase.auth.onAuthStateChange((event, s) => {
  if (event === 'TOKEN_REFRESHED') return
  if (s?.user.id !== session?.user.id) profile = null
  session = s
  void render()
})
window.addEventListener('hashchange', () => void render())
void supabase.auth.getSession().then(({ data }) => {
  session = data.session
  void render()
})
