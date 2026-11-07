import { supabase } from './supabase'
import type { Board, BoardProgress, BoardType, BomLine, LcscStock, PartAlias, Placement, Profile, StockItem } from './types'
import type { BoardCode } from './parsers'
import { orderForBath } from './order'

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
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
  async addStock(item: Pick<StockItem, 'name' | 'supplier' | 'qty' | 'bom_line_ids' | 'notes'>): Promise<StockItem> {
    return check(await supabase.from('stock_items').insert(item).select().single())
  },
  async updateStock(id: string, patch: Partial<Pick<StockItem, 'name' | 'supplier' | 'qty' | 'bom_line_ids' | 'notes'>>) {
    check(await supabase.from('stock_items').update(patch).eq('id', id))
  },
  async deleteStock(id: string) {
    check(await supabase.from('stock_items').delete().eq('id', id))
  },
  /** stock_item_id -> number of placements that consumed it. */
  async stockUsage(): Promise<Map<string, number>> {
    const rows = check<{ stock_item_id: string }[]>(await supabase.from('placements').select('stock_item_id').not('stock_item_id', 'is', null))
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.stock_item_id, (m.get(r.stock_item_id) ?? 0) + 1)
    return m
  },
  async lcscStock(): Promise<LcscStock[]> {
    return check(await supabase.from('lcsc_stock').select('*').order('lcsc_code'))
  },
  async setLcscQty(lcsc_code: string, qty: number) {
    check(await supabase.from('lcsc_stock').update({ qty }).eq('lcsc_code', lcsc_code))
  },
  /** lcsc_code -> number of placements that scanned a bag with this code. */
  async lcscUsage(): Promise<Map<string, number>> {
    const rows = check<{ lcsc_code: string }[]>(await supabase.from('placements').select('lcsc_code').not('lcsc_code', 'is', null))
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.lcsc_code, (m.get(r.lcsc_code) ?? 0) + 1)
    return m
  },
  async stockUsed(id: string): Promise<number> {
    const { count, error } = await supabase.from('placements').select('id', { count: 'exact', head: true }).eq('stock_item_id', id)
    if (error) throw new Error(error.message)
    return count ?? 0
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
  logScan(boardId: string | null, raw: string, result: 'accepted' | 'rejected', reason?: string) {
    void supabase.from('scan_events').insert({ board_id: boardId, raw, result, reason: reason ?? null })
  },
}
