import en from '../../../assets/i18n/en.json'
import it from '../../../assets/i18n/it.json'
import { createTranslator } from '../../core/i18n/i18n'

// The pill only shows the balance: no timers, it redraws when main reports points.
async function main(): Promise<void> {
  const output = document.getElementById('points') as HTMLOutputElement
  const config = await window.buddy.getConfig()
  const t = createTranslator(config.language, { en, it })
  const show = (balance: number) => {
    output.textContent = t('points.balance', { n: balance.toLocaleString(config.language) })
    output.hidden = false
  }
  show(config.points)
  window.buddy.onPoints(({ balance }) => show(balance))
}

main().catch((error) => console.error('Pill failed to start', error))
