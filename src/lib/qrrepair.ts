/**
 * Recovers QR codes with damaged finder squares, e.g. one or more outer rows/columns cut off, covered or outside the frame.
 *
 * A normal decoder needs all three finder squares. The middle rows of a finder (the 1:1:3:1:1 pattern) usually
 * survive, so we find finder candidates by scanning rows AND columns, work out the module grid from three of them
 * (any rotation, tilt/shear included, any side missing), resample the code, redraw the fixed patterns
 * (finders, separators, timing lines) and give the clean image to a normal decoder. QR error correction fixes
 * the modules that were lost.
 */
export interface Gray { data: Uint8Array; w: number; h: number }
export type Decode = (img: ImageData) => Promise<string | null>

export function toGray(img: ImageData): Gray {
  const { data, width: w, height: h } = img
  const g = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8
  return { data: g, w, h }
}

export function otsu(g: ArrayLike<number>): number {
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < g.length; i++) hist[g[i]]++
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let wB = 0, sB = 0, best = -1, lo = 128, hi = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = g.length - wB
    if (!wF) break
    sB += t * hist[t]
    const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2
    if (between > best) { best = between; lo = hi = t } else if (between === best) hi = t // flat plateau (clean two-tone image)
  }
  return (lo + hi) >> 1
}

const invert = (g: Gray): Gray => ({ data: g.data.map((v) => 255 - v), w: g.w, h: g.h })

// ---------- finder candidates ----------

/** Result of a 1:1:3:1:1 scan: `pos` is exact along the scan line, [lo, hi) is the extent across lines. */
interface Group { pos: number; lo: number; hi: number; m: number }
interface Pt { x: number; y: number }
interface Finder { xs: number[]; ys: number[]; m: number }

function scan(g: Gray, thr: number, vertical: boolean): Group[] {
  const lines = vertical ? g.w : g.h
  const len = vertical ? g.h : g.w
  const at = (i: number, line: number) => (vertical ? g.data[i * g.w + line] : g.data[line * g.w + i])
  type Hit = { line: number; pos: number; m: number }
  const hits: Hit[] = []
  const runs: { dark: boolean; start: number; len: number }[] = []
  for (let line = 0; line < lines; line++) {
    runs.length = 0
    let prev = at(0, line) < thr
    let start = 0
    for (let i = 1; i <= len; i++) {
      const cur = i < len ? at(i, line) < thr : !prev
      if (cur !== prev) { runs.push({ dark: prev, start, len: i - start }); start = i; prev = cur }
    }
    for (let k = 0; k + 4 < runs.length; k++) {
      if (!runs[k].dark) continue
      const a = runs[k].len, b = runs[k + 1].len, c = runs[k + 2].len, d = runs[k + 3].len, e = runs[k + 4].len
      const m = (a + b + c + d + e) / 7
      if (m < 1.5) continue
      const t = 0.55 * m
      if (Math.abs(a - m) <= t && Math.abs(b - m) <= t && Math.abs(c - 3 * m) <= 1.4 * m && Math.abs(d - m) <= t && Math.abs(e - m) <= t) {
        hits.push({ line, pos: runs[k].start + (a + b + c + d + e) / 2, m })
      }
    }
  }
  const groups: { hits: Hit[] }[] = []
  for (const hit of hits) {
    const gr = groups.find((q) => {
      const l = q.hits[q.hits.length - 1]
      return hit.line - l.line <= 2 && Math.abs(hit.pos - l.pos) <= l.m * 0.7 && Math.abs(hit.m - l.m) <= l.m * 0.35
    })
    if (gr) gr.hits.push(hit)
    else groups.push({ hits: [hit] })
  }
  const out: Group[] = []
  for (const { hits: hs } of groups) {
    const m = hs.reduce((s, v) => s + v.m, 0) / hs.length
    const extent = hs[hs.length - 1].line - hs[0].line + 1
    if (extent < 0.7 * m || extent > 4.8 * m) continue // finder rows 2-4 = 3 modules; fewer when rows are cut
    out.push({ pos: hs.reduce((s, v) => s + v.pos, 0) / hs.length, lo: hs[0].line, hi: hs[hs.length - 1].line + 1, m })
  }
  return out
}

/** Possible finder-centre coordinates across the scan: rows 2-4 survive, so the missing rows are above or below. */
function across(gr: Group): number[] {
  const mid = (gr.lo + gr.hi) / 2
  if (gr.hi - gr.lo >= 2.4 * gr.m) return [mid]
  return [gr.lo + 1.5 * gr.m, gr.hi - 1.5 * gr.m]
}

export function findFinders(g: Gray, thr: number): Finder[] {
  const hs = scan(g, thr, false) // x exact, y uncertain when rows are cut
  const vs = scan(g, thr, true) // y exact, x uncertain when columns are cut
  const out: Finder[] = []
  const usedV = new Set<Group>()
  for (const hg of hs) {
    const ys = across(hg)
    const match = vs.find((vg) => !usedV.has(vg) && Math.abs(vg.pos - ys[0]) <= 2.5 * hg.m && across(vg).some((x) => Math.abs(x - hg.pos) <= 2.5 * hg.m) && Math.abs(vg.m - hg.m) <= 0.4 * hg.m)
    if (match) { usedV.add(match); out.push({ xs: [hg.pos], ys: [match.pos], m: (hg.m + match.m) / 2 }) } else out.push({ xs: [hg.pos], ys, m: hg.m })
  }
  for (const vg of vs) if (!usedV.has(vg)) out.push({ xs: across(vg), ys: [vg.pos], m: vg.m })
  return out
}

// ---------- grid ----------

/** Module grid from three finder centres: c = corner (top-left), a = top-right, b = bottom-left. */
export interface Grid { c: Pt; a: Pt; b: Pt; n: number; score: number }
interface Axes { o: Pt; u: Pt; v: Pt }

/** Centre of module (col, row) is o + (col + .5) * u + (row + .5) * v. u/v = one module along columns/rows. */
export function axes(g: Grid): Axes {
  const k = g.n - 7
  const u = { x: (g.a.x - g.c.x) / k, y: (g.a.y - g.c.y) / k }
  const v = { x: (g.b.x - g.c.x) / k, y: (g.b.y - g.c.y) / k }
  return { o: { x: g.c.x - 3.5 * (u.x + v.x), y: g.c.y - 3.5 * (u.y + v.y) }, u, v }
}

const N_VALUES = Array.from({ length: 11 }, (_, i) => 21 + 4 * i) // versions 1..11 (21..61 modules)

/** All plausible module counts for a code with finder centres c, a, b, given the scanned module width m. */
function gridsFor(c: Pt, a: Pt, b: Pt, m: number, penalty: number): Grid[] {
  const ux = a.x - c.x, uy = a.y - c.y, vx = b.x - c.x, vy = b.y - c.y
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy)
  if (lu < 10 * m * 0.7 || lv < 10 * m * 0.7) return []
  if (ux * vy - uy * vx <= 0) return [] // not mirrored: u (to top-right) turns clockwise into v (to bottom-left)
  const cos = (ux * vx + uy * vy) / (lu * lv)
  if (Math.abs(cos) > 0.3 || Math.abs(lu - lv) > 0.16 * Math.max(lu, lv)) return []
  // A tilted scan line sees modules stretched by 1/cos(tilt), so judge the module size against m * cos(tilt).
  const tilt = ((((Math.atan2(uy, ux) * 180) / Math.PI + 45) % 90) + 90) % 90 - 45
  const mTrue = m * Math.cos((tilt * Math.PI) / 180)
  const out: Grid[] = []
  for (const n of N_VALUES) {
    const s = (lu + lv) / 2 / (n - 7)
    const ratio = s / mTrue
    if (ratio < 0.85 || ratio > 1.15) continue
    out.push({ c, a, b, n, score: Math.abs(cos) + Math.abs(lu - lv) / Math.max(lu, lv) + Math.abs(ratio - 1) + penalty })
  }
  return out
}

/**
 * Builds grid hypotheses from finder candidates (any rotation/tilt). Uses three finders when available; when a finder is
 * completely destroyed (two touching edges cut) it is inferred from the other two (they sit on a diagonal of the square).
 */
export function gridsFromFinders(f0: Finder[], maxGrids = 6): Grid[] {
  const f = f0.slice(0, 28)
  const found: Grid[] = []
  const inferred: Grid[] = []
  for (const C of f) for (const A of f) {
    if (A === C || Math.abs(A.m - C.m) > 0.35 * C.m) continue
    for (const B of f) {
      if (B === C || B === A || Math.abs(B.m - C.m) > 0.35 * C.m) continue
      const m = (A.m + B.m + C.m) / 3
      for (const cx of C.xs) for (const cy of C.ys) for (const ax of A.xs) for (const ay of A.ys) for (const bx of B.xs) for (const by of B.ys) {
        const unc = (C.xs.length + C.ys.length + A.xs.length + A.ys.length + B.xs.length + B.ys.length - 6) * 0.01
        found.push(...gridsFor({ x: cx, y: cy }, { x: ax, y: ay }, { x: bx, y: by }, m, unc))
      }
    }
  }
  {
    // corner finder missing: A = top-right, B = bottom-left; u = (dy - dx, -dx - dy) / 2, corner = A - u
    for (const A of f) for (const B of f) {
      if (A === B || Math.abs(A.m - B.m) > 0.35 * A.m) continue
      const m = (A.m + B.m) / 2
      for (const ax of A.xs) for (const ay of A.ys) for (const bx of B.xs) for (const by of B.ys) {
        const dx = bx - ax, dy = by - ay
        const ux = (dy - dx) / 2, uy = (-dx - dy) / 2
        inferred.push(...gridsFor({ x: ax - ux, y: ay - uy }, { x: ax, y: ay }, { x: bx, y: by }, m, 0.5))
      }
    }
  }
  const pick = (list: Grid[], max: number) => {
    list.sort((x, y) => x.score - y.score)
    const out: Grid[] = []
    for (const g of list) {
      const gu = Math.hypot(g.a.x - g.c.x, g.a.y - g.c.y) / (g.n - 7)
      if (out.some((q) => q.n === g.n && Math.hypot(q.c.x - g.c.x, q.c.y - g.c.y) < gu * 1.5 && Math.hypot(q.a.x - g.a.x, q.a.y - g.a.y) < gu * 1.5)) continue
      out.push(g)
      if (out.length >= max) break
    }
    return out
  }
  return [...pick(found, maxGrids), ...pick(inferred, 3)]
}

/** Fixed pattern at module (r, c): true/false for finder, separator and timing lines, null for data. */
export function fixedModule(r: number, c: number, n: number): boolean | null {
  for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const dr = r - fr, dc = c - fc
    if (dr < -1 || dr > 7 || dc < -1 || dc > 7) continue
    if (dr < 0 || dr > 6 || dc < 0 || dc > 6) return false
    return dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
  }
  if (r === 6 && c > 7 && c < n - 8) return c % 2 === 0
  if (c === 6 && r > 7 && r < n - 8) return r % 2 === 0
  return null
}

/** Resamples the grid (optionally shifted by `shift` modules) into a clean dark-on-light image. */
export function rebuild(g: Gray, grid: Grid, shift: Pt = { x: 0, y: 0 }, scale = 8): ImageData {
  const { o, u, v } = axes(grid)
  const n = grid.n
  const vals = new Float32Array(n * n).fill(-1)
  const sample: number[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (fixedModule(r, c, n) !== null) continue
    let sum = 0, cnt = 0
    for (const dc of [-0.2, 0.05, 0.3]) for (const dr of [-0.2, 0.05, 0.3]) {
      const cc = c + 0.5 + shift.x + dc, rr = r + 0.5 + shift.y + dr
      const px = Math.round(o.x + cc * u.x + rr * v.x), py = Math.round(o.y + cc * u.y + rr * v.y)
      if (px < 0 || py < 0 || px >= g.w || py >= g.h) continue
      sum += g.data[py * g.w + px]; cnt++
    }
    if (cnt) { vals[r * n + c] = sum / cnt; sample.push(Math.round(sum / cnt)) }
  }
  const thr = sample.length ? otsu(sample) : 128
  const q = 4, size = (n + 2 * q) * scale
  const d = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const fixed = fixedModule(r, c, n)
    const dark = fixed ?? (vals[r * n + c] >= 0 && vals[r * n + c] < thr)
    if (!dark) continue
    for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
      const p = (((r + q) * scale + j) * size + (c + q) * scale + i) * 4
      d[p] = d[p + 1] = d[p + 2] = 0
    }
  }
  return { data: d, width: size, height: size, colorSpace: 'srgb' } as ImageData
}


/** How well the grid explains the fixed patterns (finders, timing lines): soft agreement, mismatches count less (cut rows). */
function fitScore(g: Gray, grid: Grid, thr: number): number {
  const { o, u, v } = axes(grid)
  const n = grid.n
  let score = 0
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const fixed = fixedModule(r, c, n)
    if (fixed === null) continue
    const px = Math.round(o.x + (c + 0.5) * u.x + (r + 0.5) * v.x), py = Math.round(o.y + (c + 0.5) * u.y + (r + 0.5) * v.y)
    if (px < 0 || py < 0 || px >= g.w || py >= g.h) continue
    const t = Math.tanh((thr - g.data[py * g.w + px]) / 40) * (fixed ? 1 : -1)
    score += t > 0 ? t : 0.3 * t
  }
  return score
}

/** Coordinate descent on the three finder centres so the fixed patterns line up with the pixels. */
export function refine(g: Gray, grid: Grid, thr: number): Grid {
  let best = grid
  let bestScore = fitScore(g, best, thr)
  const mod = Math.hypot(best.a.x - best.c.x, best.a.y - best.c.y) / (best.n - 7)
  for (let step = mod * 0.5; step > mod * 0.04; step /= 2) {
    for (let pass = 0; pass < 3; pass++) {
      let improved = false
      for (const key of ['c', 'a', 'b'] as const) for (const axis of ['x', 'y'] as const) for (const sign of [1, -1]) {
        const cand: Grid = { ...best, [key]: { ...best[key], [axis]: best[key][axis] + sign * step } }
        const sc = fitScore(g, cand, thr)
        if (sc > bestScore + 1e-6) { best = cand; bestScore = sc; improved = true }
      }
      if (!improved) break
    }
  }
  return best
}

const SHIFTS: Pt[] = [{ x: 0, y: 0 }, { x: 0.2, y: 0.2 }, { x: -0.2, y: -0.2 }, { x: 0.2, y: -0.2 }, { x: -0.2, y: 0.2 }]

/**
 * Tries to decode a QR whose finder squares are partly missing. `budgetMs` caps the time spent per call.
 * Light-on-dark codes are handled by trying the inverted image as well.
 */
export async function decodeDamagedQr(img: ImageData, decode: Decode, budgetMs = 400): Promise<string | null> {
  const t0 = Date.now()
  const base = toGray(img)
  for (const g of [base, invert(base)]) {
    const thr = otsu(g.data)
    const grids = gridsFromFinders(findFinders(g, thr)).map((q) => refine(g, q, thr))
    for (const shift of SHIFTS) for (const grid of grids) {
      if (Date.now() - t0 > budgetMs) return null
      const text = await decode(rebuild(g, grid, shift))
      if (text) return text
    }
  }
  return null
}
