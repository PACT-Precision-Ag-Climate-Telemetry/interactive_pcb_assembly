import { api } from '../lib/api'
import { parseLcscOrder, type LcscOrderRow } from '../lib/csv'
import { h } from '../lib/dom'
import type { BomLine } from '../lib/types'

const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[\s_]+/g, '')

/**
 * Admin card: upload an LCSC order CSV -> ordered quantities go to LCSC stock, and every CSV part can be
 * linked to the BOM lines it is used for (sets their LCSC code, so they are scanned).
 */
export function importCard(bom: BomLine[], flash: (t: string) => void): HTMLElement {
  const parts = bom.filter((l) => l.kind === 'part')
  const file = h('input', { type: 'file', accept: '.csv,text/csv' })
  const mode = h('select', null, h('option', { value: 'add' }, 'Add to stock (new order)'), h('option', { value: 'replace' }, 'Replace ordered quantity'))
  const preview = h('div')
  const result = h('div', { class: 'small' })

  let rows: LcscOrderRow[] = []
  let name = ''
  const picks = new Map<string, Set<string>>() // lcsc code -> bom line ids to link

  const lineLabel = (l: BomLine) => `${l.board_type} ${l.designators.join(', ')} · ${l.value ?? l.mpn}${l.lcsc_code ? ` [${l.lcsc_code}]` : ''}`

  function renderPreview() {
    if (!rows.length) return preview.replaceChildren()
    const body = rows.map((r) => {
      const sel = picks.get(r.lcsc_code)!
      const linked = parts.filter((l) => l.lcsc_code === r.lcsc_code)
      return h('tr', { class: 'import-row' },
        h('td', { class: 'mono' }, r.lcsc_code),
        h('td', null, r.mpn, h('div', { class: 'small muted' }, r.description)),
        h('td', null, String(r.qty)),
        h('td', null,
          linked.length ? h('div', { class: 'small' }, `Already used for: ${linked.map((l) => `${l.board_type} ${l.designators.join(', ')}`).join('; ')}`) : null,
          h('details', null,
            h('summary', null, sel.size ? `${sel.size} line(s) will be linked` : 'Link to BOM lines (optional)'),
            parts.filter((l) => l.lcsc_code !== r.lcsc_code).map((l) => {
              const cb = h('input', { type: 'checkbox', checked: sel.has(l.id), onchange: () => {
                if (cb.checked) sel.add(l.id)
                else sel.delete(l.id)
                renderPreview()
              } })
              return h('label', { class: 'pick' }, cb, ` ${lineLabel(l)}`)
            }))))
    })
    preview.replaceChildren(
      h('p', { class: 'small' }, `${rows.length} part(s) in ${name}.`),
      h('table', { class: 'table' }, h('thead', null, h('tr', null, ['LCSC', 'MPN / description', 'Qty', 'BOM lines'].map((t) => h('th', null, t)))), h('tbody', null, body)),
      h('div', { class: 'form-row' }, mode,
        h('button', { class: 'btn primary', onclick: () => void doImport() }, `Import ${rows.length} part(s)`)))
  }

  async function doImport() {
    try {
      const done = (await api.importedFiles()).find((f) => f.file_name === name)
      if (done && !confirm(`${name} was already imported on ${new Date(done.imported_at).toLocaleString()}. Importing again with "Add" would double the quantities. Continue?`)) return
      await api.importLcscOrder(name, rows, mode.value as 'add' | 'replace')
      let linkedCount = 0
      for (const [code, ids] of picks) {
        for (const id of ids) {
          await api.updateBomLine(id, { lcsc_code: code })
          const l = bom.find((x) => x.id === id)
          if (l) l.lcsc_code = code
          linkedCount++
        }
      }
      result.textContent = `Imported ${rows.length} part(s) from ${name}; linked ${linkedCount} BOM line(s). Reload the page to see updated BOM codes.`
      flash('Import done')
      rows = []
      preview.replaceChildren()
      file.value = ''
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    }
  }

  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    result.textContent = ''
    if (!f) return
    try {
      rows = parseLcscOrder(await f.text())
      name = f.name
      picks.clear()
      for (const r of rows) {
        // Pre-select BOM lines whose MPN equals the CSV part and that have no LCSC code yet.
        const hit = parts.filter((l) => !l.lcsc_code && l.mpn && norm(l.mpn) === norm(r.mpn))
        picks.set(r.lcsc_code, new Set(hit.map((l) => l.id)))
      }
      renderPreview()
    } catch (e) {
      rows = []
      preview.replaceChildren()
      flash(e instanceof Error ? e.message : String(e))
    }
  })

  return h('div', { class: 'card' }, h('h2', null, 'Import LCSC order (CSV)'),
    h('p', { class: 'muted small' }, 'Export the order from LCSC (order details → download) and pick the file. Quantities go to the LCSC stock table. Lines whose MPN equals the CSV part are pre-selected for linking; the rest you can link by hand, or later on a rejected scan.'),
    file, preview, result)
}
