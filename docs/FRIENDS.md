# Friends (1.0.0, Stage 8): design and security review

Status: **built and deployed 2026-11-12**. The built-in relay is
`wss://desktopbuddy-relay.darkw6403.workers.dev` (the owner's free Cloudflare account).

## What it does

Your friends' ducks, live on your PC. For each friend you see:

- their duck's name and outfit
- **at the PC**, **away** (idle or locked), **offline** (app closed or Friends off)
- **focusing** (a focus session or Pomodoro is running)
- **listening to music**: earphones on their duck, and, only if they switch it on, a small bubble
  with the song ("♪ Artist – Song")

A friend's duck can **visit your taskbar** as a mini (the mini-friend window, wearing their
outfit, with earphones when they listen). You can send a **wave** and short **messages**, shown as
a bubble over their duck. Your own duck also wears earphones while you listen (local only).

No points or items are ever sent, so nothing can be traded, farmed or lost through Friends.

## The server: a Cloudflare Worker (free)

- `relay/` holds a tiny **Cloudflare Worker with one Durable Object per friend group** ("room").
  The Worker only forwards: a duck connects with a WebSocket, sends a sealed (encrypted) update,
  and the room passes it on to the others in the room. It keeps nothing on disk except, for each
  member, their last sealed status (so a friend who connects later sees you straight away).
- WebSocket hibernation keeps it inside the **free plan** for groups of friends (the room sleeps
  between messages; updates go out only when something changes, plus a heartbeat every few
  minutes).
- **The owner deploys it once:** create a free Cloudflare account, then `npm run relay:deploy`
  (wrangler). Claude prepares everything but cannot create the account. The address goes into
  the app as the default relay; Settings can change it, so anyone can run their own copy
  (`npm run relay:dev` runs the same code on the local PC, used for the tests too).

## Pairing: invite codes

- "Make an invite" in the Friends screen gives a code like `DUCK-7K3P-Q9MX-2HWA-…`. It holds a
  random room id and a random 256-bit secret. Send it to your friends however you like.
- Pasting the code joins the room. A room holds at most 8 ducks. "Leave" and "Remove friend" are
  one click; making a new invite makes a new room (old code stops working for new people).

## Encryption and privacy

- Every update is encrypted on your PC with **AES-256-GCM**, using a key derived from the invite
  secret (HKDF). The relay sees only the room id, a random member id and scrambled bytes. It
  never sees names, outfits, statuses or messages. Cloudflare, like any host, can see IP
  addresses and when messages flow.
- **Off by default.** No network at all until the user turns Friends on and joins a room.
- What can be sent, each with its own switch: name + outfit, at the PC / away, focusing,
  listening (yes/no), **song title (off by default)**, messages.
- Never sent: app or process names, window titles (other than the song from the music app, only
  with that switch on), points, items, tracking data, Today/Stats.
- Messages: at most 80 characters, from invited friends only. Mute or remove a friend in one
  click. No message history is kept on disk.
- All network code lives in the main process; renderers only get validated views over IPC.
  Every message from the relay is size-limited and checked with zod after decryption; anything
  invalid is dropped.

## Music detection (Windows)

- Read from **Windows' own "now playing" list** (the media box by the volume flyout) through
  WinRT with koffi (`src/main/now-playing.ts`): no extra process, about 50 ms, every 30 s, only
  while Friends is connected and "listening" is shared. App id, title, artist, album and
  playing/paused are read; nothing is stored.
- **Only music, never videos** (`src/core/friends/music.ts`, tested): music apps (Spotify,
  Apple Music, iTunes, Windows Media Player, Amazon Music, Deezer, TIDAL, foobar2000, MusicBee,
  AIMP, Winamp) count. A browser counts only for a track with an artist **and** an album, which
  music sites (YouTube Music, web players) give and ordinary videos do not. Any other app
  (video players, streaming apps) never counts. Something that is not music is not shared at
  all, not even as "listening".
- Limit: a site could fill in an album for a video itself; the song title switch stays off by
  default, and the Friends screen shows exactly what friends see right now.

## Cost on the PC

- One WebSocket while Friends is on. Updates only on change. The visiting duck is one mini window
  (about 30 MB, like a mini friend). Budget: idle CPU stays under 1%.

## Build order

1. `relay/` Worker + Durable Object, with tests run locally (Miniflare / wrangler dev).
2. `src/core/friends/`: invite codes, the message schema, sealing and opening (pure, tested).
3. `src/main/friends.ts`: the connection, reconnects with back-off, status from tracker, focus
   and music; Settings switches.
4. Panel: Friends screen (invite, join, list with live status, wave, message, leave).
5. The visiting duck (mini window) with earphones and the song bubble.
6. Two dev apps on two data folders against a local relay: end-to-end check.

## Verified, and not

- Tests: room logic, the local relay over real WebSockets, invite codes, payload checks,
  encryption (wrong room and tampered boxes refused), and two Friends services talking
  through the local relay (statuses, song switch, messages, mute, leave, nothing shared when
  switched off).
- Two dev apps on two throwaway folders through `npm run relay:dev`: they found each other,
  the visitor window opened on one with the other's duck, and a message showed over it.
- The deployed Worker, from this PC with two raw clients: hello, online, status passed on, the
  saved status for a latecomer, ping answered with pong, a bad frame dropped, gone on close.
- **Not verified:** music detection with a real
  music app or YouTube Music playing, earphones on the visitor, reconnecting after sleep or a network drop, two different
  PCs, the visitor on a second screen, CPU/RAM with Friends on.

## Still to do

- Nothing for the relay. To update it later: `npm run relay:deploy` (needs the owner's
  Cloudflare login on that PC).
