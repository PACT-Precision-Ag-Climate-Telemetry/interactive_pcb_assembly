import { api } from '../lib/api'
import { h } from '../lib/dom'
import { DEFECT_KINDS, type Board, type Defect, type DefectKind, type Placement, type Profile } from '../lib/types'

export interface DefectsCtx {
  board: () => Board
  me: Profile
  /** Shared, mutable list of this board's defects. */
  defects: Defect[]
  placements: () => Placement[]
  /** Remove the placement so the part has to be placed and scanned again. */
  rework: (designator: string) => Promise<void>
  /** Called whenever the defect list changed (open count may differ). */
  onChange: () => void
}

/** "Defects & rework" card on the board page: report a problem with a placed part, optionally send it back, mark it fixed. */
export function defectsCard(ctx: DefectsCtx): { el: HTMLElement; refresh(): void } {
  const status = h('div', { class: 'small muted' })
  const designator = h('select')
  const kind = h('select', null, ...(Object.entries(DEFECT_KINDS) as [DefectKind, string][]).map(([k, label]) => h('option', { value: k }, label)))
  const note = h('input', { placeholder: 'Note (optional)', class: 'grow' })
  const rework = h('input', { type: 'checkbox', checked: true })
  const reworkLabel = h('label', { class: 'small' }, rework, ' Send back for rework (remove placement; the part must be scanned again. A signed-off board is reopened and must be signed off again)')
  const list = h('tbody')
  const flash = (t: string) => (status.textContent = t)
  const fail = (e: unknown) => flash(e instanceof Error ? e.message : String(e))

  const report = h('button', { class: 'btn primary', onclick: async () => {
    const d = designator.value
    const p = ctx.placements().find((x) => x.designator === d)
    if (!p) return flash('Choose a placed part.')
    try {
      const created = await api.addDefect({
        board_id: ctx.board().id, designator: d, kind: kind.value as DefectKind, note: note.value.trim() || null,
        lcsc_code: p.lcsc_code, pbn: p.pbn, order_no: p.order_no, stock_item_id: p.stock_item_id,
      }, ctx.me.id)
      ctx.defects.unshift(created)
      note.value = ''
      flash(`Defect logged for ${d}.`)
      if (rework.checked) {
        await ctx.rework(d)
        flash(`Defect logged for ${d}; the part was sent back for rework.`)
      }
      refresh()
      ctx.onChange()
    } catch (e) { fail(e) }
  } }, 'Report defect')

  function refresh() {
    const placed = ctx.placements().map((p) => p.designator).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const keep = designator.value
    designator.replaceChildren(...placed.map((d) => h('option', { value: d, selected: d === keep }, d)))
    list.replaceChildren(...ctx.defects.map((d) => h('tr', null,
      h('td', null, d.designator),
      h('td', null, DEFECT_KINDS[d.kind]),
      h('td', { class: 'small' }, d.note ?? ''),
      h('td', { class: 'mono small' }, [d.lcsc_code, d.pbn].filter(Boolean).join(' · ')),
      h('td', { class: 'small' }, new Date(d.reported_at).toLocaleString()),
      h('td', null, d.status === 'open'
        ? h('button', { class: 'btn small', onclick: async () => {
          try {
            const upd = await api.fixDefect(d.id, ctx.me.id)
            Object.assign(d, upd)
            refresh()
            ctx.onChange()
          } catch (e) { fail(e) }
        } }, 'Mark fixed')
        : h('span', { class: 'tag scan' }, 'fixed')))))
    if (!ctx.defects.length) list.append(h('tr', null, h('td', { colspan: 6, class: 'muted' }, 'No defects logged for this board.')))
  }
  refresh()

  return {
    el: h('div', { class: 'card' }, h('h2', null, 'Defects & rework'),
      h('p', { class: 'muted small' }, 'Log a problem with a placed part. The bag it came from is saved with the report, so a bad lot shows up on the Trace page. The board cannot be signed off while a defect is open.'),
      h('div', { class: 'form-row' }, designator, kind, note, report),
      h('div', { class: 'form-row' }, reworkLabel),
      status,
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Part', 'Problem', 'Note', 'Bag', 'Reported', ''].map((t) => h('th', null, t)))),
        list)),
    refresh,
  }
}
