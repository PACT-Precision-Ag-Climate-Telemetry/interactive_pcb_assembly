import { api } from '../lib/api'
import { h } from '../lib/dom'
import { readiness } from '../lib/readiness'
import { BOARD_NAMES, type BoardType } from '../lib/types'

/** "Can I build N boards?" Compares the BOM demand with what is left in LCSC and manual stock. */
export async function readyView(): Promise<HTMLElement> {
  const [bom, lcsc, lcscUsed, stock, stockUsed] = await Promise.all([api.bom(), api.lcscStock(), api.lcscUsage(), api.stock(), api.stockUsage()])
  const counts: Record<BoardType, number> = { MB: 1, PW: 1 }
  const result = h('div')

  const input = (type: BoardType) => {
    const i = h('input', { type: 'number', min: 0, value: String(counts[type]), class: 'narrow', onchange: () => {
      counts[type] = Math.max(0, Math.floor(+i.value || 0))
      i.value = String(counts[type])
      render()
    } })
    return h('label', null, `${BOARD_NAMES[type]} boards `, i)
  }

  function render() {
    const r = readiness(counts, bom, lcsc, lcscUsed, stock, stockUsed)
    const ok = r.shortages.length === 0
    result.replaceChildren(
      h('div', { class: `banner ${ok ? 'ok' : 'error'}` },
        ok ? `Enough stock for ${counts.MB} mainboard(s) and ${counts.PW} power board(s).`
          : `Short on ${r.shortages.length} part(s): ${r.shortages.map((s) => `${s.key} (−${s.short})`).join(', ')}`),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Part', 'Needed', 'Left', 'Short', 'Used for'].map((t) => h('th', null, t)))),
        h('tbody', null, r.rows.map((x) => h('tr', null,
          h('td', null, x.label),
          h('td', null, String(x.needed)),
          h('td', null, String(x.left)),
          h('td', { class: x.short ? 'error' : 'muted' }, x.short ? String(x.short) : 'ok'),
          h('td', { class: 'small' }, [...new Set(x.lines.map((l) => `${l.board_type} ${l.designators.join(', ')}`))].join('; ')))))),
      r.untracked.length
        ? h('div', null,
          h('h3', null, 'Not tracked (no LCSC code and no stock item)'),
          h('p', { class: 'small muted' }, 'These are confirm-only during assembly, so the check cannot tell whether you own enough. Order or count them yourself, or add a stock item.'),
          h('p', { class: 'small' }, r.untracked.map(({ line, needed }) => `${line.board_type} ${line.designators.join(', ')} ×${needed}`).join(' · ')))
        : '')
  }
  render()

  return h('div', { class: 'card' }, h('h2', null, 'Build check'),
    h('p', { class: 'muted small' }, 'How many boards do you want to build? Needed parts are compared with ordered − used (LCSC) and received − used (manual stock). Parts already placed on boards are already counted as used.'),
    h('div', { class: 'form-row' }, input('PW'), input('MB')),
    result)
}
