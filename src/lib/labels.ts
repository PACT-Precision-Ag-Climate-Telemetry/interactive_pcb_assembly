/**
 * Die-cut label sheet (Chang / "ตราช้าง" All-Purpose A5, 38 x 13 mm): 4 columns x 14 rows, 56 labels.
 * Measured from the Word template: page 165 x 224 mm, labels 38 x 13 mm, 3 mm gaps, margins 2 mm / 1.5 mm.
 */
export const SHEET = { cols: 4, rows: 14, pageW: 165, pageH: 224, w: 38, h: 13, gapX: 3, gapY: 3, left: 2, top: 1.5 }
export const SHEET_CELLS = SHEET.cols * SHEET.rows

/** Cell index 0..55 -> row-major position (row 0 = top). */
export const cellPos = (i: number) => ({ col: i % SHEET.cols, row: Math.floor(i / SHEET.cols) })

/** QR payload: stock code first (the scanner recognises PACT_STK_), then seller and order number. */
export function labelPayload(code: string, supplier: string | null, orderNo: string | null): string {
  const clean = (s: string | null) => (s ?? '').replace(/\|/g, '/').trim()
  return [code, clean(supplier), clean(orderNo)].join('|')
}

/** Cells to print on: the picked ones, or, when one cell is picked and several copies wanted, the next free cells from it. */
export function targetCells(selected: number[], copies: number, used: Set<number>): number[] {
  const picked = [...new Set(selected)].sort((a, b) => a - b)
  if (picked.length !== 1 || copies <= 1) return picked
  const out: number[] = []
  for (let i = picked[0]; i < SHEET_CELLS && out.length < copies; i++) if (!used.has(i) || i === picked[0]) out.push(i)
  return out
}
