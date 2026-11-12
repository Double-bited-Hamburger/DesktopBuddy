# DesktopBuddy Friends relay

The tiny server that lets friends' ducks see each other (see `docs/FRIENDS.md`). It only passes
encrypted boxes along. It can't read names, outfits, statuses or messages, and it keeps nothing
except each member's last encrypted status.

## Put it on Cloudflare (free)

1. Make a free account at <https://dash.cloudflare.com/sign-up>.
2. In this folder's project root run:

   ```bash
   npm run relay:deploy
   ```

   The first time, `wrangler` opens the browser to log in to Cloudflare. It then prints the
   address, like `https://desktopbuddy-relay.<your-name>.workers.dev`.
3. In the app: Friends › "Relay address" › paste it with `wss://` instead of `https://`, and Save.
   To make it the built-in default for everyone, put it in `DEFAULT_RELAY` in
   `src/main/relay-url.ts` before building the release.

The free plan is plenty for groups of friends: rooms sleep between messages (WebSocket
hibernation), statuses are only sent when something changes, and the keep-alive "ping" is
answered without waking the room.

## Run it on your own PC

```bash
npm run relay:dev
```

It listens on `ws://127.0.0.1:8787` (this PC only). `RELAY_HOST=0.0.0.0` and `RELAY_PORT` change
that, for example to share it on your home network. The app accepts plain `ws://` only for
`localhost`/`127.0.0.1`; anything else must be `wss://`.

## Files

- `room-core.ts`: the whole room logic (tested in `tests/relay`).
- `worker.ts` + `wrangler.toml`: the Cloudflare Worker and its Durable Object.
- `local.ts`: the same rooms in plain Node, no dependencies.
