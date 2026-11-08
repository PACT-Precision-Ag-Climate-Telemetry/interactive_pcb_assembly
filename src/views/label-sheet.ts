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

interface Job { item: StockItem; cell: number }
interface QueueEntry { item: StockItem; copies: number }

/** Prints one label per job (each job = a stock item on a sheet square). */
async function printJobs(jobs: Job[]) {
  const qr = new Map<string, string>()
  for (const { item } of jobs) if (!qr.has(item.id)) qr.set(item.id, await qrDataUrl(labelPayload(item.code, item.supplier, item.order_no)))
  const off = loadOffset()
  const sheet = h('div', { class: 'sheet' }, jobs.map(({ item, cell }) => {
    const { col, row } = cellPos(cell)
    const x = SHEET.left + off.x + col * (SHEET.w + SHEET.gapX)
    const y = SHEET.top + off.y + row * (SHEET.h + SHEET.gapY)
    return h('div', { class: 'sheet-label', style: `left:${x}mm;top:${y}mm;width:${SHEET.w}mm;height:${SHEET.h}mm` },
      h('img', { src: qr.get(item.id)! }),
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

/**
 * Card with the sticker sheet. Add several parts (each with a number of copies) and print them all on one sheet.
 * Squares can be picked by hand; squares already printed are remembered on this computer.
 */
export function labelSheetCard(): { el: HTMLElement; show(item: StockItem): void } {
  const queue: QueueEntry[] = []
  let used = loadUsed()
  const selected = new Set<number>()
  const status = h('div', { class: 'small muted' })
  const list = h('div', { class: 'queue' })
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

  /** One entry per label to print, in queue order. */
  const labels = () => queue.flatMap((q) => Array.from({ length: q.copies }, () => q.item))
  const assign = (): Job[] => {
    const items = labels()
    const cells = targetCells([...selected], items.length, used)
    return cells.slice(0, items.length).map((cell, i) => ({ item: items[i], cell }))
  }

  function drawQueue() {
    list.replaceChildren(...queue.map((q) => {
      const n = h('input', { type: 'number', min: 1, max: SHEET_CELLS, value: String(q.copies), class: 'tiny', oninput: () => { q.copies = Math.max(1, Math.floor(+n.value || 1)); draw() } })
      return h('div', { class: 'form-row queue-row' },
        h('span', { class: 'mono' }, q.item.code), h('span', { class: 'grow' }, q.item.name), h('label', null, 'Copies ', n),
        h('button', { class: 'btn small', onclick: () => { queue.splice(queue.indexOf(q), 1); drawQueue(); draw() } }, 'Remove'))
    }))
    if (!queue.length) list.append(h('p', { class: 'muted small' }, 'No parts added yet. Use "Add to label sheet" in the Stock table.'))
  }

  function draw() {
    const jobs = assign()
    const byCell = new Map(jobs.map((j) => [j.cell, j.item]))
    grid.replaceChildren(...Array.from({ length: SHEET_CELLS }, (_, i) => {
      const isUsed = used.has(i)
      const { row, col } = cellPos(i)
      const it = byCell.get(i)
      return h('button', {
        type: 'button',
        class: `sheet-cell${isUsed ? ' used' : ''}${it ? ' sel' : ''}`,
        title: `Row ${row + 1}, column ${col + 1}${isUsed ? ' (already printed)' : ''}`,
        onclick: () => { if (selected.has(i)) selected.delete(i); else selected.add(i); draw() },
      }, it ? h('span', null, String(i + 1), h('small', null, it.code.replace('PACT_STK_', '#'))) : String(i + 1))
    }))
    const total = labels().length
    info.textContent = !total ? '' : jobs.length < total
      ? `${total} label(s) wanted but only ${jobs.length} square(s) ${selected.size >= 2 ? 'picked' : 'free'}. Pick more squares or use a new sheet.`
      : `${total} label(s) from ${queue.length} part(s) on square(s): ${jobs.map((j) => j.cell + 1).join(', ')}.${selected.size ? '' : ' (First free squares; click squares to choose others.)'}`
  }

  const printBtn = h('button', { class: 'btn primary', onclick: async () => {
    const jobs = assign()
    if (!jobs.length) { status.textContent = 'Add a part and make sure there are free squares.'; return }
    if (jobs.length < labels().length && !confirm(`Only ${jobs.length} of ${labels().length} labels fit. Print those?`)) return
    try {
      await printJobs(jobs)
      jobs.forEach((j) => used.add(j.cell))
      saveUsed(used)
      selected.clear()
      status.textContent = `Sent ${jobs.length} label(s) to the printer. Those squares are now marked as used.`
      draw()
    } catch (e) { status.textContent = e instanceof Error ? e.message : String(e) }
  } }, 'Print')

  const el = h('div', { class: 'card', hidden: true }, h('h2', null, 'Print labels'),
    h('p', { class: 'muted small' }, `Sticker sheet A5, ${SHEET.cols} x ${SHEET.rows} labels of ${SHEET.w} x ${SHEET.h} mm. Add several parts and set the copies for each; they are placed on the first free squares in order. Or click squares yourself (hatched = already printed): one square = start there, several squares = exactly those. In the print dialog use paper ${SHEET.pageW} x ${SHEET.pageH} mm, scale 100%, no margins.`),
    list,
    h('div', { class: 'form-row' }, printBtn,
      h('button', { class: 'btn', onclick: () => { selected.clear(); draw() } }, 'Clear picked squares'),
      h('button', { class: 'btn', onclick: () => { queue.length = 0; drawQueue(); draw() } }, 'Clear parts'),
      h('button', { class: 'btn', onclick: () => { used = new Set(); saveUsed(used); draw() } }, 'New sheet (all free)'),
      h('button', { class: 'btn', onclick: () => { el.hidden = true } }, 'Close')),
    info, grid, status,
    h('details', null, h('summary', null, 'Fine-tune alignment (mm)'),
      h('div', { class: 'form-row' }, h('label', null, 'Shift right ', offIn('x')), h('label', null, 'Shift down ', offIn('y')))))

  return {
    el,
    show(item) {
      const q = queue.find((x) => x.item.id === item.id)
      if (q) q.copies++
      else queue.push({ item, copies: 1 })
      el.hidden = false
      status.textContent = ''
      drawQueue()
      draw()
      el.scrollIntoView({ behavior: 'smooth' })
    },
  }
}
