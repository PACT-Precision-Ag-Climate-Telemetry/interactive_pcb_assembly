import { qrDataUrl } from '../lib/barcode'
import { h } from '../lib/dom'
import { cellPos, labelPayload, SHEET, SHEET_CELLS, targetCells } from '../lib/labels'
import type { StockItem } from '../lib/types'

const USED_KEY = 'label-used'
const OFFSET_KEY = 'label-offset'
const loadUsed = () => new Set<number>(JSON.parse(localStorage.getItem(USED_KEY) ?? '[]'))
const saveUsed = (s: Set<number>) => localStorage.setItem(USED_KEY, JSON.stringify([...s]))
const loadOffset = (): { x: number; y: number } => {
  try { return { x: 0, y: 0, ...JSON.parse(localStorage.getItem(OFFSET_KEY) ?? '{}') } } catch { return { x: 0, y: 0 } }
}

/** Prints the label of one stock item on each chosen cell of the 4 x 14 sheet. */
async function printCells(item: StockItem, cells: number[]) {
  const src = await qrDataUrl(labelPayload(item.code, item.supplier, item.order_no))
  const off = loadOffset()
  const sheet = h('div', { class: 'sheet' }, cells.map((i) => {
    const { col, row } = cellPos(i)
    const x = SHEET.left + off.x + col * (SHEET.w + SHEET.gapX)
    const y = SHEET.top + off.y + row * (SHEET.h + SHEET.gapY)
    return h('div', { class: 'sheet-label', style: `left:${x}mm;top:${y}mm;width:${SHEET.w}mm;height:${SHEET.h}mm` },
      h('img', { src }),
      h('div', { class: 'sl-text' },
        h('div', { class: 'sl-part' }, item.name),
        h('div', { class: 'sl-seller' }, item.supplier || ''),
        h('div', { class: 'sl-seller' }, item.order_no || ''),
        h('div', { class: 'sl-code' }, item.code)))
  }))
  const area = h('div', { id: 'print-area' }, sheet)
  document.body.append(area)
  await Promise.all([...area.querySelectorAll('img')].map((i) => i.decode().catch(() => {})))
  const cleanup = () => { area.remove(); window.removeEventListener('afterprint', cleanup) }
  window.addEventListener('afterprint', cleanup)
  window.print()
}

/** Card with the sticker sheet: pick which squares to print on. Squares already printed are remembered on this computer. */
export function labelSheetCard(): { el: HTMLElement; show(item: StockItem): void } {
  let item: StockItem | null = null
  let used = loadUsed()
  const selected = new Set<number>()
  const status = h('div', { class: 'small muted' })
  const title = h('h2', null, 'Print labels')
  const copies = h('input', { type: 'number', min: 1, max: SHEET_CELLS, value: '1', class: 'tiny', oninput: () => draw(), onchange: () => draw() })
  const grid = h('div', { class: 'sheet-grid' })
  const info = h('div', { class: 'small' })
  const off = loadOffset()
  const offIn = (k: 'x' | 'y') => {
    const i = h('input', { type: 'number', step: '0.1', value: String(off[k]), class: 'tiny', onchange: () => {
      off[k] = Number(i.value) || 0
      localStorage.setItem(OFFSET_KEY, JSON.stringify(off))
    } })
    return i
  }

  const targets = () => targetCells([...selected], Math.max(1, Math.floor(+copies.value || 1)), used)
  function draw() {
    const t = new Set(targets())
    grid.replaceChildren(...Array.from({ length: SHEET_CELLS }, (_, i) => {
      const isUsed = used.has(i)
      const { row, col } = cellPos(i)
      return h('button', {
        type: 'button',
        class: `sheet-cell${isUsed ? ' used' : ''}${t.has(i) ? ' sel' : ''}`,
        title: `Row ${row + 1}, column ${col + 1}${isUsed ? ' (already printed)' : ''}`,
        onclick: () => { if (selected.has(i)) selected.delete(i); else selected.add(i); draw() },
      }, String(i + 1))
    }))
    info.textContent = item ? `${t.size} label(s) of ${item.code} on square(s): ${[...t].map((i) => i + 1).join(', ') || 'none picked'}` : ''
  }

  const printBtn = h('button', { class: 'btn primary', onclick: async () => {
    if (!item) return
    const cells = targets()
    if (!cells.length) { status.textContent = 'Click the square(s) of the sticker sheet to print on.'; return }
    try {
      await printCells(item, cells)
      cells.forEach((i) => used.add(i))
      saveUsed(used)
      selected.clear()
      status.textContent = `Sent ${cells.length} label(s) to the printer. Those squares are now marked as used.`
      draw()
    } catch (e) { status.textContent = e instanceof Error ? e.message : String(e) }
  } }, 'Print')

  const el = h('div', { class: 'card', hidden: true }, title,
    h('p', { class: 'muted small' }, `Sticker sheet A5, ${SHEET.cols} x ${SHEET.rows} labels of ${SHEET.w} x ${SHEET.h} mm. Click the squares you still have stickers on (hatched = already printed). Pick one square and set Copies to fill the following free squares. In the print dialog use paper ${SHEET.pageW} x ${SHEET.pageH} mm, scale 100%, no margins.`),
    h('div', { class: 'form-row' }, h('label', null, 'Copies ', copies), printBtn,
      h('button', { class: 'btn', onclick: () => { selected.clear(); draw() } }, 'Clear picks'),
      h('button', { class: 'btn', onclick: () => { used = new Set(); saveUsed(used); draw() } }, 'New sheet (all free)'),
      h('button', { class: 'btn', onclick: () => { el.hidden = true } }, 'Close')),
    info, grid, status,
    h('details', null, h('summary', null, 'Fine-tune alignment (mm)'),
      h('div', { class: 'form-row' }, h('label', null, 'Shift right ', offIn('x')), h('label', null, 'Shift down ', offIn('y')))))

  return {
    el,
    show(it) {
      item = it
      title.textContent = `Print labels: ${it.code} · ${it.name}`
      el.hidden = false
      status.textContent = ''
      draw()
      el.scrollIntoView({ behavior: 'smooth' })
    },
  }
}
