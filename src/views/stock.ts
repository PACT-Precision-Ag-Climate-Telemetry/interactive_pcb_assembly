import { api } from '../lib/api'
import { h } from '../lib/dom'
import { lcscCapacity } from '../lib/pins'
import { parseBoardCode } from '../lib/parsers'
import { labelSheetCard } from './label-sheet'
import { BOARD_NAMES, type BomLine, type LcscStock, type Profile, type StockCheckout } from '../lib/types'

export async function stockView(me: Profile): Promise<HTMLElement> {
  const admin = me.role === 'admin'
  const [items, bom, usage, lcsc, lcscUsed, checkouts] = await Promise.all([api.stock(), api.bom(), api.stockUsage(), api.lcscStock(), api.lcscUsage(), api.checkouts().catch(() => [] as StockCheckout[])])
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
  const qty = h('input', { type: 'number', min: 0, value: '0', class: 'narrow', title: 'Quantity received (pins, if counted in pins)' })
  const byPins = h('input', { type: 'checkbox' })
  const notes = h('input', { placeholder: 'Notes (optional)', class: 'grow' })
  const newLines = new Set<string>()
  const addCard = h('div', { class: 'card' }, h('h2', null, 'Add stock'),
    h('p', { class: 'muted small' }, 'For parts that do not come with an LCSC label. Each entry gets its own code (PACT_STK_nnnn). Its QR label carries the code, seller and order number: print it on the sticker sheet (you pick the square), stick it on the bag or box, and scan it during assembly like an LCSC label. A BOM line that has stock linked is scanned before and after soldering.'),
    h('div', { class: 'form-row' }, name, supplier, orderNo, h('label', null, 'Qty ', qty)),
    h('div', { class: 'form-row' }, h('label', { class: 'small' }, byPins, ' Pin-header strip: count in pins (Qty = total pins, e.g. two 1x40 strips = 80). Each header taken from it uses as many pins as its footprint says.')),
    h('div', { class: 'form-row' }, notes),
    picker(newLines, () => {}),
    h('button', { class: 'btn primary', onclick: async () => {
      if (!name.value.trim()) return flash('Name is required.')
      try {
        const item = await api.addStock({ name: name.value.trim(), supplier: supplier.value.trim() || null, order_no: orderNo.value.trim() || null, by_pins: byPins.checked, qty: Math.max(0, Math.floor(+qty.value || 0)),
          bom_line_ids: [...newLines], notes: notes.value.trim() || null })
        items.push(item)
        name.value = ''; supplier.value = ''; orderNo.value = ''; notes.value = ''; qty.value = '0'; byPins.checked = false
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
      const pinsIn = h('input', { type: 'checkbox', checked: it.by_pins, disabled: !admin, title: 'Count this stock in pins', onchange: () => { it.by_pins = pinsIn.checked; void save({ by_pins: it.by_pins }).then(renderRows) } })
      const qtyIn = h('input', { type: 'number', min: 0, value: String(it.qty), class: 'narrow', disabled: !admin, onchange: () => {
        it.qty = Math.max(0, Math.floor(+qtyIn.value || 0))
        void save({ qty: it.qty }).then(renderRows)
      } })
      return h('tr', null,
        h('td', { class: 'mono' }, it.code),
        h('td', null, nameIn),
        h('td', null, supIn),
        h('td', null, onIn),
        h('td', null, qtyIn, ' ', pinsIn, h('span', { class: 'small muted' }, ' pins')),
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
    const strip = (s.pins_per_unit ?? 1) > 1
    const left = lcscCapacity(s) - used
    const lines = parts.filter((l) => l.lcsc_code === s.lcsc_code)
    const q = h('input', { type: 'number', min: 0, value: String(s.qty), class: 'narrow', disabled: !admin, onchange: () => {
      s.qty = Math.max(0, Math.floor(+q.value || 0))
      api.setLcscQty(s.lcsc_code, s.qty).then(() => { flash(`Saved ${s.lcsc_code}`); lcscBody.replaceChildren(...lcsc.map(lcscRow)) }, fail)
    } })
    return h('tr', null, h('td', { class: 'mono' }, s.lcsc_code), h('td', null, s.mpn), h('td', { class: 'small' }, s.description), h('td', null, q, strip ? h('span', { class: 'small muted' }, ` strips × ${s.pins_per_unit} = ${lcscCapacity(s)} pins`) : null),
      h('td', null, strip ? `${used} pins` : String(used)), h('td', { class: left < 0 ? 'error' : left === 0 ? 'muted' : '' }, strip ? `${left} pins` : String(left)),
      h('td', { class: 'small' }, lines.map(lineLabel).join('; ') || '—'))
  }
  const lcscBody = h('tbody', null, lcsc.map(lcscRow))
  if (!lcsc.length) lcscBody.append(h('tr', null, h('td', { colspan: 7, class: 'muted' }, 'Run supabase/lcsc_stock.sql (after migration 0004) to load the ordered quantities.')))

  // ---- manual checkout (parts taken without a BOM placement: spares, samples, scrap, rework) ----
  const coItem = h('select', { class: 'grow' },
    ...lcsc.map((x) => h('option', { value: `l:${x.lcsc_code}` }, `${x.lcsc_code} · ${x.mpn ?? ''}${(x.pins_per_unit ?? 1) > 1 ? ' (pins)' : ''}`)),
    ...items.map((x) => h('option', { value: `s:${x.id}` }, `${x.code} · ${x.name}${x.by_pins ? ' (pins)' : ''}`)))
  const coQty = h('input', { type: 'number', min: 1, value: '1', class: 'narrow', title: 'Pieces (pins for pin-header strips)' })
  const coBoard = h('input', { placeholder: 'Board code (optional)' })
  const coNote = h('input', { placeholder: 'Reason, e.g. spare / sample / scrap', class: 'grow' })
  const coBody = h('tbody')
  const itemName = (c: StockCheckout) => c.lcsc_code ?? items.find((x) => x.id === c.stock_item_id)?.code ?? '?'
  const renderCheckouts = () => {
    coBody.replaceChildren(...checkouts.map((c) => h('tr', null,
      h('td', { class: 'small' }, new Date(c.created_at).toLocaleString()), h('td', { class: 'mono' }, itemName(c)), h('td', null, String(c.qty)), h('td', { class: 'small' }, c.note ?? ''),
      h('td', null, (me.role === 'admin' || c.created_by === me.id) ? h('button', { class: 'btn small', onclick: async () => {
        if (!confirm(`Undo checkout of ${c.qty} × ${itemName(c)}? The quantity returns to stock.`)) return
        try {
          await api.deleteCheckout(c.id)
          checkouts.splice(checkouts.indexOf(c), 1)
          if (c.lcsc_code) lcscUsed.set(c.lcsc_code, Math.max(0, (lcscUsed.get(c.lcsc_code) ?? 0) - c.qty))
          if (c.stock_item_id) usage.set(c.stock_item_id, Math.max(0, (usage.get(c.stock_item_id) ?? 0) - c.qty))
          refreshAll()
        } catch (e) { fail(e) }
      } }, 'Undo') : null))))
    if (!checkouts.length) coBody.append(h('tr', null, h('td', { colspan: 5, class: 'muted' }, 'No manual checkouts yet.')))
  }
  const refreshAll = () => { renderRows(); lcscBody.replaceChildren(...lcsc.map(lcscRow)); renderCheckouts() }
  const checkoutCard = h('div', { class: 'card' }, h('h2', null, 'Manual checkout'),
    h('p', { class: 'muted small' }, 'Take parts out of stock without placing them through a BOM line (spares, samples, scrap, rework). The quantity counts as used. Pin-header strips are counted in pins.'),
    h('div', { class: 'form-row' }, coItem, h('label', null, 'Qty ', coQty)),
    h('div', { class: 'form-row' }, coBoard, coNote),
    h('button', { class: 'btn primary', onclick: async () => {
      const n = Math.floor(+coQty.value || 0)
      if (!coItem.value) return flash('Choose a part.')
      if (n < 1) return flash('Quantity must be at least 1.')
      try {
        let boardId: string | null = null
        if (coBoard.value.trim()) {
          const code = parseBoardCode(coBoard.value.trim())
          const b = code ? await api.boardBySerial(code.serial) : null
          if (!b) return flash('Unknown board code. Leave it empty or register the board first.')
          boardId = b.id
        }
        const [kind, id] = [coItem.value[0], coItem.value.slice(2)]
        const c = await api.addCheckout({ lcsc_code: kind === 'l' ? id : null, stock_item_id: kind === 's' ? id : null, qty: n, board_id: boardId, note: coNote.value.trim() || null })
        checkouts.unshift(c)
        if (c.lcsc_code) lcscUsed.set(c.lcsc_code, (lcscUsed.get(c.lcsc_code) ?? 0) + n)
        if (c.stock_item_id) usage.set(c.stock_item_id, (usage.get(c.stock_item_id) ?? 0) + n)
        coQty.value = '1'; coBoard.value = ''; coNote.value = ''
        refreshAll()
        flash(`Checked out ${n} × ${itemName(c)}.`)
      } catch (e) { fail(e) }
    } }, 'Check out'),
    h('table', { class: 'table' }, h('thead', null, h('tr', null, ['When', 'Part', 'Qty', 'Note', ''].map((t) => h('th', null, t)))), coBody))
  renderCheckouts()

  return h('div', null, status,
    admin ? addCard : null,
    checkoutCard,
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
