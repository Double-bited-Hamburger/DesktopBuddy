/**
 * The built-in relay: the project's Cloudflare Worker (relay/README.md), deployed 2026-11-12.
 * Everyone uses it unless they type their own relay under Friends › Advanced.
 */
export const DEFAULT_RELAY = 'wss://desktopbuddy-relay.darkw6403.workers.dev'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * A relay address the app will connect to, normalised (no trailing slash), or undefined:
 * `wss://` anywhere, plain `ws://` only to this PC (the local relay for development).
 */
export function relayUrl(text: string): string | undefined {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return undefined
  }
  if (url.username || url.password || url.search || url.hash) return undefined
  if (url.protocol === 'https:') url.protocol = 'wss:'
  const local = LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) return undefined
  return url.toString().replace(/\/+$/, '')
}
