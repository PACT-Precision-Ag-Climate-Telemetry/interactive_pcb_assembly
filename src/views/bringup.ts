import { api } from '../lib/api'
import { h } from '../lib/dom'
import { BRINGUP, evaluate, summarize, type TestResult } from '../lib/bringup'
import type { Board, Profile } from '../lib/types'

/** Bring-up test card for a finished board: measured values or yes/no checks, saved per test. */
export async function bringupCard(board: Board, me: Profile): Promise<HTMLElement> {
  const tests = BRINGUP[board.board_type]
  const results = new Map<string, TestResult>((await api.tests(board.id)).map((r) => [r.test_key, r]))
  const summary = h('div', { class: 'banner' })
  const status = h('span', { class: 'small muted' })

  const refresh = () => {
    const s = summarize(board.board_type, [...results.values()])
    summary.className = `banner ${s.passed ? 'ok' : s.failed ? 'error' : 'info'}`
    summary.textContent = s.passed ? 'Bring-up PASSED: every required test is OK.'
      : s.failed ? `${s.failed} test(s) failed. Fix and retest.`
      : `${s.done} / ${s.required} required tests passed.`
  }

  const rows = tests.map((t) => {
    const prev = results.get(t.key)
    const value = h('input', { type: 'number', step: 'any', class: 'narrow', value: prev?.value != null ? String(prev.value) : '', placeholder: t.unit ?? '' })
    const check = h('input', { type: 'checkbox', checked: prev?.passed ?? false })
    const note = h('input', { placeholder: 'Note', value: prev?.note ?? '' })
    const badge = h('span', { class: 'tag' })
    const showBadge = () => {
      const r = results.get(t.key)
      badge.textContent = !r ? 'not tested' : r.passed ? 'PASS' : 'FAIL'
      badge.className = `tag ${!r ? '' : r.passed ? 'scan' : 'fail'}`
    }
    showBadge()
    const save = h('button', { class: 'btn small', onclick: async () => {
      const v = value.value === '' ? null : Number(value.value)
      const numeric = t.min != null || t.max != null
      if (numeric && v == null) return void (status.textContent = `Enter the measured value for "${t.title}".`)
      const r: TestResult = { test_key: t.key, value: numeric ? v : null, passed: evaluate(t, v, check.checked), note: note.value.trim() || null }
      try {
        await api.saveTest(board.id, r, me.id)
        results.set(t.key, r)
        showBadge()
        refresh()
        status.textContent = `Saved: ${t.title} ${r.passed ? 'passed' : 'FAILED'}.`
      } catch (e) { status.textContent = e instanceof Error ? e.message : String(e) }
    } }, 'Save')
    const range = t.min != null || t.max != null ? `${t.min ?? '…'} to ${t.max ?? '…'} ${t.unit ?? ''}` : null
    return h('div', { class: 'part' },
      h('div', { class: 'part-head' }, h('strong', null, t.title), t.optional ? h('span', { class: 'tag manual' }, 'optional') : null, badge),
      h('div', { class: 'small' }, t.how),
      h('div', { class: 'form-row' },
        range ? h('label', null, `Measured (${range}) `, value) : h('label', null, check, ' Checked OK'),
        note, save))
  })
  refresh()
  return h('div', { class: 'card' }, h('h2', null, 'Bring-up test'),
    h('p', { class: 'muted small' }, 'Measure the finished board and record each result. Values outside the range are saved as FAIL; a retest overwrites the earlier result.'),
    summary, status, rows)
}
