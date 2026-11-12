/**
 * Which media counts as "listening to music" for Friends (docs/FRIENDS.md). Strict on purpose:
 * a video must never show up, whatever site or app it plays in.
 *
 * - **Music apps** (Spotify, Apple Music, iTunes, Windows Media Player, Amazon Music, Deezer,
 *   TIDAL, foobar2000, MusicBee, AIMP, Winamp): what plays is music.
 * - **Browsers:** only a track that names an artist **and** an album. Music sites (YouTube Music,
 *   Spotify or Apple Music on the web, SoundCloud and others that fill in the album) do that;
 *   ordinary videos (YouTube, any other site) don't, so they never count, not even as
 *   "listening" without a title.
 * - **Anything else** (video players, streaming apps, games): never.
 */

/** One entry of the OS's "now playing" list (main/now-playing.ts). */
export interface MediaSession {
  /** The app's id: "Spotify.exe", "AppleInc.AppleMusicWin_…!App", "chrome", "MSEdge"… */
  readonly app: string
  readonly playing: boolean
  readonly title: string
  readonly artist: string
  readonly album: string
}

export interface Listening {
  /** "Artist - Title" (the song switch decides whether it is sent). */
  readonly song: string
}

/** Lowercase fragments of music apps' ids. */
const MUSIC_APPS = [
  'spotify',
  'applemusic',
  'itunes',
  'zunemusic', // Windows Media Player / Groove
  'amazonmusic',
  'amazon music',
  'deezer',
  'tidal',
  'foobar2000',
  'musicbee',
  'aimp',
  'winamp',
]

const BROWSERS = ['chrome', 'msedge', 'firefox', 'opera', 'brave', 'vivaldi', 'arc', 'helium']

const has = (app: string, list: readonly string[]) => {
  const id = app.toLowerCase()
  return list.some((name) => id.includes(name))
}

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()

/** What a single session shares, or undefined (not music, or not playing). */
export function musicOf(session: MediaSession): Listening | undefined {
  if (!session.playing) return undefined
  const title = clean(session.title)
  const artist = clean(session.artist)
  const album = clean(session.album)
  if (!title) return undefined
  if (has(session.app, MUSIC_APPS)) return { song: artist ? `${artist} - ${title}` : title }
  if (has(session.app, BROWSERS) && artist && album) return { song: `${artist} - ${title}` }
  return undefined
}

/** The first session that is music and playing, if any. */
export function listeningTo(sessions: readonly MediaSession[]): Listening | undefined {
  for (const session of sessions) {
    const music = musicOf(session)
    if (music) return music
  }
  return undefined
}
