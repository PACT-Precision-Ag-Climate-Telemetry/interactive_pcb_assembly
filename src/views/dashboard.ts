import { api } from '../lib/api'
import { beep, h } from '../lib/dom'
import { boardCodeHint, parseBoardCode } from '../lib/parsers'
import { scanPanel } from '../lib/scanner'
import { BOARD_NAMES, type BoardProgress } from '../lib/types'

export async function dashboardView(): Promise<{ el: HTMLElement; destroy(): void }> {
  const msg = h('div', { class: 'banner', hidden: true })
  const show = (kind: 'error' | 'ok', text: string) => {
    msg.hidden = false
    msg.className = `banner ${kind}`
    msg.textContent = text
  }

  const panel = scanPanel(async (raw) => {
    const code = parseBoardCode(raw)
    if (!code) {
      beep(false)
      show('error', `"${raw.slice(0, 60)}" is not a board code. Expected ${boardCodeHint('MB')} or ${boardCodeHint('PW')}.`)
      return
    }
    try {
      const { board, created } = await api.ensureBoard(code)
      api.logScan(board.id, raw, 'accepted', created ? 'board registered' : 'board opened')
      beep(true)
      location.hash = `#/board/${board.serial}`
    } catch (e) {
      beep(false)
      show('error', e instanceof Error ? e.message : String(e))
    }
  }, 'Scan board Data Matrix (PACT_MB_… / PACT_PW_…)')

  const tbody = h('tbody')
  const table = h('table', { class: 'table' },
    h('thead', null, h('tr', null, ['Serial', 'Type', 'Batch', 'Seq', 'Progress', 'Status', ''].map((t) => h('th', null, t)))), tbody)

  const renderRows = (boards: BoardProgress[]) => {
    tbody.replaceChildren(...boards.map((b) => {
      const pct = b.total ? Math.round((b.placed / b.total) * 100) : 0
      return h('tr', { class: 'clickable', onclick: () => (location.hash = `#/board/${b.serial}`) },
        h('td', { class: 'mono' }, b.serial), h('td', null, BOARD_NAMES[b.board_type]), h('td', null, b.batch), h('td', null, b.seq),
        h('td', null, h('div', { class: 'bar' }, h('div', { style: `width:${pct}%` })), h('span', { class: 'small muted' }, ` ${b.placed}/${b.total}`)),
        h('td', null, h('span', { class: `pill ${b.status}` }, b.status === 'completed' ? 'Completed' : 'In progress')),
        h('td', null, h('a', { href: `#/board/${b.serial}` }, 'Open')))
    }))
    if (!boards.length) tbody.append(h('tr', null, h('td', { colspan: 7, class: 'muted' }, 'No boards yet. Scan one above to begin.')))
  }
  renderRows(await api.boards().catch((e) => { show('error', e.message); return [] }))

  const el = h('div', null,
    h('div', { class: 'card' }, h('h2', null, 'Scan a board to start or resume'), panel.el, msg),
    h('div', { class: 'card' }, h('h2', null, 'Boards'), table))
  queueMicrotask(() => panel.focus())
  return { el, destroy: panel.destroy }
}
