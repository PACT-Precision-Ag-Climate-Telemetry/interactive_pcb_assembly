/** Minimal RFC-4180 CSV parser: returns one object per row keyed by the (trimmed) header names. */
export function parseCsv(text: string): Record<string, string>[] {
  text = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  const [head, ...rest] = rows
  if (!head) return []
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

export interface LcscOrderRow {
  lcsc_code: string
  mpn: string
  description: string
  qty: number
}

/** Reads an LCSC order export (columns "LCSC Part Number", "Manufacture Part Number", "Description", "Quantity"). */
export function parseLcscOrder(text: string): LcscOrderRow[] {
  const rows = parseCsv(text)
  if (!rows.length || !('LCSC Part Number' in rows[0])) throw new Error('This does not look like an LCSC order CSV (no "LCSC Part Number" column).')
  const byCode = new Map<string, LcscOrderRow>()
  for (const r of rows) {
    const code = r['LCSC Part Number']?.toUpperCase()
    if (!/^C\d+$/.test(code)) continue
    const qty = parseInt(r.Quantity, 10) || 0
    const prev = byCode.get(code)
    if (prev) prev.qty += qty
    else byCode.set(code, { lcsc_code: code, mpn: r['Manufacture Part Number'] ?? '', description: r.Description ?? '', qty })
  }
  return [...byCode.values()]
}
