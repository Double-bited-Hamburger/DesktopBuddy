import { useEffect, useState } from 'preact/hooks'
import type { AchievementStat } from '../../core/economy/achievements'
import { QUEST_EVENTS } from '../../core/economy/quests'
import type { Reward } from '../../core/economy/rewards'
import { isTrick } from '../../core/economy/rewards'
import type { Translator } from '../../core/i18n/i18n'
import type { ClaimResult, HatchResult, ProgressionView, RewardKind } from '../../shared/ipc'
import { SpriteIcon } from './widgets'

/** A 12×12 Journey icon (level, trophy, stamp, egg, album), drawn 2×. */
function Icon({ name }: { name: string }) {
  return <SpriteIcon sprite="ui/journey-icons" frame={name} size={24} />
}

const QUEST_STATS: ReadonlySet<string> = new Set(QUEST_EVENTS)

/** What an achievement counts: the quest wording for quest events, else its own label. */
const statLabel = (t: Translator, stat: AchievementStat) =>
  t(QUEST_STATS.has(stat) ? `quest.${stat}` : `stat.${stat}`)

const percent = (chance: number) => `${(chance * 100).toFixed(chance < 0.1 ? 1 : 0)}%`

/** "+200 pts · Ribbon gift · Egg ×1 · New trick: Spin", as short as the reward. */
export function rewardText(t: Translator, reward: Reward): string {
  const parts: string[] = []
  if (reward.points) parts.push(t('reward.points', { n: reward.points }))
  if (reward.box) parts.push(t(`box.${reward.box}`))
  if (reward.egg) parts.push(t('reward.egg', { n: reward.egg }))
  if (reward.unlock)
    parts.push(
      isTrick(reward.unlock)
        ? t('reward.trick', { name: t(`trick.${reward.unlock.slice('trick:'.length)}`) })
        : t('reward.item', { name: t(`item.${reward.unlock}`) }),
    )
  return parts.join(' · ')
}

/** What a claim or a hatch paid, in one line (shown after the button is pressed). */
function paidText(t: Translator, result: ClaimResult | HatchResult): string {
  if (!result.ok) return t('panel.failed')
  const parts: string[] = []
  if (result.points) parts.push(t('reward.points', { n: result.points }))
  if ('gifts' in result) {
    for (const gift of result.gifts) parts.push(t(`item.${gift.item}`))
    if (result.eggs) parts.push(t('reward.egg', { n: result.eggs }))
    if (result.unlock)
      parts.push(
        isTrick(result.unlock)
          ? t('reward.trick', { name: t(`trick.${result.unlock.slice('trick:'.length)}`) })
          : t(`item.${result.unlock}`),
      )
  } else if (result.item) parts.push(t(`item.${result.item}`))
  return t('journey.got', { what: parts.join(' · ') })
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 100}%` }} />
    </div>
  )
}

/**
 * The Journey: the duck's level (Bond), the stamp card, eggs, achievements and album sets. Every
 * reward shows what it gives before it is claimed; nothing here expires or can be bought.
 */
export function Journey({ t, language }: { t: Translator; language: string }) {
  const [view, setView] = useState<ProgressionView | undefined>()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | undefined>()

  useEffect(() => {
    window.buddy.panel.progression().then(
      (shown) => setView((v) => v ?? shown),
      (error) => {
        console.error('Journey failed', error)
        setNote(t('panel.failed'))
      },
    )
    return window.buddy.panel.onProgression(setView)
  }, [t])

  if (!view) return <section class="journey">{note && <p class="muted warn">{note}</p>}</section>

  const run = (work: Promise<ClaimResult | HatchResult>) => {
    setBusy(true)
    setNote(undefined)
    work
      .then((result) => setNote(paidText(t, result)))
      .catch((error) => {
        console.error('Claim failed', error)
        setNote(t('panel.failed'))
      })
      .finally(() => setBusy(false))
  }
  const claim = (kind: RewardKind, id?: string | number) =>
    run(window.buddy.panel.claimReward(kind, id))

  const n = (value: number) => value.toLocaleString(language)
  const { level } = view
  const due = view.levels.filter((l) => l.reached && !l.claimed)
  const upcoming = view.levels.filter((l) => !l.reached).slice(0, 2)
  const onCard = view.stamps.count % view.stamps.every
  const achievements = [...view.achievements].sort(
    (a, b) =>
      Number(b.done && !b.claimed) - Number(a.done && !a.claimed) ||
      Number(a.claimed) - Number(b.claimed) ||
      b.value / b.target - a.value / a.target,
  )
  const tricks = view.unlocks.filter(isTrick)

  return (
    <section class="journey">
      {note && (
        <p class="journey-note" role="status">
          {note}
        </p>
      )}

      {view.earlyBird.eligible && !view.earlyBird.claimed && (
        <div class="card featured">
          <Icon name="trophy" />
          <div class="grow">
            <strong>{t('reward.early-bird')}</strong>
            <span class="muted">{rewardText(t, view.earlyBird.reward)}</span>
          </div>
          <button type="button" disabled={busy} onClick={() => claim('early-bird')}>
            {t('journey.claim')}
          </button>
        </div>
      )}

      <div class="card">
        <Icon name="level" />
        <div class="grow">
          <strong>{t('journey.level', { n: level.level })}</strong>
          {level.to !== undefined ? (
            <>
              <Bar value={level.xp - level.from} max={level.to - level.from} />
              <span class="muted">
                {t('journey.xp', { xp: n(level.xp - level.from), to: n(level.to - level.from) })}
              </span>
            </>
          ) : (
            <span class="muted">{t('journey.levelMax')}</span>
          )}
        </div>
      </div>
      <ul class="journey-list">
        {due.map((l) => (
          <li key={l.level} class="quest">
            <div class="grow">
              <span>{t('journey.level', { n: l.level })}</span>
              <span class="muted">{rewardText(t, l.reward)}</span>
            </div>
            <button type="button" disabled={busy} onClick={() => claim('level', l.level)}>
              {t('journey.claim')}
            </button>
          </li>
        ))}
        {upcoming.map((l) => (
          <li key={l.level} class="quest claimed">
            <div class="grow">
              <span>{t('journey.level', { n: l.level })}</span>
              <span class="muted">{rewardText(t, l.reward)}</span>
            </div>
          </li>
        ))}
      </ul>
      <p class="muted note">{t('journey.levelHint')}</p>

      <h3 class="store-head">{t('journey.stamps')}</h3>
      <div class="card">
        <Icon name="stamp" />
        <div class="grow">
          <div
            class="stamps"
            role="img"
            aria-label={t('journey.stampCount', { n: onCard, of: view.stamps.every })}
          >
            {Array.from({ length: view.stamps.every }, (_, i) => (
              <span
                key={i}
                class={i < onCard || view.stamps.claimable > 0 ? 'stamp on' : 'stamp'}
              />
            ))}
          </div>
          <span class="muted">
            {t('journey.stampsHint', { every: view.stamps.every })}{' '}
            {rewardText(t, view.stamps.next)}
          </span>
        </div>
        {view.stamps.claimable > 0 && (
          <button type="button" disabled={busy} onClick={() => claim('stamps')}>
            {t('journey.claim')}
          </button>
        )}
      </div>

      <h3 class="store-head">{t('journey.eggs')}</h3>
      {view.eggs.list.length === 0 && <p class="muted note">{t('journey.noEggs')}</p>}
      {view.eggs.list.map((egg) => (
        <div key={egg.id} class="card">
          <Icon name="egg" />
          <div class="grow">
            {egg.ready ? (
              <strong>{t('journey.eggReady')}</strong>
            ) : (
              <>
                <Bar value={egg.minutes} max={view.eggs.hatchMinutes} />
                <span class="muted">
                  {t('journey.eggWarm', { n: egg.minutes, of: view.eggs.hatchMinutes })}
                </span>
              </>
            )}
          </div>
          {egg.ready && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(window.buddy.panel.hatchEgg(egg.id))}
            >
              {t('journey.hatch')}
            </button>
          )}
        </div>
      ))}
      {view.eggs.list.length > 0 && (
        <p class="muted note">
          {view.eggs.odds.length > 0
            ? `${t('journey.eggOdds')} ${view.eggs.odds
                .map((o) => `${t(`item.${o.id}`)} ${percent(o.chance)}`)
                .join(' · ')}`
            : t('journey.eggAllOwned', { n: view.eggs.allOwnedPoints })}
        </p>
      )}

      <h3 class="store-head">{t('journey.sets')}</h3>
      <ul class="journey-list">
        {view.sets.map((set) => (
          <li key={set.id} class={`quest${set.claimed ? ' claimed' : ''}`}>
            <Icon name="album" />
            <div class="grow">
              <span>{t(`set.${set.id}`)}</span>
              <Bar value={set.found} max={set.items.length} />
              <span class="muted">
                {set.found}/{set.items.length} · {rewardText(t, set.reward)}
              </span>
            </div>
            {set.claimed ? (
              <span class="muted">{t('quests.done')}</span>
            ) : (
              <button
                type="button"
                disabled={busy || !set.complete}
                onClick={() => claim('set', set.id)}
              >
                {t('journey.claim')}
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3 class="store-head">{t('journey.achievements')}</h3>
      <ul class="journey-list">
        {achievements.map((a) => (
          <li key={a.id} class={`quest${a.claimed ? ' claimed' : ''}`}>
            <Icon name="trophy" />
            <div class="grow">
              <span>{t(`achievement.${a.id}`)}</span>
              <span class="muted">{statLabel(t, a.stat)}</span>
              <Bar value={a.value} max={a.target} />
              <span class="muted">
                {n(a.value)}/{n(a.target)} · {rewardText(t, a.reward)}
              </span>
            </div>
            {a.claimed ? (
              <span class="muted">{t('quests.done')}</span>
            ) : (
              <button
                type="button"
                disabled={busy || !a.done}
                onClick={() => claim('achievement', a.id)}
              >
                {t('journey.claim')}
              </button>
            )}
          </li>
        ))}
      </ul>

      {tricks.length > 0 && (
        <p class="muted note">
          {t('journey.tricks')}{' '}
          {tricks.map((trick) => t(`trick.${trick.slice('trick:'.length)}`)).join(' · ')}
        </p>
      )}
    </section>
  )
}
