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

/** QR code (vector) as a data URL. Low error correction keeps the modules big enough for a 11 mm label. */
export async function qrDataUrl(text: string): Promise<string> {
  const r = await writeBarcode(text, { format: 'QRCode', ecLevel: 'L', scale: 1, withHRT: false, withQuietZones: false })
  if (r.error || !r.svg) throw new Error(r.error || 'Could not generate QR code')
  // zxing's SVG has only width/height; add a viewBox so it scales to the CSS size
  const svg = r.svg.replace(/<svg width="(\d+)" height="(\d+)"/, '<svg viewBox="0 0 $1 $2" preserveAspectRatio="xMidYMid meet" width="$1" height="$2"')
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
