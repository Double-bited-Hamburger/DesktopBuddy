import { describe, expect, it } from 'vitest'
import type { MediaSession } from '../../src/core/friends/music'
import { listeningTo, musicOf } from '../../src/core/friends/music'

const session = (over: Partial<MediaSession>): MediaSession => ({
  app: 'Spotify.exe',
  playing: true,
  title: 'A Song',
  artist: 'Some Band',
  album: 'The Album',
  ...over,
})

describe('what counts as music for Friends', () => {
  it('shares music apps', () => {
    expect(musicOf(session({}))?.song).toBe('Some Band - A Song')
    expect(musicOf(session({ app: 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App' }))?.song).toBe(
      'Some Band - A Song',
    )
    expect(
      musicOf(session({ app: 'Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic' })),
    ).toBeDefined()
    expect(musicOf(session({ app: 'Spotify.exe', artist: '' }))?.song).toBe('A Song')
  })

  it('shares music in a browser only with an artist and an album (YouTube Music, web players)', () => {
    expect(musicOf(session({ app: 'chrome' }))?.song).toBe('Some Band - A Song')
    expect(musicOf(session({ app: 'MSEdge', album: '' }))).toBeUndefined()
    expect(musicOf(session({ app: 'firefox.exe', artist: '' }))).toBeUndefined()
  })

  it('never shares a video: a plain browser video, a video app, anything unknown', () => {
    // A video page usually gives a title and a channel, but no album.
    expect(
      musicOf(session({ app: 'chrome', title: 'Some video', artist: 'A channel', album: '' })),
    ).toBeUndefined()
    expect(
      musicOf(session({ app: 'chrome', title: 'Some video', artist: '', album: '' })),
    ).toBeUndefined()
    expect(
      musicOf(session({ app: 'Microsoft.ZuneVideo_8wekyb3d8bbwe!Microsoft.ZuneVideo' })),
    ).toBeUndefined()
    expect(musicOf(session({ app: 'vlc.exe' }))).toBeUndefined()
    expect(musicOf(session({ app: '4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App' }))).toBeUndefined()
  })

  it('ignores what is paused, and untitled tracks', () => {
    expect(musicOf(session({ playing: false }))).toBeUndefined()
    expect(musicOf(session({ title: '  ' }))).toBeUndefined()
  })

  it('takes the first playing music among several sessions', () => {
    expect(
      listeningTo([
        session({ app: 'chrome', album: '', title: 'Video' }),
        session({ playing: false, title: 'Paused' }),
        session({ app: 'AppleInc.AppleMusicWin!App', title: 'Tune' }),
      ])?.song,
    ).toBe('Some Band - Tune')
    expect(listeningTo([])).toBeUndefined()
  })
})
