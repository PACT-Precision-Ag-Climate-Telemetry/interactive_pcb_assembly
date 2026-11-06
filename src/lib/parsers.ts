import type { BoardType, BomLine, PartAlias } from './types'

export interface LcscLabel {
  pbn: string | null // picking batch number
  on: string | null // order number
  pc: string | null // LCSC part code, e.g. C3204125
  pm: string | null // manufacturer part number
  qty: number | null
  raw: string
}

/**
 * Parses an LCSC packaging QR, e.g.
 * {pbn:PICK2610300010,on:WM2610300148001,pc:C3204125,pm:0031.8201,qty:10,mc:,cc:1,pdi:245670815,hp:null,wc:ZH}
 */
export function parseLcsc(raw: string): LcscLabel | null {
  const text = raw.trim()
  const m = /^\{(.*)\}$/s.exec(text)
  if (!m) return null
  const fields: Record<string, string> = {}
  for (const part of m[1].split(',')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    fields[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim()
  }
  const clean = (v: string | undefined) => (v && v.toLowerCase() !== 'null' ? v : null)
  const pc = clean(fields.pc)
  const pm = clean(fields.pm)
  if (!pc || !/^C\d+$/i.test(pc)) return null
  const qty = Number.parseInt(fields.qty ?? '', 10)
  return {
    pbn: clean(fields.pbn),
    on: clean(fields.on),
    pc: pc.toUpperCase(),
    pm,
    qty: Number.isFinite(qty) ? qty : null,
    raw: text,
  }
}

export interface BoardCode {
  serial: string
  type: BoardType
  batch: string
  seq: string
}

/**
 * PACT_MB_<batch>_<seq> (mainboard) or PACT_PW_<batch>_<seq> (power management).
 * Batch ids can be alphanumeric (real example: PACT_PW_7m1z1_0001); case is preserved.
 */
export function parseBoardCode(raw: string): BoardCode | null {
  // Tolerate stray characters from scanners (prefixes, GS/CR/LF, spaces) around the code.
  const m = /PACT_(MB|PW)_([A-Za-z0-9]+)_([A-Za-z0-9]+)/i.exec(raw)
  if (!m) return null
  const type = m[1].toUpperCase() as BoardType
  return { serial: `PACT_${type}_${m[2]}_${m[3]}`, type, batch: m[2], seq: m[3] }
}

export const boardCodeHint = (type: BoardType) =>
  type === 'MB' ? 'PACT_MB_<batch>_<seq>' : 'PACT_PW_<batch>_<seq>'

const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[\s_]+/g, '')

/** Does the scanned LCSC label belong to this BOM line? */
export function labelMatchesLine(label: LcscLabel, line: BomLine, aliases: PartAlias[]): boolean {
  if (label.pc && line.lcsc_code && label.pc === line.lcsc_code.toUpperCase()) return true
  if (label.pm && line.mpn && norm(label.pm) === norm(line.mpn)) return true
  return aliases.some((a) => a.bom_line_id === line.id && label.pc === a.lcsc_code.toUpperCase())
}
