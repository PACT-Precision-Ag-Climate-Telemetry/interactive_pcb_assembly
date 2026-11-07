// Builds the board map data and 3D models used by the "Board map" viewer.
//   public/models/<MB|PW>.json  footprint positions + board outline, read from the KiCad boards (always)
//   public/models/<MB|PW>.glb   3D model exported with kicad-cli (only when kicad-cli is found; the .glb files are committed)
// Usage: node scripts/build-models.mjs   (optionally KICAD_CLI=path/to/kicad-cli)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pact = path.resolve(root, '..')
const boards = {
  PW: path.join(pact, 'power-management-master/power-management-master.kicad_pcb'),
  MB: path.join(pact, 'mainboard-master/mainboard-master.kicad_pcb'),
}
const outDir = path.join(root, 'public/models')
fs.mkdirSync(outDir, { recursive: true })

// ---- minimal S-expression parser ----
function parse(text) {
  let i = 0
  const n = text.length
  function node() {
    const list = []
    while (i < n) {
      const c = text[i]
      if (c === '(') { i++; list.push(node()) }
      else if (c === ')') { i++; return list }
      else if (c === '"') {
        let s = ''
        i++
        while (i < n && text[i] !== '"') { if (text[i] === '\\') i++; s += text[i++] }
        i++
        list.push(s)
      } else if (/\s/.test(c)) i++
      else {
        let s = ''
        while (i < n && !/[\s()]/.test(text[i])) s += text[i++]
        list.push(s)
      }
    }
    return list
  }
  return node()[0]
}
const kids = (l, name) => l.filter((x) => Array.isArray(x) && x[0] === name)
const kid = (l, name) => kids(l, name)[0]
const num = (v) => Number.parseFloat(v)

function outline(pcb) {
  const pts = []
  for (const kind of ['gr_line', 'gr_rect', 'gr_arc', 'gr_circle', 'gr_poly']) {
    for (const g of kids(pcb, kind)) {
      if (kid(g, 'layer')?.[1] !== 'Edge.Cuts') continue
      for (const k of ['start', 'end', 'mid', 'center']) {
        const p = kid(g, k)
        if (p) pts.push([num(p[1]), num(p[2])])
      }
      const xy = kid(g, 'pts')
      if (xy) for (const p of kids(xy, 'xy')) pts.push([num(p[1]), num(p[2])])
    }
  }
  if (!pts.length) throw new Error('no Edge.Cuts outline found')
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function footprints(pcb) {
  const parts = {}
  for (const fp of kids(pcb, 'footprint')) {
    const ref = kids(fp, 'property').find((p) => p[1] === 'Reference')?.[2]
    const at = kid(fp, 'at')
    if (!ref || !at) continue
    const x = num(at[1])
    const y = num(at[2])
    const rot = num(at[3] ?? 0) || 0
    const side = kid(fp, 'layer')?.[1] === 'B.Cu' ? 'B' : 'F'
    // Extent of the pads in board coordinates (axis-aligned), used as the marker / 2D shape.
    const a = (-rot * Math.PI) / 180
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity
    for (const pad of kids(fp, 'pad')) {
      const pa = kid(pad, 'at')
      const size = kid(pad, 'size')
      if (!pa || !size) continue
      const lx = num(pa[1]), ly = num(pa[2]), hw = num(size[1]) / 2, hh = num(size[2]) / 2
      for (const [dx, dy] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
        const px = lx + dx, py = ly + dy
        const bx = x + px * cos - py * sin
        const by = y + px * sin + py * cos
        minx = Math.min(minx, bx); maxx = Math.max(maxx, bx); miny = Math.min(miny, by); maxy = Math.max(maxy, by)
      }
    }
    if (!Number.isFinite(minx)) { minx = x - 1; maxx = x + 1; miny = y - 1; maxy = y + 1 }
    const r = (v) => Math.round(v * 100) / 100
    parts[ref] = { x: r(x), y: r(y), rot, side, box: [r(minx), r(miny), r(maxx), r(maxy)] }
  }
  return parts
}

for (const [type, file] of Object.entries(boards)) {
  const pcb = parse(fs.readFileSync(file, 'utf8'))
  const data = { outline: outline(pcb), parts: footprints(pcb) }
  fs.writeFileSync(path.join(outDir, `${type}.json`), JSON.stringify(data))
  console.log(`${type}: ${Object.keys(data.parts).length} footprints, outline ${data.outline.join(', ')}`)
}

// ---- 3D models ----
const candidates = [
  process.env.KICAD_CLI,
  'C:/Program Files/KiCad/10.0/bin/kicad-cli.exe',
  'C:/Program Files/KiCad/9.0/bin/kicad-cli.exe',
  'kicad-cli',
].filter(Boolean)
const cli = candidates.find((c) => {
  try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return true } catch { return false }
})
if (!cli) {
  console.log('kicad-cli not found: kept the existing .glb files (set KICAD_CLI to regenerate them).')
} else {
  for (const [type, file] of Object.entries(boards)) {
    const out = path.join(outDir, `${type}.glb`)
    try {
      execFileSync(cli, ['pcb', 'export', 'glb', '--subst-models', '--include-tracks', '--include-pads', '--include-zones',
        '--include-silkscreen', '--include-soldermask', '-f', '-o', out, file], { stdio: 'ignore' })
      console.log(`${type}.glb: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`)
    } catch (e) {
      console.log(`${type}: kicad-cli export failed: ${e.message}`)
    }
  }
}
