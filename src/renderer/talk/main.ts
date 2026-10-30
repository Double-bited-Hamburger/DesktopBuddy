import en from '../../../assets/i18n/en.json'
import it from '../../../assets/i18n/it.json'
import { pickReply, TYPING_EVERY_MS } from '../../core/care/listen'
import { createTranslator } from '../../core/i18n/i18n'

// The talk box (see src/main/talk-window.ts). What you type stays in this page: main and the
// duck only hear *that* a key was pressed or a line was finished. Nothing is saved, and the
// text is gone when the window closes. The duck's name comes in the URL hash.
async function main(): Promise<void> {
  const config = await window.buddy.getConfig()
  const t = createTranslator(config.language, { en, it })
  document.documentElement.lang = config.language
  const name = (() => {
    try {
      return decodeURIComponent(location.hash.slice(1)).slice(0, 40)
    } catch {
      return ''
    }
  })()

  const byId = (id: string) => document.getElementById(id)
  const text = (id: string, value: string) => {
    const element = byId(id)
    if (element) element.textContent = value
  }
  text('title', t('talk.title'))
  text('hint', t('talk.hint'))
  text('name', `${name || t('talk.duck')}:`)
  text('reply', t('talk.hello'))
  text('done', t('talk.done'))
  byId('close')?.setAttribute('aria-label', t('talk.done'))
  const box = byId('text') as HTMLTextAreaElement | null
  if (box) box.placeholder = t('talk.placeholder')
  document.querySelector('main')?.removeAttribute('hidden')
  box?.focus()

  let lastTyped = 0
  let lastReply: number | undefined
  box?.addEventListener('input', () => {
    const now = performance.now()
    if (now - lastTyped < TYPING_EVERY_MS) return
    lastTyped = now
    window.buddy.talk.typed()
  })
  box?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return finish()
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
    // Only a line with something on it counts (the line the caret is on, up to the caret).
    const before = box.value.slice(0, box.selectionStart)
    if (!before.slice(before.lastIndexOf('\n') + 1).trim()) return
    window.buddy.talk.line()
    lastReply = pickReply(Math.random, lastReply)
    text('reply', t(`talk.reply.${lastReply}`))
  })

  let finished = false
  function finish(): void {
    if (finished) return
    finished = true
    if (box) box.value = '' // gone now, not only when the window is
    window.buddy.talk.done()
  }
  byId('done')?.addEventListener('click', finish)
  byId('close')?.addEventListener('click', finish)
}

main().catch((error) => console.error('Talk box failed to start', error))
