import { h } from '../lib/dom'
import { supabase } from '../lib/supabase'

export function loginView(): HTMLElement {
  let mode: 'in' | 'up' = 'in'
  const email = h('input', { type: 'email', required: true, placeholder: 'email', autocomplete: 'email' })
  const password = h('input', { type: 'password', required: true, minLength: 6, placeholder: 'password' })
  const msg = h('div', { class: 'error', hidden: true })
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Sign in')
  const toggle = h('button', { class: 'link', type: 'button' }, 'No account? Sign up')

  const setMode = (m: 'in' | 'up') => {
    mode = m
    submit.textContent = m === 'in' ? 'Sign in' : 'Create account'
    toggle.textContent = m === 'in' ? 'No account? Sign up' : 'Have an account? Sign in'
    msg.hidden = true
  }
  toggle.onclick = () => setMode(mode === 'in' ? 'up' : 'in')

  const form = h('form', {
    class: 'card login',
    onsubmit: async (e: Event) => {
      e.preventDefault()
      submit.disabled = true
      msg.hidden = true
      const creds = { email: email.value.trim(), password: password.value }
      const { data, error } = mode === 'in' ? await supabase.auth.signInWithPassword(creds) : await supabase.auth.signUp(creds)
      submit.disabled = false
      if (error) {
        msg.hidden = false
        msg.textContent = error.message
      } else if (mode === 'up' && !data.session) {
        msg.hidden = false
        msg.className = 'ok'
        msg.textContent = 'Account created. Check your email to confirm, then sign in.'
      }
    },
  }, h('h1', null, 'PACT PCB Assembly'), h('p', { class: 'muted' }, 'Sign in to start an assembly session.'), email, password, msg, submit, toggle)
  return h('div', { class: 'center' }, form)
}
