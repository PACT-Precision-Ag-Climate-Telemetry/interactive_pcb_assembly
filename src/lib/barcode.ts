import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer'
import wasmUrl from 'zxing-wasm/writer/zxing_writer.wasm?url'

prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
})

/** Code 128 barcode (vector) for a stock label, as a data URL usable in <img src>. */
export async function barcodeDataUrl(text: string): Promise<string> {
  const r = await writeBarcode(text, { format: 'Code128', scale: 3, withHRT: false, withQuietZones: true })
  if (r.error || !r.svg) throw new Error(r.error || 'Could not generate barcode')
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg)
}
