import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader'
import { decodeDamagedQr } from './qrrepair'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// Serve the WASM from our own bundle instead of a CDN (works offline on the shop floor).
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
})

// ZXing-C++ handles Data Matrix (incl. white-silkscreen-on-solder-mask, rotated, perspective) far better than zxing-js.
const options: ReaderOptions = {
  formats: ['DataMatrix', 'QRCode', 'Code128'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 1,
}

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d', { willReadFrequently: true })!

let lastRepair = 0

/** `live` = camera frame: the (slower) repair fallback then runs at most every 300 ms. */
async function decodeCanvas(live: boolean): Promise<string | null> {
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const first = await decodeImage(img)
  if (first) return first
  // Fallback: QR with missing edge rows (finder squares damaged). The repair step rebuilds them.
  if (live && Date.now() - lastRepair < 300) return null
  lastRepair = Date.now()
  return decodeDamagedQr(img, (clean) => decodeImage(clean, ['QRCode']))
}

async function decodeImage(img: ImageData, formats?: ReaderOptions['formats']): Promise<string | null> {
  const results = await readBarcodes(img, formats ? { ...options, formats } : options)
  return results.find((r) => r.isValid)?.text ?? null
}

/** Decodes one video frame (capped to ~1600 px on the long side). */
export async function decodeFrame(video: HTMLVideoElement): Promise<string | null> {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return null
  const scale = Math.min(1, 1600 / Math.max(vw, vh))
  canvas.width = Math.round(vw * scale)
  canvas.height = Math.round(vh * scale)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  return decodeCanvas(true)
}

/** Decodes an uploaded/captured photo (fallback when live scanning struggles). */
export async function decodeImageFile(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return decodeCanvas(false)
}
