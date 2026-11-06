import { decodeFrame, decodeImageFile } from './decoder'
import { h } from './dom'

export interface ScanPanel {
  el: HTMLElement
  focus(): void
  destroy(): void
}

/**
 * Scan input with two sources:
 *  - USB / Bluetooth scanner (keyboard wedge) or manual typing into the text box (Enter submits)
 *  - device camera, decoding QR codes and Data Matrix
 */
export function scanPanel(onScan: (raw: string) => void, label: string): ScanPanel {
  let controls: { stop(): void } | undefined
  let lastText = ''
  let lastAt = 0

  const emit = (text: string) => {
    const now = Date.now()
    if (text === lastText && now - lastAt < 2500) return // same code still in front of the camera
    lastText = text
    lastAt = now
    onScan(text)
  }

  const input = h('input', {
    type: 'text', class: 'scan-input', placeholder: label, autocomplete: 'off', spellcheck: false, autofocus: true,
    onkeydown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      const v = input.value.trim()
      input.value = ''
      if (v) onScan(v)
    },
  })
  const video = h('video', { class: 'cam', muted: true, playsInline: true })
  const camWrap = h('div', { class: 'cam-wrap', hidden: true }, video, h('div', { class: 'cam-aim' }))
  const camError = h('div', { class: 'error', hidden: true })

  const stopCamera = () => {
    controls?.stop()
    controls = undefined
    camWrap.hidden = true
    camBtn.textContent = 'Use camera'
  }
  const startCamera = async () => {
    camError.hidden = true
    camWrap.hidden = false
    camBtn.textContent = 'Stop camera'
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      video.srcObject = stream
      await video.play()
      const track = stream.getVideoTracks()[0]
      // Continuous autofocus helps with small codes (ignored where unsupported).
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {})
      let alive = true
      let busy = false
      const timer = setInterval(async () => {
        if (!alive || busy) return
        busy = true
        try {
          const text = await decodeFrame(video)
          if (text && alive) emit(text)
        } catch { /* keep scanning */ } finally {
          busy = false
        }
      }, 100)
      controls = { stop() { alive = false; clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); video.srcObject = null } }
    } catch (e) {
      stopCamera()
      camError.hidden = false
      camError.textContent = `Camera unavailable: ${e instanceof Error ? e.message : e}. Use a USB scanner or type the code instead.`
    }
  }
  const photo = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: async () => {
    const f = photo.files?.[0]
    photo.value = ''
    if (!f) return
    const text = await decodeImageFile(f).catch(() => null)
    if (text) onScan(text)
    else { camError.hidden = false; camError.textContent = 'No QR / Data Matrix found in that photo. Move closer, avoid glare, keep the code flat.' }
  } })
  const photoBtn = h('button', { type: 'button', class: 'btn', onclick: () => photo.click() }, 'Photo')
  const camBtn = h('button', { type: 'button', class: 'btn', onclick: () => (controls ? stopCamera() : void startCamera()) }, 'Use camera')

  const el = h('div', { class: 'scan-panel' },
    h('div', { class: 'scan-row' }, input, camBtn, photoBtn, photo),
    h('div', { class: 'muted small' }, 'USB scanner: just scan, the box is always focused. Or type a code and press Enter.'),
    camError, camWrap)
  return { el, focus: () => input.focus(), destroy: stopCamera }
}
