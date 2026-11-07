import { api } from '../lib/api'
import { h } from '../lib/dom'
import { fmtDuration, IDLE_GAP_SEC, boardTiming, type BoardTiming } from '../lib/timing'
import { BOARD_NAMES, type BoardType, type Placement } from '../lib/types'

/** Step timing report: active time per step, per operator and per board, from the timestamps of the scans. */
export async function timingView(): Promise<HTMLElement> {
  const [boards, bom, placements, profiles] = await Promise.all([api.boards(), api.bom(), api.allPlacements(), api.profiles()])
  const email = new Map(profiles.map((p) => [p.id, p.email ?? p.id.slice(0, 8)]))
  const byBoard = new Map<string, Placement[]>()
  for (const p of placements) byBoard.set(p.board_id, [...(byBoard.get(p.board_id) ?? []), p])

  let type: BoardType = 'PW'
  const body = h('div')
  const sel = h('select', { onchange: () => { type = sel.value as BoardType; render() } },
    ...(['PW', 'MB'] as const).map((t) => h('option', { value: t }, BOARD_NAMES[t])))

  function render() {
    const lines = bom.filter((l) => l.board_type === type)
    const mine = boards.filter((b) => b.board_type === type)
    const timings = mine.map((b) => ({ b, t: boardTiming(b.created_at, byBoard.get(b.id) ?? [], lines) }))
    const finished = timings.filter((x) => x.b.status === 'completed')

    // per step
    const steps = new Map<number, { stage: string; boards: number; parts: number; sec: number }>()
    for (const { t } of finished) for (const s of t.steps) {
      const a = steps.get(s.step) ?? { stage: s.stage, boards: 0, parts: 0, sec: 0 }
      if (s.parts) a.boards++
      a.parts += s.parts
      a.sec += s.activeSec
      steps.set(s.step, a)
    }
    // per operator (finished boards)
    const users = new Map<string, { parts: number; sec: number }>()
    for (const { t } of finished) for (const [u, v] of t.byUser) {
      const a = users.get(u) ?? { parts: 0, sec: 0 }
      a.parts += v.parts
      a.sec += v.sec
      users.set(u, a)
    }
    const avg = finished.length ? finished.reduce((n, x) => n + x.t.totalSec, 0) / finished.length : 0
    const per = (sec: number, n: number) => (n ? fmtDuration(sec / n) : '—')

    body.replaceChildren(
      h('p', null, finished.length
        ? `${finished.length} completed board(s): average active time ${fmtDuration(avg)} per board.`
        : 'No completed boards of this type yet. Times appear once boards are signed off.'),
      h('h3', null, 'Steps (completed boards)'),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Step', 'Parts / board', 'Avg time / board', 'Avg time / part'].map((x) => h('th', null, x)))),
        h('tbody', null, [...steps.entries()].sort((a, b) => a[0] - b[0]).map(([n, a]) => h('tr', null,
          h('td', null, `${n}. ${a.stage}`),
          h('td', null, finished.length ? (a.parts / finished.length).toFixed(1) : '0'),
          h('td', null, per(a.sec, finished.length)),
          h('td', null, per(a.sec, a.parts)))))),
      h('h3', null, 'Operators (completed boards)'),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Operator', 'Parts handled', 'Active time', 'Avg time / part'].map((x) => h('th', null, x)))),
        h('tbody', null, [...users.entries()].map(([u, a]) => h('tr', null, h('td', null, email.get(u) ?? u), h('td', null, String(a.parts)), h('td', null, fmtDuration(a.sec)), h('td', null, per(a.sec, a.parts)))))),
      h('h3', null, 'Boards'),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Board', 'Status', 'Parts', 'Active time'].map((x) => h('th', null, x)))),
        h('tbody', null, timings.map(({ b, t }: { b: (typeof boards)[number]; t: BoardTiming }) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/board/${b.serial}` } },
          h('td', { class: 'mono' }, b.serial), h('td', null, b.status), h('td', null, `${b.placed} / ${b.total}`), h('td', null, fmtDuration(t.totalSec)))))))
  }
  render()

  return h('div', { class: 'card' }, h('h2', null, 'Step timing'),
    h('p', { class: 'muted small' }, `Active time is the time between consecutive scans / confirmations. Pauses longer than ${IDLE_GAP_SEC / 60} minutes count as a break and are left out; the ultrasonic bath is not counted.`),
    h('div', { class: 'form-row' }, h('label', null, 'Board type ', sel)), body)
}
