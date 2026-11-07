import { api } from '../lib/api'
import { h } from '../lib/dom'
import { BOARD_NAMES, type BoardType, type BomLine, type PartAlias, type Profile } from '../lib/types'

export async function adminView(me: Profile): Promise<HTMLElement> {
  if (me.role !== 'admin') return h('div', { class: 'card' }, 'Admins only.')
  const [bom, aliases, profiles] = await Promise.all([api.bom(), api.aliases(), api.profiles()])
  const status = h('div', { class: 'small muted' })
  const flash = (t: string) => (status.textContent = t)

  const bomTable = (type: BoardType) => {
    const rows = bom.filter((l) => l.board_type === type).map((l) => bomRow(l))
    return h('div', { class: 'card' }, h('h2', null, `${BOARD_NAMES[type]} BOM`),
      h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Step', 'Designators', 'Value', 'MPN (matched to “pm”)', 'LCSC code (“pc”): set = scanned twice, empty = confirm only', 'Scan enabled', 'Washable (ultrasonic bath)'].map((t) => h('th', null, t)))),
        h('tbody', null, rows)))
  }
  const bomRow = (l: BomLine) => {
    const lcsc = h('input', { value: l.lcsc_code ?? '', placeholder: 'C…', class: 'narrow mono', onchange: async () => {
      const v = lcsc.value.trim().toUpperCase() || null
      if (v && !/^C\d+$/.test(v)) return flash('LCSC code looks like C3204125')
      await api.updateBomLine(l.id, { lcsc_code: v }).then(() => flash(`Saved ${l.designators.join(', ')}`), (e) => flash(e.message))
    } })
    const mpn = h('input', { value: l.mpn ?? '', class: 'mono', onchange: async () => {
      await api.updateBomLine(l.id, { mpn: mpn.value.trim() || null }).then(() => flash(`Saved ${l.designators.join(', ')}`), (e) => flash(e.message))
    } })
    const scan = h('input', { type: 'checkbox', checked: l.scan_required, onchange: async () => {
      await api.updateBomLine(l.id, { scan_required: scan.checked }).then(() => flash('Saved'), (e) => flash(e.message))
    } })
    const wash = h('input', { type: 'checkbox', checked: l.washable, disabled: l.kind === 'process', onchange: async () => {
      await api.updateBomLine(l.id, { washable: wash.checked }).then(() => flash('Saved: takes effect for boards opened from now on'), (e) => flash(e.message))
    } })
    if (l.kind === 'process') return h('tr', null, h('td', null, l.step), h('td', null, 'Ultrasonic bath'), h('td', { colspan: 4, class: 'muted' }, 'Process step: washable parts come before it, non-washable parts after it.'))
    return h('tr', null, h('td', null, l.step), h('td', null, l.designators.join(', ')), h('td', null, l.value), h('td', null, mpn), h('td', null, lcsc), h('td', null, scan), h('td', null, wash))
  }

  const lineName = (a: PartAlias) => {
    const l = bom.find((x) => x.id === a.bom_line_id)
    return l ? `${l.board_type} ${l.designators.join(', ')} (${l.mpn})` : a.bom_line_id
  }
  const aliasBody = h('tbody')
  const renderAliases = () => {
    aliasBody.replaceChildren(...aliases.map((a) => h('tr', null, h('td', { class: 'mono' }, a.lcsc_code), h('td', null, lineName(a)),
      h('td', null, h('button', { class: 'btn small', onclick: async () => {
        await api.removeAlias(a.lcsc_code)
        aliases.splice(aliases.indexOf(a), 1)
        renderAliases()
      } }, 'Remove')))))
    if (!aliases.length) aliasBody.append(h('tr', null, h('td', { colspan: 3, class: 'muted' }, 'None. They are created from rejected scans on the assembly page.')))
  }
  renderAliases()

  const users = h('tbody', null, profiles.map((p) => {
    const sel = h('select', { onchange: () => api.setRole(p.id, sel.value as Profile['role']).then(() => flash('Role saved'), (e) => flash(e.message)) },
      ...(['operator', 'admin'] as const).map((r) => h('option', { value: r, selected: p.role === r }, r)))
    return h('tr', null, h('td', null, p.email), h('td', null, sel))
  }))

  return h('div', null, status,
    h('div', { class: 'card' }, h('h2', null, 'LCSC aliases'), h('table', { class: 'table' }, h('tbody', null, aliasBody))),
    bomTable('MB'), bomTable('PW'),
    h('div', { class: 'card' }, h('h2', null, 'Users'), h('table', { class: 'table' }, users)))
}
