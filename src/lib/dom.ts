type Child = Node | string | number | null | undefined | false | Child[]
type Props = Record<string, unknown>

/** Tiny hyperscript helper: h('div', { class: 'x', onclick: fn }, child, ...) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else if (k === 'class') el.className = String(v)
    else if (k in el && k !== 'list') (el as unknown as Props)[k] = v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of (children as unknown[]).flat(Infinity) as Child[]) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c))
  return el
}

export const clear = (el: Element) => el.replaceChildren()

let audio: AudioContext | undefined
export function beep(ok: boolean) {
  try {
    audio ??= new AudioContext()
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.frequency.value = ok ? 880 : 220
    g.gain.value = 0.08
    o.connect(g).connect(audio.destination)
    o.start()
    o.stop(audio.currentTime + (ok ? 0.1 : 0.35))
  } catch { /* audio unavailable */ }
  if (!ok) navigator.vibrate?.(200)
}
