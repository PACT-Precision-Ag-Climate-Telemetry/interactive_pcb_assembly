import { h } from './dom'
import type { Geo, Highlight, Viewer3d } from './viewer3d'
import type { BoardType } from './types'

export interface BoardMap {
  el: HTMLElement
  setHighlight(hl: Highlight): void
  destroy(): void
}

const SVG = 'http://www.w3.org/2000/svg'
const svgEl = (tag: string, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}

/** 2D top view drawn from the KiCad footprint data: always available, also the fallback when 3D cannot load. */
function createViewer2d(geo: Geo, onPick: (d: string) => void) {
  const [x0, y0, x1, y1] = geo.outline
  const m = 3
  const svg = svgEl('svg', { viewBox: `${x0 - m} ${y0 - m} ${x1 - x0 + 2 * m} ${y1 - y0 + 2 * m}`, class: 'viewer2d' })
  svg.append(svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: 'v2-board' }))
  const nodes = new Map<string, SVGGElement>()
  for (const [ref, p] of Object.entries(geo.parts)) {
    const [bx0, by0, bx1, by1] = p.box
    const g = svgEl('g', { class: `v2-part${p.side === 'B' ? ' back' : ''}` }) as SVGGElement
    g.append(svgEl('rect', { x: bx0, y: by0, width: Math.max(bx1 - bx0, 1.2), height: Math.max(by1 - by0, 1.2), rx: 0.6 }))
    const t = svgEl('text', { x: (bx0 + bx1) / 2, y: (by0 + by1) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle' })
    t.textContent = ref
    if (by1 - by0 > 2 * (bx1 - bx0)) t.setAttribute('transform', `rotate(-90 ${(bx0 + bx1) / 2} ${(by0 + by1) / 2})`)
    g.append(t)
    g.addEventListener('click', () => onPick(ref))
    svg.append(g)
    nodes.set(ref, g)
  }
  const full = svg.getAttribute('viewBox')!
  const zoomTo = (ref: string | null | undefined) => {
    const p = ref ? geo.parts[ref] : undefined
    if (!p) return svg.setAttribute('viewBox', full)
    const [a, b, c, d] = p.box
    const cx = (a + c) / 2
    const cy = (b + d) / 2
    const half = Math.max(c - a, d - b, 10) / 2 + 12
    svg.setAttribute('viewBox', `${cx - half * 1.6} ${cy - half} ${half * 3.2} ${half * 2}`)
  }
  return {
    el: svg as unknown as HTMLElement,
    setFollow(on: boolean, hl: Highlight) { zoomTo(on ? hl.solder ?? hl.target : null) },
    setHighlight(hl: Highlight, follow: boolean) {
      if (follow) zoomTo(hl.solder ?? hl.target)
      for (const g of nodes.values()) g.setAttribute('class', g.getAttribute('class')!.replace(/ (pending|target|solder)/g, ''))
      const add = (d: string | null | undefined, c: string) => { const g = d ? nodes.get(d) : undefined; if (g) g.setAttribute('class', g.getAttribute('class') + ' ' + c) }
      hl.pending.forEach((d) => add(d, 'pending'))
      add(hl.target, 'target')
      add(hl.solder, 'solder')
    },
  }
}

const webgl = () => {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

/** Board map card content: 3D (kicad-cli glTF) with 2D fallback. Highlights the parts of the current step. */
export function boardMap(type: BoardType, onPick: (designator: string) => void): BoardMap {
  const stage = h('div', { class: 'map-stage' }, h('p', { class: 'muted small' }, 'Loading board map…'))
  const note = h('span', { class: 'small muted' })
  let hl: Highlight = { pending: [] }
  let geo: Geo | null = null
  let v2: ReturnType<typeof createViewer2d> | null = null
  let v3: Viewer3d | null = null
  let destroyed = false
  let follow = localStorage.getItem('boardmap-follow') !== '0'
  let mode: '2d' | '3d' = (localStorage.getItem('boardmap-mode') as '2d' | '3d' | null) ?? (webgl() ? '3d' : '2d')

  const btn3 = h('button', { class: 'btn small', onclick: () => show('3d') }, '3D')
  const btn2 = h('button', { class: 'btn small', onclick: () => show('2d') }, '2D')
  const followBox = h('input', { type: 'checkbox', checked: follow, onchange: () => {
    follow = followBox.checked
    localStorage.setItem('boardmap-follow', follow ? '1' : '0')
    v3?.setFollow(follow)
    v2?.setFollow(follow, hl)
  } })
  const reset = h('button', { class: 'btn small', onclick: () => { v3?.resetView(); v2?.setFollow(false, hl) } }, 'Reset view')

  async function show(next: '2d' | '3d') {
    if (!geo || destroyed) return
    mode = next
    localStorage.setItem('boardmap-mode', next)
    btn3.classList.toggle('on', next === '3d')
    btn2.classList.toggle('on', next === '2d')
    note.textContent = ''
    if (next === '3d') {
      stage.replaceChildren(h('p', { class: 'muted small' }, 'Loading 3D model (about 10 MB, cached after the first time)…'))
      try {
        if (!webgl()) throw new Error('WebGL is not available in this browser')
        const mod = await import('./viewer3d')
        const viewer = await mod.createViewer3d(`/models/${type}.glb`, geo, onPick)
        if (destroyed || mode !== '3d') return viewer.destroy()
        v3?.destroy()
        v3 = viewer
        stage.replaceChildren(viewer.el)
        viewer.setHighlight(hl)
        viewer.setFollow(follow)
        return
      } catch (e) {
        note.textContent = `3D unavailable (${e instanceof Error ? e.message : e}); showing the 2D map.`
        mode = '2d'
        btn3.classList.remove('on')
        btn2.classList.add('on')
        reset.hidden = true
      }
    }
    v3?.destroy()
    v3 = null
    v2 = createViewer2d(geo, onPick)
    stage.replaceChildren(v2.el)
    v2.setHighlight(hl, follow)
  }

  fetch(`/models/${type}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`board data HTTP ${r.status}`))))
    .then((g: Geo) => { geo = g; return show(mode) })
    .catch((e) => { stage.replaceChildren(h('p', { class: 'error' }, `Board map unavailable: ${e instanceof Error ? e.message : e}`)) })

  return {
    el: h('div', null,
      h('div', { class: 'form-row' }, btn3, btn2, reset, h('label', { class: 'small' }, followBox, ' Follow current part'), note,
        h('span', { class: 'small map-legend' },
          h('span', { class: 'dot pending' }), ' to place now ', h('span', { class: 'dot target' }), ' next ', h('span', { class: 'dot solder' }), ' solder ')),
      stage),
    setHighlight(next) {
      hl = next
      v3?.setHighlight(next)
      v2?.setHighlight(next, follow)
    },
    destroy() {
      destroyed = true
      v3?.destroy()
    },
  }
}
