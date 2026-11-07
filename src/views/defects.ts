import { api } from '../lib/api'
import { h } from '../lib/dom'
import { DEFECT_KINDS, type Defect } from '../lib/types'

/** All defects across boards, with a count per problem type and per bag/lot so a bad lot stands out. */
export async function defectsView(): Promise<HTMLElement> {
  const [defects, boards] = await Promise.all([api.defects(), api.boards()])
  const serial = new Map(boards.map((b) => [b.id, b.serial]))
  let onlyOpen = true
  const body = h('div')
  const cb = h('input', { type: 'checkbox', checked: true, onchange: () => { onlyOpen = cb.checked; render() } })

  const tally = (items: Defect[], key: (d: Defect) => string | null) => {
    const m = new Map<string, number>()
    for (const d of items) { const k = key(d); if (k) m.set(k, (m.get(k) ?? 0) + 1) }
    return [...m].sort((a, b) => b[1] - a[1])
  }

  function render() {
    const shown = onlyOpen ? defects.filter((d) => d.status === 'open') : defects
    const byBag = tally(defects, (d) => (d.pbn ? `${d.lcsc_code ?? ''} · ${d.pbn}` : null)).slice(0, 8)
    const byKind = tally(defects, (d) => DEFECT_KINDS[d.kind])
    const byPart = tally(defects, (d) => d.designator).slice(0, 8)
    const list = (rows: [string, number][]) => (rows.length ? rows.map(([k, n]) => h('li', null, `${k}: ${n}`)) : [h('li', { class: 'muted' }, 'none')])
    body.replaceChildren(
      h('div', { class: 'cols3' },
        h('div', null, h('h3', null, 'By problem'), h('ul', null, ...list(byKind))),
        h('div', null, h('h3', null, 'By bag (lot)'), h('ul', null, ...list(byBag))),
        h('div', null, h('h3', null, 'By part'), h('ul', null, ...list(byPart)))),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Board', 'Part', 'Problem', 'Note', 'Bag', 'Reported', 'Status'].map((t) => h('th', null, t)))),
        h('tbody', null, shown.map((d) => h('tr', { class: 'clickable', onclick: () => { location.hash = `#/board/${serial.get(d.board_id) ?? ''}` } },
          h('td', { class: 'mono' }, serial.get(d.board_id) ?? '?'), h('td', null, d.designator), h('td', null, DEFECT_KINDS[d.kind]), h('td', { class: 'small' }, d.note ?? ''),
          h('td', { class: 'mono small' }, [d.lcsc_code, d.pbn].filter(Boolean).join(' · ')), h('td', { class: 'small' }, new Date(d.reported_at).toLocaleString()),
          h('td', null, d.status))))),
      shown.length ? '' : h('p', { class: 'muted' }, 'No defects.'))
  }
  render()
  return h('div', { class: 'card' }, h('h2', null, 'Defects'),
    h('div', { class: 'form-row' }, h('label', null, cb, ' Only open')), body)
}
