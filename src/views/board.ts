import { api } from '../lib/api'
import { beep, h } from '../lib/dom'
import { boardCodeHint, labelMatchesLine, parseBoardCode, parseLcsc, type LcscLabel } from '../lib/parsers'
import { scanPanel } from '../lib/scanner'
import { BOARD_NAMES, type Board, type BomLine, type Placement, type Profile } from '../lib/types'

interface Message {
  kind: 'ok' | 'error' | 'info'
  text: string
  /** A rejected LCSC label an admin may link to one of the pending parts of the current step. */
  linkable?: LcscLabel
}

/**
 * Parts WITH an LCSC code are scanned twice: before placing and again after soldering.
 * Parts WITHOUT an LCSC code are only placed and confirmed with a button (no scan).
 */
export const needsScan = (l: BomLine) => l.scan_required && Boolean(l.lcsc_code)

export async function boardView(serial: string, me: Profile): Promise<{ el: HTMLElement; destroy(): void }> {
  const code = parseBoardCode(serial)
  const root = h('div')
  if (!code) {
    root.append(h('div', { class: 'banner error' }, `"${serial}" is not a valid board code (${boardCodeHint('MB')} / ${boardCodeHint('PW')}).`))
    return { el: root, destroy() {} }
  }
  const found = await api.boardBySerial(code.serial)
  if (!found) {
    root.append(h('div', { class: 'banner error' }, 'This board is not registered yet. Scan its Data Matrix on the Boards page first.'))
    return { el: root, destroy() {} }
  }
  let board: Board = found
  const [lines, aliases, placementList] = await Promise.all([api.bom(board.board_type), api.aliases(), api.placements(board.id)])
  const placed = new Map<string, Placement>(placementList.map((p) => [p.designator, p]))
  const lineById = new Map(lines.map((l) => [l.id, l]))
  let message: Message | null = null
  let selected: string | null = null // designator the operator picked as the next target
  let busy = false

  const totalCount = lines.reduce((n, l) => n + l.designators.length, 0)
  const isDone = (d: string) => Boolean(placed.get(d)?.soldered_at)
  /** Not placed yet. */
  const unplaced = (l: BomLine) => l.designators.filter((d) => !placed.has(d))
  /** Not finished (not placed, or placed but not yet soldered/confirmed). */
  const remaining = (l: BomLine) => l.designators.filter((d) => !isDone(d))
  /** The one part currently "in hand": scanned before soldering, waiting for the after-solder scan. */
  const openPlacement = () => [...placed.values()].find((p) => !p.soldered_at)
  const doneCount = () => [...placed.values()].filter((p) => p.soldered_at).length
  const currentStep = () => lines.find((l) => remaining(l).length)?.step ?? null
  const stepLines = () => lines.filter((l) => l.step === currentStep() && remaining(l).length)
  const allDone = () => doneCount() >= totalCount
  const inProgress = () => board.status === 'in_progress'

  // The scan panel is created once so the camera keeps running across re-renders.
  const panel = scanPanel((raw) => void onScan(raw), 'Scan LCSC package QR…')
  const view = h('div')
  root.append(view)

  function say(m: Message) {
    message = m
    beep(m.kind !== 'error')
    render()
  }

  async function place(line: BomLine, designator: string, label: LcscLabel | null, raw: string | null, soldered: boolean) {
    const p = await api.addPlacement({
      board_id: board.id, designator, bom_line_id: line.id, scan_raw: raw,
      pbn: label?.pbn ?? null, order_no: label?.on ?? null, lcsc_code: label?.pc ?? null, mpn: label?.pm ?? null, pack_qty: label?.qty ?? null,
      soldered_at: soldered ? new Date().toISOString() : null,
    })
    placed.set(designator, p)
    selected = null
  }

  async function onScan(raw: string) {
    if (busy) return
    busy = true
    try {
      await handleScan(raw)
    } catch (e) {
      say({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      busy = false
      panel.focus()
    }
  }

  async function handleScan(raw: string) {
    const reject = (text: string, label?: LcscLabel) => {
      api.logScan(board.id, raw, 'rejected', text)
      say({ kind: 'error', text, linkable: label && me.role === 'admin' ? label : undefined })
    }

    // Board code: sign-off (when everything is soldered) or a warning for another board.
    const bc = parseBoardCode(raw)
    if (bc) {
      if (bc.serial !== board.serial) {
        return reject(`That is board ${bc.serial}, but you are working on ${board.serial}. Go to the Boards page to switch.`)
      }
      if (!inProgress()) return say({ kind: 'info', text: 'This board is already signed off.' })
      if (!allDone()) return say({ kind: 'info', text: `Board verified. ${totalCount - doneCount()} parts still to finish.` })
      await api.completeBoard(board.id, me.id)
      api.logScan(board.id, raw, 'accepted', 'sign-off')
      board = { ...board, status: 'completed', completed_at: new Date().toISOString() }
      return say({ kind: 'ok', text: `Board ${board.serial} signed off as complete.` })
    }

    const label = parseLcsc(raw)
    if (!label) return reject(`Not recognised: "${raw.slice(0, 60)}". Scan the QR on the LCSC package bag.`)
    if (!inProgress()) return reject('This board is already completed.')
    if (allDone()) return reject('Every part is finished. Scan the board code to sign off.')
    const what = `${label.pc}${label.pm ? ` (${label.pm})` : ''}`

    // Second scan: confirm the part that was placed before is now soldered.
    const open = openPlacement()
    if (open) {
      const openLine = lineById.get(open.bom_line_id)!
      if (!labelMatchesLine(label, openLine, aliases)) {
        return reject(`Finish ${open.designator} first: solder it, then scan its package (${openLine.lcsc_code}) again. Scanned ${what} instead.`)
      }
      const updated = await api.markSoldered(open.id, raw, me.id)
      placed.set(open.designator, updated)
      api.logScan(board.id, raw, 'accepted', `${open.designator} soldered`)
      return say({ kind: 'ok', text: `${open.designator} soldered ✓ confirmed.` })
    }

    // First scan: verify the package is the right part for the current step, then place it.
    const step = currentStep()!
    const candidates = stepLines().filter((l) => needsScan(l) && unplaced(l).length)
    const hit = candidates.find((l) => labelMatchesLine(label, l, aliases))
    if (!hit) {
      const later = lines.find((l) => l.step !== step && unplaced(l).length && labelMatchesLine(label, l, aliases))
      const done = lines.find((l) => !unplaced(l).length && labelMatchesLine(label, l, aliases))
      if (later) return reject(`Too early: ${what} is for step ${later.step} (${later.stage}: ${later.designators.join(', ')}). Current step is ${step}.`, label)
      if (done) return reject(`${what} was already fully placed (${done.designators.join(', ')}).`)
      const need = candidates.map((l) => `${l.designators.join(', ')} = ${l.lcsc_code}`).join(' · ')
      return reject(`Wrong part: ${what}. Step ${step} needs: ${need || 'nothing to scan (confirm the parts below)'}.`, label)
    }

    const pend = unplaced(hit)
    const target = selected && pend.includes(selected) ? selected : pend[0]
    await place(hit, target, label, raw, false)
    api.logScan(board.id, raw, 'accepted', `${target} placed`)

    let note = ''
    let warn = false
    if (label.pbn && label.pc) {
      const used = await api.bagUsage(label.pbn, label.on, label.pc).catch(() => 0)
      if (label.qty && used > label.qty) {
        warn = true
        note = ` Warning: bag ${label.pbn} has now been used ${used} times but holds only ${label.qty}.`
      } else if (label.qty) note = ` Bag ${label.pbn}: ${used}/${label.qty} used.`
    }
    say({ kind: warn ? 'info' : 'ok', text: `${target} ← ${hit.value ?? hit.mpn} accepted. Place and solder it, then scan the package again.${note}` })
  }

  /** Parts without an LCSC code: place, then confirm with the button. No scan. */
  async function confirmManual(line: BomLine, d: string) {
    try {
      await place(line, d, null, null, true)
      api.logScan(board.id, `manual:${d}`, 'accepted', 'manual confirm')
      say({ kind: 'ok', text: `${d} confirmed.` })
    } catch (e) {
      say({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function undo(d: string) {
    const p = placed.get(d)
    if (!p || !inProgress()) return
    if (!confirm(`Undo ${d}? It will be removed from this board.`)) return
    try {
      await api.removePlacement(p.id)
      placed.delete(d)
      say({ kind: 'info', text: `${d} removed.` })
    } catch (e) {
      say({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  const nextOf = (l: BomLine) => {
    const rest = unplaced(l)
    return selected && rest.includes(selected) ? selected : rest[0]
  }

  function chip(line: BomLine, d: string) {
    const p = placed.get(d)
    if (p?.soldered_at) {
      const title = p.scan_raw ? `${p.lcsc_code} · bag ${p.pbn} · scanned twice` : 'confirmed manually'
      return h('button', { class: 'chip done', title, onclick: () => void undo(d) }, `✓ ${d}`)
    }
    if (p) return h('button', { class: 'chip open', title: 'Placed. Solder it, then scan the package again.', onclick: () => void undo(d) }, `🔥 ${d}`)
    return h('button', { class: `chip${nextOf(line) === d ? ' next' : ''}`, onclick: () => { selected = d; render() } }, d)
  }

  function lineCard(l: BomLine) {
    const rest = unplaced(l)
    const scan = needsScan(l)
    return h('div', { class: `part${remaining(l).length ? '' : ' complete'}` },
      h('div', { class: 'part-head' },
        h('strong', null, l.value ?? l.mpn),
        h('span', { class: 'muted' }, ` ${l.manufacturer ?? ''} `),
        h('span', { class: 'mono' }, l.mpn ?? ''),
        l.lcsc_code ? h('span', { class: 'tag' }, l.lcsc_code) : null,
        h('span', { class: `tag ${scan ? 'scan' : 'manual'}` }, scan ? 'scan before + after' : 'no scan: confirm')),
      h('div', { class: 'chips' }, l.designators.map((d) => chip(l, d))),
      l.footprint ? h('div', { class: 'small muted' }, `Footprint: ${l.footprint}`) : null,
      l.orientation ? h('div', { class: 'orient' }, `Orientation: ${l.orientation}`) : null,
      l.notes ? h('div', { class: 'small' }, l.notes) : null,
      !scan && rest.length && inProgress()
        ? h('button', { class: 'btn primary', onclick: () => void confirmManual(l, nextOf(l)) }, `${nextOf(l)} placed and soldered`)
        : null)
  }

  function banner() {
    if (!message) return null
    const el = h('div', { class: `banner ${message.kind}` }, message.text)
    const label = message.linkable
    if (label) {
      const options = stepLines().filter((l) => l.scan_required)
      const sel = h('select', null, ...options.map((l) => h('option', { value: l.id }, `${l.designators.join(', ')} – ${l.mpn}`)))
      el.append(h('div', { class: 'link-row' }, `Admin: is this the right part? Link ${label.pc} to`, sel,
        h('button', { class: 'btn small', onclick: async () => {
          try {
            await api.addAlias(label.pc!, sel.value)
            aliases.push({ lcsc_code: label.pc!, bom_line_id: sel.value })
            say({ kind: 'ok', text: `${label.pc} linked. Scan the part again.` })
          } catch (e) {
            say({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
          }
        } }, 'Link')))
    }
    return el
  }

  function render() {
    const step = currentStep()
    const done = doneCount()
    const pct = totalCount ? Math.round((done / totalCount) * 100) : 0
    const stages = [...new Set(lines.map((l) => l.step))].map((s) => {
      const ls = lines.filter((l) => l.step === s)
      const left = ls.reduce((n, l) => n + remaining(l).length, 0)
      return h('li', { class: left === 0 ? 'done' : s === step ? 'current' : '' }, `${ls[0].stage}`, h('span', { class: 'small muted' }, left === 0 ? ' ✓' : ` ${left} left`))
    })

    const open = openPlacement()
    const openLine = open ? lineById.get(open.bom_line_id) : undefined
    const prompt = open && openLine
      ? h('div', { class: 'banner info solder' }, `Solder ${open.designator} (${openLine.value ?? openLine.mpn}), then scan its package QR again to confirm.`)
      : null

    let main: HTMLElement
    if (!inProgress()) {
      main = h('div', { class: 'card' }, h('h2', null, 'Board completed'),
        h('p', null, `Signed off ${board.completed_at ? new Date(board.completed_at).toLocaleString() : ''}. All ${totalCount} parts were placed and confirmed.`))
    } else if (allDone()) {
      main = h('div', { class: 'card signoff' }, h('h2', null, 'All parts soldered'), h('p', null, `Final check: scan the board Data Matrix (${board.serial}) to sign off.`))
    } else {
      const here = stepLines()
      main = h('div', { class: 'card' }, h('h2', null, `Step ${step}: ${here[0].stage}`),
        h('p', { class: 'muted' }, 'Scan the package QR before placing a part and again after soldering it. Parts without an LCSC code are only confirmed.'),
        ...here.map(lineCard))
    }

    view.replaceChildren(
      h('div', { class: 'board-head card' },
        h('img', { src: `/img/${board.board_type}_top.png`, alt: BOARD_NAMES[board.board_type], class: 'board-img' }),
        h('div', { class: 'grow' },
          h('h1', { class: 'mono' }, board.serial),
          h('div', { class: 'muted' }, `${BOARD_NAMES[board.board_type]} · batch ${board.batch} · seq ${board.seq}`),
          h('div', { class: 'bar big' }, h('div', { style: `width:${pct}%` })),
          h('div', { class: 'small' }, `${done} / ${totalCount} soldered (${pct}%)`))),
      inProgress() ? h('div', { class: 'card scan-card' }, panel.el, prompt, banner()) : (banner() ?? ''),
      h('div', { class: 'cols' }, main, h('div', { class: 'card steps' }, h('h3', null, 'Steps'), h('ol', null, ...stages))))
  }
  render()
  queueMicrotask(() => panel.focus())
  return { el: root, destroy: panel.destroy }
}
