export type BoardType = 'MB' | 'PW'

export const BOARD_NAMES: Record<BoardType, string> = {
  MB: 'Mainboard',
  PW: 'Power management',
}

export interface BomLine {
  id: string
  board_type: BoardType
  step: number
  stage: string
  designators: string[]
  value: string | null
  footprint: string | null
  manufacturer: string | null
  mpn: string | null
  lcsc_code: string | null
  orientation: string | null
  notes: string | null
  scan_required: boolean
  sort: number
}

export interface Board {
  id: string
  serial: string
  board_type: BoardType
  batch: string
  seq: string
  status: 'in_progress' | 'completed'
  created_at: string
  completed_at: string | null
}

export interface BoardProgress extends Board {
  placed: number
  total: number
}

export interface Placement {
  id: string
  board_id: string
  designator: string
  bom_line_id: string
  scan_raw: string | null
  pbn: string | null
  order_no: string | null
  lcsc_code: string | null
  mpn: string | null
  pack_qty: number | null
  placed_at: string
  soldered_at: string | null
  soldered_raw: string | null
}

export interface PartAlias {
  lcsc_code: string
  bom_line_id: string
}

export interface Profile {
  id: string
  email: string | null
  role: 'operator' | 'admin'
}
