// The duck's speech bubble (see src/main/bubble-window.ts): drawn once from the URL hash, no
// timers. Main closes the window when its time is up. Text only: never parsed as HTML.
interface BubbleHash {
  text: string
  name: string
  /** Where the tail points, in px from the left edge. */
  tail: number
}

function readHash(): BubbleHash | undefined {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(location.hash.slice(1)))
    if (typeof value !== 'object' || value === null) return undefined
    const { text, name, tail } = value as Record<string, unknown>
    if (typeof text !== 'string' || typeof name !== 'string' || typeof tail !== 'number')
      return undefined
    return { text: text.slice(0, 200), name: name.slice(0, 40), tail }
  } catch {
    return undefined
  }
}

const said = readHash()
if (said) {
  const text = document.getElementById('text')
  if (text) text.textContent = said.text
  const name = document.getElementById('name')
  if (name && said.name) {
    name.textContent = said.name
    name.hidden = false
  }
  const tail = document.getElementById('tail')
  if (tail) tail.style.left = `${Math.max(4, Math.min(window.innerWidth - 16, said.tail - 6))}px`
  document.querySelector('main')?.removeAttribute('hidden')
}
