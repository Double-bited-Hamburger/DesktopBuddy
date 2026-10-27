import type { QuestView } from '../../core/economy/quests'
import type { Translator } from '../../core/i18n/i18n'

function QuestRow({ t, quest }: { t: Translator; quest: QuestView }) {
  const done = quest.count >= quest.target
  return (
    <li class={`quest${quest.claimed ? ' claimed' : ''}`}>
      <div class="grow">
        <span>{t(`quest.${quest.event}`)}</span>
        <div
          class="bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={quest.target}
          aria-valuenow={quest.count}
        >
          <div style={{ width: `${(quest.count / quest.target) * 100}%` }} />
        </div>
        <span class="muted">
          {quest.count}/{quest.target}
        </span>
      </div>
      {quest.claimed ? (
        <span class="muted">{t('quests.done')}</span>
      ) : (
        <button
          type="button"
          disabled={!done}
          onClick={() =>
            window.buddy.panel
              .claimQuest(quest.id)
              .catch((error) => console.error('Claim failed', error))
          }
        >
          {t('quests.claim', { n: quest.reward })}
        </button>
      )}
    </li>
  )
}

/** Today's three quests and this week's, with progress and a claim button each. */
export function Quests({ t, quests }: { t: Translator; quests: readonly QuestView[] }) {
  const daily = quests.filter((q) => q.period === 'daily')
  const weekly = quests.filter((q) => q.period === 'weekly')
  return (
    <section class="quests">
      <h2>{t('quests.daily')}</h2>
      <ul>
        {daily.map((quest) => (
          <QuestRow key={quest.id} t={t} quest={quest} />
        ))}
      </ul>
      <h2>{t('quests.weekly')}</h2>
      <ul>
        {weekly.map((quest) => (
          <QuestRow key={quest.id} t={t} quest={quest} />
        ))}
      </ul>
      <p class="muted note">{t('quests.reset')}</p>
    </section>
  )
}
