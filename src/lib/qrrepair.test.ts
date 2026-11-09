import { describe, expect, it } from 'vitest'
import { readBarcodes, writeBarcode } from 'zxing-wasm/full'
import { decodeDamagedQr } from './qrrepair'

const TEXT = '{pbn:PICK2610300010,on:WM2610300148001,pc:C3204125,pm:0031.8201,qty:10,mc:,cc:1,pdi:245670815,hp:null,wc:ZH}'
const decode = async (img: ImageData) => (await readBarcodes(img, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 })).find((r) => r.isValid)?.text ?? null

interface Opt { top?: number; bottom?: number; left?: number; right?: number; deg?: number; invert?: boolean; S?: number; noise?: number; ec?: 'L' | 'M' | 'Q' }

/** Renders the QR with module rows/columns removed from the sides, rotated by `deg`, optionally light-on-dark / noisy. */
async function render(o: Opt = {}): Promise<ImageData> {
  const w = await writeBarcode(TEXT, { format: 'QRCode', ecLevel: o.ec ?? 'M', scale: 1, withQuietZones: false })
  const { data, width: M } = w.symbol
  const S = o.S ?? 6
  const side = Math.ceil(M * S * 1.5) + 40
  const a = ((o.deg ?? 0) * Math.PI) / 180
  const cos = Math.cos(a), sin = Math.sin(a)
  const d = new Uint8ClampedArray(side * side * 4)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let py = 0; py < side; py++) for (let px = 0; px < side; px++) {
    const dx = px - side / 2, dy = py - side / 2
    const mx = (dx * cos + dy * sin) / S + M / 2, my = (-dx * sin + dy * cos) / S + M / 2
    const x = Math.floor(mx), y = Math.floor(my)
    const inside = x >= (o.left ?? 0) && x < M - (o.right ?? 0) && y >= (o.top ?? 0) && y < M - (o.bottom ?? 0)
    let dark = inside && data[y * M + x] < 128
    if (o.invert) dark = inside ? !dark : false
    let v = dark ? 20 : 235
    if (o.invert && !inside) v = 20
    v += o.noise ? (rnd() - 0.5) * o.noise : 0
    const p = (py * side + px) * 4
    d[p] = d[p + 1] = d[p + 2] = Math.max(0, Math.min(255, v)); d[p + 3] = 255
  }
  return { data: d, width: side, height: side, colorSpace: 'srgb' } as ImageData
}

const ok = async (o: Opt) => expect(await decodeDamagedQr(await render(o), decode)).toBe(TEXT)

describe('decodeDamagedQr', () => {
  it('a plain decoder fails when the top row is missing', async () => {
    expect(await decode(await render({ top: 1 }))).toBeNull()
  })
  for (const n of [1, 2, 3, 4]) it(`top ${n} row(s) missing`, () => ok({ top: n }))
  for (const n of [1, 2]) it(`bottom ${n} row(s) missing`, () => ok({ bottom: n }))
  for (const n of [1, 2, 3]) it(`left ${n} column(s) missing`, () => ok({ left: n }))
  for (const n of [1, 2, 3]) it(`right ${n} column(s) missing`, () => ok({ right: n }))
  for (const deg of [90, 180, 270]) it(`top row missing, rotated ${deg}°`, () => ok({ top: 2, deg }))
  for (const deg of [-12, 8, 20]) it(`top row missing, tilted ${deg}°`, () => ok({ top: 2, deg }))
  it('top row missing, tilted and upside down', () => ok({ top: 2, deg: 195 }))
  it('top and left edges both missing', () => ok({ top: 1, left: 1 }))
  it('light-on-dark code with top row missing', () => ok({ top: 2, invert: true }))
  it('noisy image', () => ok({ top: 2, noise: 60 }))
  it('small code (4 px modules)', () => ok({ top: 2, S: 4 }))
  it('returns null for an unrelated image', async () => {
    const img = await render({ top: 0 })
    img.data.fill(255)
    expect(await decodeDamagedQr(img, decode)).toBeNull()
  })
})
