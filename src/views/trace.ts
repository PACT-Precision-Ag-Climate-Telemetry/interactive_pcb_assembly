import { api, type TraceRow } from '../lib/api'
import { beep, h } from '../lib/dom'
import { parseBoardCode, parseLcsc, parseStockCode } from '../lib/parsers'
import { scanPanel } from '../lib/scanner'
import { BOARD_NAMES, DEFECT_KINDS, type Defect } from '../lib/types'

/**
 * Bag trace-back. Scan (or type) an LCSC bag QR, a pick batch (PICK…), an order number (WM…), an LCSC code (C…),
 * a PACT_STK_ label -> which boards used it. Scan a board code -> which bags went onto that board.
 */
export async function traceView(): Promise<{ el: HTMLElement; destroy(): void }> {
  const out = h('div')
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—')
  const link = (r: TraceRow) => r.boards
    ? h('a', { href: `#/board/${encodeURIComponent(r.boards.serial)}`, class: 'mono' }, r.boards.serial)
    : h('span', { class: 'muted' }, '(board deleted)')

  const defectNote = (defects: Defect[]) => {
    if (!defects.length) return ''
    const open = defects.filter((d) => d.status === 'open').length
    const kinds = [...new Set(defects.map((d) => DEFECT_KINDS[d.kind]))].join(', ')
    return h('div', { class: 'banner error' }, `${defects.length} defect(s) reported against this (${open} open): ${kinds}. Boards: ${[...new Set(defects.map((d) => d.designator))].join(', ')}`)
  }

  const boardsTable = (title: string, rows: TraceRow[], defects: Defect[] = []) => {
    const byBoard = new Map<string, TraceRow[]>()
    for (const r of rows) byBoard.set(r.boards?.serial ?? '?', [...(byBoard.get(r.boards?.serial ?? '?') ?? []), r])
    return h('div', { class: 'card' }, h('h2', null, title),
      defectNote(defects),
      rows.length ? h('p', { class: 'small muted' }, `${rows.length} placement(s) on ${byBoard.size} board(s)`) : h('p', { class: 'muted' }, 'No placements found.'),
      rows.length ? h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Board', 'Type', 'Status', 'Designator', 'Bag / order', 'Placed', 'Soldered'].map((t) => h('th', null, t)))),
        h('tbody', null, rows.map((r) => h('tr', null,
          h('td', null, link(r)),
          h('td', null, r.boards ? BOARD_NAMES[r.boards.board_type] : ''),
          h('td', null, r.boards?.status ?? ''),
          h('td', null, r.designator),
          h('td', { class: 'mono small' }, [r.lcsc_code, r.pbn, r.order_no].filter(Boolean).join(' · ') || 'manual'),
          h('td', { class: 'small' }, fmt(r.placed_at)),
          h('td', { class: 'small' }, fmt(r.soldered_at)))))) : null)
  }

  async function lookup(raw: string) {
    const text = raw.trim()
    out.replaceChildren(h('p', { class: 'muted' }, 'Searching…'))
    try {
      const bc = parseBoardCode(text)
      if (bc) {
        const board = await api.boardBySerial(bc.serial)
        if (!board) { beep(false); return out.replaceChildren(h('div', { class: 'banner error' }, `Board ${bc.serial} is not registered.`)) }
        const [placed, bom, stock] = await Promise.all([api.placements(board.id), api.bom(board.board_type), api.stock()])
        const code = new Map(stock.map((s) => [s.id, s.code]))
        const line = new Map(bom.map((l) => [l.id, l]))
        beep(true)
        return out.replaceChildren(h('div', { class: 'card' }, h('h2', null, `Bags used on `, h('a', { href: `#/board/${encodeURIComponent(board.serial)}`, class: 'mono' }, board.serial)),
          h('table', { class: 'table' },
            h('thead', null, h('tr', null, ['Designator', 'Part', 'LCSC', 'Bag (pbn)', 'Order', 'Stock label', 'Soldered'].map((t) => h('th', null, t)))),
            h('tbody', null, [...placed].sort((a, b) => a.designator.localeCompare(b.designator, undefined, { numeric: true })).map((p) => h('tr', null,
              h('td', null, p.designator), h('td', null, line.get(p.bom_line_id)?.value ?? ''), h('td', { class: 'mono' }, p.lcsc_code ?? ''),
              h('td', { class: 'mono small' }, p.pbn ?? ''), h('td', { class: 'mono small' }, p.order_no ?? ''),
              h('td', { class: 'mono small' }, p.stock_item_id ? code.get(p.stock_item_id) ?? '' : ''), h('td', { class: 'small' }, fmt(p.soldered_at))))))))
      }

      const stockCode = parseStockCode(text)
      if (stockCode) {
        const item = await api.stockByCode(stockCode)
        if (!item) { beep(false); return out.replaceChildren(h('div', { class: 'banner error' }, `Unknown stock label ${stockCode}.`)) }
        beep(true)
        return out.replaceChildren(boardsTable(`Stock ${item.code} · ${item.name}`, await api.trace({ stockId: item.id }), await api.defectsByBag({ stockId: item.id })))
      }

      const label = parseLcsc(text)
      let filter: Parameters<typeof api.trace>[0] | null = null
      let title = text
      if (label?.pbn) { filter = { pbn: label.pbn }; title = `Bag ${label.pbn} (${label.pc}${label.pm ? ', ' + label.pm : ''})` }
      else if (label?.on) { filter = { order: label.on }; title = `Order ${label.on}` }
      else if (label?.pc) { filter = { lcsc: label.pc }; title = `LCSC ${label.pc}` }
      else if (/^PICK/i.test(text)) { filter = { pbn: text.toUpperCase() }; title = `Bag ${text.toUpperCase()}` }
      else if (/^WM\d+/i.test(text)) { filter = { order: text.toUpperCase() }; title = `Order ${text.toUpperCase()}` }
      else if (/^C\d+$/i.test(text)) { filter = { lcsc: text.toUpperCase() }; title = `LCSC ${text.toUpperCase()}` }
      if (!filter) { beep(false); return out.replaceChildren(h('div', { class: 'banner error' }, `Not recognised: "${text.slice(0, 60)}". Scan an LCSC bag QR, a PACT_STK_ label or a board code, or type PICK…, WM… or a C… code.`)) }
      beep(true)
      out.replaceChildren(boardsTable(title, await api.trace(filter), filter.pbn || filter.lcsc ? await api.defectsByBag(filter) : []))
    } catch (e) {
      beep(false)
      out.replaceChildren(h('div', { class: 'banner error' }, e instanceof Error ? e.message : String(e)))
    }
  }

  const panel = scanPanel((raw) => void lookup(raw), 'Scan a bag / stock label / board, or type PICK…, WM…, C…')
  queueMicrotask(() => panel.focus())
  return {
    el: h('div', null, h('div', { class: 'card' }, h('h2', null, 'Trace-back'),
      h('p', { class: 'muted small' }, 'Find every board that used a given bag, order, LCSC part or stock label (e.g. after a bad lot), or see which bags went onto one board.'),
      panel.el), out),
    destroy: panel.destroy,
  }
}
