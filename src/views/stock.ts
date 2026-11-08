import { api } from '../lib/api'
import { h } from '../lib/dom'
import { labelSheetCard } from './label-sheet'
import { BOARD_NAMES, type BomLine, type LcscStock, type Profile } from '../lib/types'

export async function stockView(me: Profile): Promise<HTMLElement> {
  const admin = me.role === 'admin'
  const [items, bom, usage, lcsc, lcscUsed] = await Promise.all([api.stock(), api.bom(), api.stockUsage(), api.lcscStock(), api.lcscUsage()])
  const parts = bom.filter((l) => l.kind === 'part')
  const sheet = labelSheetCard()
  const status = h('div', { class: 'small muted' })
  const flash = (t: string) => (status.textContent = t)
  const fail = (e: unknown) => flash(e instanceof Error ? e.message : String(e))

  const lineLabel = (l: BomLine) => `${l.board_type} ${l.designators.join(', ')} · ${l.value ?? l.mpn}`
  const picker = (selected: Set<string>, onChange: () => void) =>
    h('details', null,
      h('summary', null, selected.size ? `${selected.size} BOM line(s) linked` : 'Choose BOM lines this stock can be used for'),
      (['MB', 'PW'] as const).map((t) => h('div', null, h('strong', { class: 'small' }, BOARD_NAMES[t]),
        parts.filter((l) => l.board_type === t).map((l) => {
          const cb = h('input', { type: 'checkbox', checked: selected.has(l.id), onchange: () => {
            if (cb.checked) selected.add(l.id)
            else selected.delete(l.id)
            onChange()
          } })
          return h('label', { class: 'pick' }, cb, ` ${lineLabel(l)}`)
        }))))

  // ---- add form ----
  const name = h('input', { placeholder: 'Name, e.g. Male pin header 2.54 mm 1x40', class: 'grow' })
  const supplier = h('input', { placeholder: 'Seller (any seller)' })
  const orderNo = h('input', { placeholder: 'Order number' })
  const qty = h('input', { type: 'number', min: 0, value: '0', class: 'narrow', title: 'Quantity received' })
  const notes = h('input', { placeholder: 'Notes (optional)', class: 'grow' })
  const newLines = new Set<string>()
  const addCard = h('div', { class: 'card' }, h('h2', null, 'Add stock'),
    h('p', { class: 'muted small' }, 'For parts that do not come with an LCSC label. Each entry gets its own code (PACT_STK_nnnn). Its QR label carries the code, seller and order number: print it on the sticker sheet (you pick the square), stick it on the bag or box, and scan it during assembly like an LCSC label. A BOM line that has stock linked is scanned before and after soldering.'),
    h('div', { class: 'form-row' }, name, supplier, orderNo, h('label', null, 'Qty ', qty)),
    h('div', { class: 'form-row' }, notes),
    picker(newLines, () => {}),
    h('button', { class: 'btn primary', onclick: async () => {
      if (!name.value.trim()) return flash('Name is required.')
      try {
        const item = await api.addStock({ name: name.value.trim(), supplier: supplier.value.trim() || null, order_no: orderNo.value.trim() || null, qty: Math.max(0, Math.floor(+qty.value || 0)),
          bom_line_ids: [...newLines], notes: notes.value.trim() || null })
        items.push(item)
        name.value = ''; supplier.value = ''; orderNo.value = ''; notes.value = ''; qty.value = '0'
        newLines.clear()
        addCard.querySelectorAll<HTMLInputElement>('details input').forEach((i) => (i.checked = false))
        renderRows()
        flash(`Added ${item.code}. Use "Print label" to print its QR label.`)
      } catch (e) { fail(e) }
    } }, 'Add stock item'))

  // ---- table ----
  const body = h('tbody')
  function renderRows() {
    body.replaceChildren(...items.map((it) => {
      const used = usage.get(it.id) ?? 0
      const left = it.qty - used
      const save = (patch: Parameters<typeof api.updateStock>[1]) => api.updateStock(it.id, patch).then(() => flash(`Saved ${it.code}`), fail)
      const linked = new Set(it.bom_line_ids)
      const nameIn = h('input', { value: it.name, disabled: !admin, onchange: () => { it.name = nameIn.value.trim(); void save({ name: it.name }) } })
      const onIn = h('input', { value: it.order_no ?? '', disabled: !admin, onchange: () => { it.order_no = onIn.value.trim() || null; void save({ order_no: it.order_no }) } })
      const supIn = h('input', { value: it.supplier ?? '', disabled: !admin, onchange: () => { it.supplier = supIn.value.trim() || null; void save({ supplier: it.supplier }) } })
      const qtyIn = h('input', { type: 'number', min: 0, value: String(it.qty), class: 'narrow', disabled: !admin, onchange: () => {
        it.qty = Math.max(0, Math.floor(+qtyIn.value || 0))
        void save({ qty: it.qty }).then(renderRows)
      } })
      return h('tr', null,
        h('td', { class: 'mono' }, it.code),
        h('td', null, nameIn),
        h('td', null, supIn),
        h('td', null, onIn),
        h('td', null, qtyIn),
        h('td', null, String(used)),
        h('td', { class: left < 0 ? 'error' : left === 0 ? 'muted' : '' }, String(left)),
        h('td', null, admin
          ? picker(linked, () => { it.bom_line_ids = [...linked]; void save({ bom_line_ids: it.bom_line_ids }) })
          : it.bom_line_ids.map((id) => parts.find((l) => l.id === id)).filter(Boolean).map((l) => lineLabel(l!)).join('; ') || '—'),
        h('td', { class: 'actions' },
          h('button', { class: 'btn small', onclick: () => sheet.show(it) }, 'Add to label sheet'),
          admin ? h('button', { class: 'btn small', onclick: async () => {
            const n = Number(prompt(`Add how many pieces to ${it.code}? (negative to remove)`, '0'))
            if (!Number.isFinite(n) || !n) return
            it.qty = Math.max(0, it.qty + Math.floor(n))
            await save({ qty: it.qty })
            renderRows()
          } }, '± Qty') : null,
          admin ? h('button', { class: 'btn small', onclick: async () => {
            if (!confirm(`Delete ${it.code} (${it.name})? Placements keep their record but lose the stock link.`)) return
            try {
              await api.deleteStock(it.id)
              items.splice(items.indexOf(it), 1)
              renderRows()
            } catch (e) { fail(e) }
          } }, 'Delete') : null))
    }))
    if (!items.length) body.append(h('tr', null, h('td', { colspan: 9, class: 'muted' }, 'No stock items yet.')))
  }
  renderRows()

  const lcscRow = (s: LcscStock) => {
    const used = lcscUsed.get(s.lcsc_code) ?? 0
    const left = s.qty - used
    const lines = parts.filter((l) => l.lcsc_code === s.lcsc_code)
    const q = h('input', { type: 'number', min: 0, value: String(s.qty), class: 'narrow', disabled: !admin, onchange: () => {
      s.qty = Math.max(0, Math.floor(+q.value || 0))
      api.setLcscQty(s.lcsc_code, s.qty).then(() => { flash(`Saved ${s.lcsc_code}`); lcscBody.replaceChildren(...lcsc.map(lcscRow)) }, fail)
    } })
    return h('tr', null, h('td', { class: 'mono' }, s.lcsc_code), h('td', null, s.mpn), h('td', { class: 'small' }, s.description), h('td', null, q),
      h('td', null, String(used)), h('td', { class: left < 0 ? 'error' : left === 0 ? 'muted' : '' }, String(left)),
      h('td', { class: 'small' }, lines.map(lineLabel).join('; ') || '—'))
  }
  const lcscBody = h('tbody', null, lcsc.map(lcscRow))
  if (!lcsc.length) lcscBody.append(h('tr', null, h('td', { colspan: 7, class: 'muted' }, 'Run supabase/lcsc_stock.sql (after migration 0004) to load the ordered quantities.')))

  return h('div', null, status,
    admin ? addCard : null,
    sheet.el,
    h('div', { class: 'card' }, h('h2', null, 'LCSC stock'),
      h('p', { class: 'muted small' }, 'Ordered quantity comes from the LCSC order CSVs. Used = placements that scanned a bag with this code (counted when the part is placed). Left = ordered − used.'),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['LCSC', 'MPN', 'Description', 'Ordered', 'Used', 'Left', 'Used for'].map((t) => h('th', null, t)))),
        lcscBody)),
    h('div', { class: 'card' }, h('h2', null, 'Part stock'),
      h('p', { class: 'muted small' }, 'Used counts placements that scanned this label; Left = received − used (red if more was used than received).'),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Code', 'Name', 'Seller', 'Order no.', 'Received', 'Used', 'Left', 'Used for', ''].map((t) => h('th', null, t)))),
        body)))
}
