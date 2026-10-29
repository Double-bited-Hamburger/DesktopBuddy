import en from '../../../assets/i18n/en.json'
import it from '../../../assets/i18n/it.json'
import { createTranslator } from '../../core/i18n/i18n'
import { STAGE_SIZE } from '../../core/stage'
import { ChipPlayer } from '../shared/chip-player'
import { drawDressed, loadDressedDuck } from '../shared/outfit'

// The break sign (see src/main/break-buddy.ts): drawn once, no timers. Main says the duck's
// scale in the URL hash and closes the window as soon as a button is pressed.
async function main(): Promise<void> {
  const config = await window.buddy.getConfig()
  const t = createTranslator(config.language, { en, it })
  document.documentElement.lang = config.language
  const text = (id: string, key: string) => {
    const element = document.getElementById(id)
    if (element) element.textContent = t(key)
  }
  text('title', 'sign.title')
  text('body', 'sign.body')
  text('finish', 'sign.finish')
  text('later', 'sign.later')

  const scale = Number(location.hash.slice(1)) || config.scale
  const canvas = document.getElementById('duck') as HTMLCanvasElement
  canvas.width = STAGE_SIZE
  canvas.height = STAGE_SIZE
  canvas.style.width = `${STAGE_SIZE * scale}px`
  canvas.style.height = `${STAGE_SIZE * scale}px`
  const image = drawDressed(await loadDressedDuck(config.loadout), 'idle')
  if (image)
    canvas
      .getContext('2d')
      ?.putImageData(
        new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height),
        0,
        0,
      )
  document.querySelector('.plank')?.removeAttribute('hidden')

  let answered = false
  const answer = (choice: 'finish' | 'later') => {
    if (answered) return
    answered = true
    window.buddy.sign.answer(choice)
  }
  document.getElementById('finish')?.addEventListener('click', () => answer('finish'))
  document.getElementById('later')?.addEventListener('click', () => answer('later'))
  new ChipPlayer(config.volume).play('chirp')
}

main().catch((error) => console.error('Sign failed to start', error))
