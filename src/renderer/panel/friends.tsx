import { useEffect, useState } from 'preact/hooks'
import type { FriendsAction } from '../../core/friends/actions'
import { MESSAGE_MAX } from '../../core/friends/payload'
import type { Translator } from '../../core/i18n/i18n'
import type { FriendsView, FriendView } from '../../shared/ipc'
import { DuckPreview } from './widgets'

const SHARE = ['look', 'presence', 'focus', 'music', 'song', 'messages'] as const

/** One line about a friend: at the PC / away / offline, focusing, listening. */
function statusLine(t: Translator, friend: FriendView): string {
  const parts = [t(`friends.presence.${friend.presence}`)]
  if (friend.focusing) parts.push(t('friends.focusing'))
  if (friend.music)
    parts.push(friend.music.song ? `♪ ${friend.music.song}` : t('friends.listening'))
  return parts.join(' · ')
}

function FriendRow({
  t,
  friend,
  busy,
  act,
}: {
  t: Translator
  friend: FriendView
  busy: boolean
  act: (action: FriendsAction) => void
}) {
  const last = friend.lastMessage
  return (
    <li class={`card friend-row${friend.presence === 'offline' ? ' offline' : ''}`}>
      {friend.look ? (
        <DuckPreview loadout={friend.look} class="small" />
      ) : (
        <span class="friend-blank">?</span>
      )}
      <div class="grow">
        <strong>{friend.name || t('friends.someone')}</strong>
        <span class="muted">{statusLine(t, friend)}</span>
        {last && (
          <span class="friend-last">{last.wave ? t('friends.waved') : `“${last.text ?? ''}”`}</span>
        )}
      </div>
      <div class="friend-actions">
        {friend.look && (
          <button
            type="button"
            disabled={busy}
            aria-pressed={friend.visiting}
            onClick={() => act({ do: 'visit', member: friend.visiting ? null : friend.member })}
          >
            {friend.visiting ? t('friends.sendHome') : t('friends.visit')}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          aria-pressed={friend.muted}
          onClick={() => act({ do: 'mute', member: friend.member, on: !friend.muted })}
        >
          {friend.muted ? t('friends.unmute') : t('friends.mute')}
        </button>
      </div>
    </li>
  )
}

/**
 * Friends (docs/FRIENDS.md): turn it on, make or join a group with an invite code, see your
 * friends' ducks live, wave and write, and choose exactly what you share.
 */
export function Friends({ t }: { t: Translator }) {
  const [view, setView] = useState<FriendsView | undefined>()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | undefined>()
  const [code, setCode] = useState('')
  const [relay, setRelay] = useState<string | undefined>()
  const [text, setText] = useState('')
  const [leaving, setLeaving] = useState(false)
  /** The relay field is for people who run their own; it hides under "Advanced". */
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    window.buddy.panel.friends.view().then(setView, (error) => {
      console.error('Friends failed', error)
      setNote(t('panel.failed'))
    })
    return window.buddy.panel.friends.onChange(setView)
  }, [t])

  const act = (action: FriendsAction, then?: () => void) => {
    setBusy(true)
    setNote(undefined)
    window.buddy.panel.friends
      .do(action)
      .then((result) => {
        setView(result.view)
        if (result.ok) then?.()
        else setNote(t(`friends.error.${result.reason}`))
      })
      .catch((error) => {
        console.error('Friends action failed', error)
        setNote(t('panel.failed'))
      })
      .finally(() => setBusy(false))
  }

  if (!view) return <section class="friends">{note && <p class="muted warn">{note}</p>}</section>

  const relayShown = relay ?? view.relay
  const needsRelay = !view.defaultRelay && !view.relay

  return (
    <section class="friends">
      {note && (
        <p class="muted warn" role="alert">
          {note}
        </p>
      )}

      <label class="card row">
        <span class="grow">
          <strong>{t('friends.on')}</strong>
          <span class="muted">{t('friends.onHint')}</span>
        </span>
        <input
          type="checkbox"
          checked={view.enabled}
          disabled={busy}
          onChange={(e) => act({ do: 'enable', on: e.currentTarget.checked })}
        />
      </label>

      {view.enabled && (
        <>
          <p class={`friends-state ${view.connection}`}>{t(`friends.state.${view.connection}`)}</p>

          {!needsRelay && (
            <button
              type="button"
              class="link-button"
              aria-expanded={advanced || Boolean(view.relay)}
              onClick={() => setAdvanced(!advanced)}
            >
              {t('friends.advanced')}
            </button>
          )}
          {(needsRelay || advanced || view.relay) && (
            <form
              class="card friends-form"
              onSubmit={(e) => {
                e.preventDefault()
                act({ do: 'relay', url: relayShown }, () => setRelay(undefined))
              }}
            >
              <label class="grow">
                <span>{t('friends.relay')}</span>
                <input
                  type="url"
                  placeholder={view.defaultRelay || 'wss://…'}
                  value={relayShown}
                  maxLength={200}
                  onInput={(e) => setRelay(e.currentTarget.value)}
                />
                <span class="muted">{t('friends.relayHint')}</span>
              </label>
              <button type="submit" disabled={busy || relay === undefined}>
                {t('friends.save')}
              </button>
            </form>
          )}

          {view.invite ? (
            <div class="card friends-invite">
              <div class="grow">
                <strong>{t('friends.yourCode')}</strong>
                <code class="invite-code">{view.invite}</code>
                <span class="muted">{t('friends.codeHint', { n: view.maxMembers })}</span>
              </div>
              <div class="friend-actions">
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(view.invite).then(
                      () => setNote(t('friends.copied')),
                      () => setNote(t('panel.failed')),
                    )
                  }
                >
                  {t('friends.copy')}
                </button>
                <button
                  type="button"
                  class={leaving ? 'armed' : undefined}
                  disabled={busy}
                  onClick={() => {
                    if (!leaving) {
                      setLeaving(true)
                      setTimeout(() => setLeaving(false), 4000)
                      return
                    }
                    setLeaving(false)
                    act({ do: 'leave' })
                  }}
                >
                  {leaving ? t('friends.leaveSure') : t('friends.leave')}
                </button>
              </div>
            </div>
          ) : (
            <div class="card friends-form">
              <div class="grow">
                <button type="button" disabled={busy} onClick={() => act({ do: 'create' })}>
                  {t('friends.create')}
                </button>
                <span class="muted">{t('friends.or')}</span>
                <form
                  class="row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    act({ do: 'join', code }, () => setCode(''))
                  }}
                >
                  <input
                    type="text"
                    placeholder="DUCK-…"
                    value={code}
                    maxLength={120}
                    aria-label={t('friends.paste')}
                    onInput={(e) => setCode(e.currentTarget.value)}
                  />
                  <button type="submit" disabled={busy || !code.trim()}>
                    {t('friends.join')}
                  </button>
                </form>
              </div>
            </div>
          )}

          {view.invite && (
            <>
              <h3 class="store-head">{t('friends.list')}</h3>
              {view.friends.length === 0 && <p class="muted note">{t('friends.empty')}</p>}
              <ul class="journey-list">
                {view.friends.map((friend) => (
                  <FriendRow key={friend.member} t={t} friend={friend} busy={busy} act={act} />
                ))}
              </ul>
              {view.friends.length > 0 && (
                <form
                  class="card friends-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    act({ do: 'send', text }, () => setText(''))
                  }}
                >
                  <input
                    class="grow"
                    type="text"
                    value={text}
                    maxLength={MESSAGE_MAX}
                    placeholder={t('friends.messagePlaceholder')}
                    aria-label={t('friends.message')}
                    onInput={(e) => setText(e.currentTarget.value)}
                  />
                  <button type="submit" disabled={busy || !text.trim()}>
                    {t('friends.send')}
                  </button>
                  <button type="button" disabled={busy} onClick={() => act({ do: 'wave' })}>
                    {t('friends.wave')}
                  </button>
                </form>
              )}
            </>
          )}

          <h3 class="store-head">{t('friends.share')}</h3>
          {view.seen && (
            <p class="muted note friends-seen">
              {t('friends.seen')}{' '}
              {[
                view.seen.presence && t(`friends.presence.${view.seen.presence}`),
                view.seen.focusing && t('friends.focusing'),
                view.seen.music &&
                  (view.seen.music.song ? `♪ ${view.seen.music.song}` : t('friends.listening')),
              ]
                .filter(Boolean)
                .join(' · ') || t('friends.seenNothing')}
            </p>
          )}
          <div class="card share-list">
            {SHARE.map((key) => (
              <label key={key} class="row">
                <span>{t(`friends.share.${key}`)}</span>
                <input
                  type="checkbox"
                  checked={view.share[key]}
                  disabled={busy || (key === 'song' && !view.share.music)}
                  onChange={(e) => act({ do: 'share', share: { [key]: e.currentTarget.checked } })}
                />
              </label>
            ))}
          </div>
        </>
      )}
      <p class="muted note">{t('friends.privacy')}</p>
    </section>
  )
}
