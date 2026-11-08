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

/**
 * Cells for `count` labels. Two or more picked cells: exactly those (in order). One picked cell: that cell and the next free ones.
 * Nothing picked: the first free cells on the sheet.
 */
export function targetCells(selected: number[], count: number, used: Set<number>): number[] {
  const picked = [...new Set(selected)].sort((a, b) => a - b)
  if (picked.length >= 2) return picked
  const start = picked.length === 1 ? picked[0] : 0
  const out: number[] = []
  for (let i = start; i < SHEET_CELLS && out.length < count; i++) if (!used.has(i) || i === picked[0]) out.push(i)
  return out
}
