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
  washable: boolean
  kind: 'part' | 'process'
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
  stock_item_id: string | null
  placed_at: string
  soldered_at: string | null
  soldered_raw: string | null
  placed_by?: string | null
  soldered_by?: string | null
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

export interface LcscStock {
  lcsc_code: string
  mpn: string | null
  description: string | null
  qty: number
}

export interface StockItem {
  id: string
  code: string
  name: string
  supplier: string | null
  order_no: string | null
  qty: number
  bom_line_ids: string[]
  notes: string | null
  created_at: string
}

export const DEFECT_KINDS = {
  wrong_part: 'Wrong part',
  bad_solder: 'Bad solder joint',
  damaged: 'Damaged part',
  polarity: 'Wrong orientation / polarity',
  missing: 'Missing part',
  other: 'Other',
} as const
export type DefectKind = keyof typeof DEFECT_KINDS

export interface Defect {
  id: string
  board_id: string
  designator: string
  kind: DefectKind
  note: string | null
  status: 'open' | 'fixed'
  lcsc_code: string | null
  pbn: string | null
  order_no: string | null
  stock_item_id: string | null
  reported_by: string | null
  reported_at: string
  fixed_by: string | null
  fixed_at: string | null
}
