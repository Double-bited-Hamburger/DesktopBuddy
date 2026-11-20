/**
 * App-aware cozy props (opt-in, Windows, needs activity tracking): only the lowercase process
 * name of the app in front is looked at, never a window title. Coding apps get the tiny laptop,
 * film and music players the popcorn.
 */
export type AppContextKind = 'coding' | 'media' | 'none'

const CODING: ReadonlySet<string> = new Set([
  'code.exe',
  'cursor.exe',
  'windsurf.exe',
  'idea64.exe',
  'webstorm64.exe',
  'pycharm64.exe',
  'devenv.exe',
  'nvim.exe',
  'windowsterminal.exe',
  'wt.exe',
  'powershell.exe',
  'pwsh.exe',
  'alacritty.exe',
  'wezterm-gui.exe',
])

const MEDIA: ReadonlySet<string> = new Set([
  'vlc.exe',
  'mpv.exe',
  'spotify.exe',
  'netflix.exe',
  'plex.exe',
])

export function classifyProcess(processName: string | null): AppContextKind {
  if (processName === null) return 'none'
  const name = processName.trim().toLowerCase()
  if (CODING.has(name)) return 'coding'
  if (MEDIA.has(name)) return 'media'
  return 'none'
}
