import { supabase } from './supabase'
import type { Board, BoardProgress, BoardType, BomLine, Defect, LcscStock, PartAlias, Placement, Profile, StockItem } from './types'
import type { BoardCode } from './parsers'
import type { TestResult } from './bringup'
import type { LcscOrderRow } from './csv'
import { orderForBath } from './order'

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export interface TraceRow {
  designator: string
  placed_at: string
  soldered_at: string | null
  pbn: string | null
  order_no: string | null
  lcsc_code: string | null
  mpn: string | null
  stock_item_id: string | null
  boards: { serial: string; board_type: BoardType; status: string } | null
}

export const api = {
  async profile(userId: string): Promise<Profile | null> {
    return check(await supabase.from('profiles').select('id,email,role').eq('id', userId).maybeSingle())
  },
  async profiles(): Promise<Profile[]> {
    return check(await supabase.from('profiles').select('id,email,role').order('created_at'))
  },
  async setRole(id: string, role: Profile['role']) {
    check(await supabase.from('profiles').update({ role }).eq('id', id))
  },

  async bom(type?: BoardType): Promise<BomLine[]> {
    let q = supabase.from('bom_lines').select('*').order('board_type').order('step').order('sort')
    if (type) q = q.eq('board_type', type)
    return orderForBath(check<BomLine[]>(await q))
  },
  async updateBomLine(id: string, patch: Partial<Pick<BomLine, 'lcsc_code' | 'mpn' | 'scan_required' | 'washable'>>) {
    check(await supabase.from('bom_lines').update(patch).eq('id', id))
  },
  async aliases(): Promise<PartAlias[]> {
    return check(await supabase.from('part_aliases').select('lcsc_code,bom_line_id'))
  },
  async addAlias(lcsc_code: string, bom_line_id: string) {
    check(await supabase.from('part_aliases').upsert({ lcsc_code, bom_line_id }))
  },
  async removeAlias(lcsc_code: string) {
    check(await supabase.from('part_aliases').delete().eq('lcsc_code', lcsc_code))
  },

  async stock(): Promise<StockItem[]> {
    return check(await supabase.from('stock_items').select('*').order('created_at'))
  },
  async stockByCode(code: string): Promise<StockItem | null> {
    return check(await supabase.from('stock_items').select('*').eq('code', code).maybeSingle())
  },
  async addStock(item: Pick<StockItem, 'name' | 'supplier' | 'order_no' | 'by_pins' | 'qty' | 'bom_line_ids' | 'notes'>): Promise<StockItem> {
    return check(await supabase.from('stock_items').insert(item).select().single())
  },
  async updateStock(id: string, patch: Partial<Pick<StockItem, 'name' | 'supplier' | 'order_no' | 'by_pins' | 'qty' | 'bom_line_ids' | 'notes'>>) {
    check(await supabase.from('stock_items').update(patch).eq('id', id))
  },
  async deleteStock(id: string) {
    check(await supabase.from('stock_items').delete().eq('id', id))
  },
  /** stock_item_id -> number of placements that consumed it. */
  async stockUsage(): Promise<Map<string, number>> {
    const rows = check<{ stock_item_id: string; used: number }[]>(await supabase.from('stock_usage').select('stock_item_id,used'))
    return new Map(rows.map((r) => [r.stock_item_id, r.used]))
  },
  async lcscStock(): Promise<LcscStock[]> {
    return check(await supabase.from('lcsc_stock').select('*').order('lcsc_code'))
  },
  async setLcscQty(lcsc_code: string, qty: number) {
    check(await supabase.from('lcsc_stock').update({ qty }).eq('lcsc_code', lcsc_code))
  },
  /** lcsc_code -> number of placements that scanned a bag with this code. */
  async lcscUsage(): Promise<Map<string, number>> {
    const rows = check<{ lcsc_code: string; used: number }[]>(await supabase.from('lcsc_usage').select('lcsc_code,used'))
    return new Map(rows.map((r) => [r.lcsc_code, r.used]))
  },
  async stockUsed(id: string): Promise<number> {
    const row = check<{ used: number } | null>(await supabase.from('stock_usage').select('used').eq('stock_item_id', id).maybeSingle())
    return row?.used ?? 0
  },

  async boards(): Promise<BoardProgress[]> {
    return check(await supabase.from('board_progress').select('*').order('created_at', { ascending: false }).limit(200))
  },
  async boardBySerial(serial: string): Promise<Board | null> {
    return check(await supabase.from('boards').select('*').eq('serial', serial).maybeSingle())
  },
  /** Returns the existing board record or registers a new one for this scanned code. */
  async ensureBoard(code: BoardCode): Promise<{ board: Board; created: boolean }> {
    const existing = await api.boardBySerial(code.serial)
    if (existing) return { board: existing, created: false }
    const board = check<Board>(
      await supabase.from('boards').insert({ serial: code.serial, board_type: code.type, batch: code.batch, seq: code.seq }).select().single(),
    )
    return { board, created: true }
  },
  /** A signed-off board that needs rework goes back to in_progress (it must be signed off again). */
  async reopenBoard(id: string) {
    check(await supabase.from('boards').update({ status: 'in_progress', completed_by: null, completed_at: null }).eq('id', id))
  },
  async completeBoard(id: string, userId: string) {
    check(await supabase.from('boards').update({ status: 'completed', completed_by: userId, completed_at: new Date().toISOString() }).eq('id', id))
  },

  async placements(boardId: string): Promise<Placement[]> {
    return check(await supabase.from('placements').select('*').eq('board_id', boardId))
  },
  async addPlacement(p: Omit<Placement, 'id' | 'placed_at' | 'soldered_raw'>): Promise<Placement> {
    return check(await supabase.from('placements').insert(p).select().single())
  },
  async markSoldered(id: string, raw: string, userId: string): Promise<Placement> {
    return check<Placement>(
      await supabase.from('placements').update({ soldered_at: new Date().toISOString(), soldered_raw: raw, soldered_by: userId }).eq('id', id).select().single(),
    )
  },
  async removePlacement(id: string) {
    check(await supabase.from('placements').delete().eq('id', id))
  },
  /** How many placements (across all boards) used this exact reel/bag. */
  async bagUsage(pbn: string, orderNo: string | null, lcsc: string): Promise<number> {
    let q = supabase.from('placements').select('id', { count: 'exact', head: true }).eq('pbn', pbn).eq('lcsc_code', lcsc)
    q = orderNo ? q.eq('order_no', orderNo) : q.is('order_no', null)
    const { count, error } = await q
    if (error) throw new Error(error.message)
    return count ?? 0
  },
  async tests(boardId: string): Promise<TestResult[]> {
    return check(await supabase.from('board_tests').select('test_key,value,passed,note').eq('board_id', boardId))
  },
  async saveTest(boardId: string, r: TestResult, userId: string) {
    check(await supabase.from('board_tests').upsert(
      { board_id: boardId, test_key: r.test_key, value: r.value, passed: r.passed, note: r.note, tested_by: userId, tested_at: new Date().toISOString() },
      { onConflict: 'board_id,test_key' }))
  },

  /** Placements that used a bag / order / part code / stock item, with the board they went onto. */
  async trace(f: { pbn?: string; order?: string; lcsc?: string; stockId?: string }): Promise<TraceRow[]> {
    let q = supabase.from('placements')
      .select('designator,placed_at,soldered_at,pbn,order_no,lcsc_code,mpn,stock_item_id,boards(serial,board_type,status)')
      .order('placed_at', { ascending: false }).limit(500)
    if (f.pbn) q = q.eq('pbn', f.pbn)
    if (f.order) q = q.ilike('order_no', f.order + '%')
    if (f.lcsc) q = q.eq('lcsc_code', f.lcsc)
    if (f.stockId) q = q.eq('stock_item_id', f.stockId)
    return check(await q) as unknown as TraceRow[]
  },

  async importedFiles(): Promise<{ file_name: string; rows: number; imported_at: string }[]> {
    return check(await supabase.from('lcsc_imports').select('file_name,rows,imported_at'))
  },
  /** Adds (or replaces) ordered quantities for the CSV rows and remembers the file name. */
  async importLcscOrder(fileName: string, rows: LcscOrderRow[], mode: 'add' | 'replace') {
    const current = new Map((await api.lcscStock()).map((x) => [x.lcsc_code, x.qty]))
    const payload = rows.map((r) => ({
      lcsc_code: r.lcsc_code, mpn: r.mpn || null, description: r.description || null,
      qty: mode === 'add' ? (current.get(r.lcsc_code) ?? 0) + r.qty : r.qty,
    }))
    check(await supabase.from('lcsc_stock').upsert(payload, { onConflict: 'lcsc_code' }))
    check(await supabase.from('lcsc_imports').upsert({ file_name: fileName, rows: rows.length, imported_at: new Date().toISOString() }, { onConflict: 'file_name' }))
  },

  /** All placements (paged: the API returns at most 1000 rows per request). */
  async allPlacements(): Promise<Placement[]> {
    const out: Placement[] = []
    for (let from = 0; ; from += 1000) {
      const rows = check<Placement[]>(await supabase.from('placements').select('*').order('placed_at').range(from, from + 999))
      out.push(...rows)
      if (rows.length < 1000) return out
    }
  },

  async defects(boardId?: string): Promise<Defect[]> {
    let q = supabase.from('defects').select('*').order('reported_at', { ascending: false }).limit(1000)
    if (boardId) q = q.eq('board_id', boardId)
    return check(await q)
  },
  async addDefect(d: Pick<Defect, 'board_id' | 'designator' | 'kind' | 'note' | 'lcsc_code' | 'pbn' | 'order_no' | 'stock_item_id'>, userId: string): Promise<Defect> {
    return check(await supabase.from('defects').insert({ ...d, reported_by: userId }).select().single())
  },
  async fixDefect(id: string, userId: string): Promise<Defect> {
    return check(await supabase.from('defects').update({ status: 'fixed', fixed_by: userId, fixed_at: new Date().toISOString() }).eq('id', id).select().single())
  },
  /** Defects reported against a bag / LCSC code / stock item (bag data was copied at report time). */
  async defectsByBag(f: { pbn?: string; lcsc?: string; stockId?: string }): Promise<Defect[]> {
    let q = supabase.from('defects').select('*')
    if (f.pbn) q = q.eq('pbn', f.pbn)
    if (f.lcsc) q = q.eq('lcsc_code', f.lcsc)
    if (f.stockId) q = q.eq('stock_item_id', f.stockId)
    return check(await q)
  },
  async defectsForBoards(ids: string[]): Promise<Defect[]> {
    if (!ids.length) return []
    return check(await supabase.from('defects').select('*').in('board_id', ids.slice(0, 200)))
  },

  logScan(boardId: string | null, raw: string, result: 'accepted' | 'rejected', reason?: string) {
    void supabase.from('scan_events').insert({ board_id: boardId, raw, result, reason: reason ?? null })
  },
}
