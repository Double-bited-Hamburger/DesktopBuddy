// Smoke check for the running dev app. Usage:
//   npx electron-vite dev --remoteDebuggingPort 9222      (terminal 1)
//   npm run smoke                                         (terminal 2)
// Attaches over the Chrome DevTools Protocol (local debug port only) and checks both pages.
// Stop the dev server afterwards: it leaves a local debug port open.
const PORT = Number(process.env.DEBUG_PORT ?? 9222)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const listPages = async () =>
  (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((p) => p.type === 'page')

async function waitForPage(match, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try {
      const page = (await listPages()).find((p) => p.url.includes(match))
      if (page) return page
    } catch {
      // the debug port is not up yet
    }
    await sleep(500)
  }
  throw new Error(`Page "${match}" did not appear on port ${PORT}. Is the dev app running?`)
}

async function attach(page) {
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  let nextId = 0
  const pending = new Map()
  const problems = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      problems.push(details.exception?.description ?? details.text)
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      problems.push(message.params.args.map((a) => a.value ?? a.description).join(' '))
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      problems.push(`${message.params.entry.text} ${message.params.entry.url ?? ''}`)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  await send('Runtime.enable')
  await send('Log.enable')
  const evaluate = async (expression) => {
    const reply = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (reply.result?.exceptionDetails) {
      throw new Error(reply.result.exceptionDetails.exception?.description ?? 'evaluate failed')
    }
    return reply.result?.result?.value
  }
  return { evaluate, problems }
}

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures.push(name)
}

const duck = await attach(await waitForPage('/duck/'))
await sleep(2500) // sprite load + a few ticks

const state = await duck.evaluate(`(async () => {
  const canvas = document.getElementById('stage')
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  let opaque = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++
  return {
    opaque,
    api: Object.keys(window.buddy).sort(),
    leak: [typeof require, typeof process],
    config: await window.buddy.getConfig(),
    csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? '',
  }
})()`)

check('duck canvas has drawn pixels', state.opaque > 0, `${state.opaque} opaque px`)
check(
  'window.buddy exposes getConfig/onPoints/duck/panel/snack',
  state.api.join() === 'duck,getConfig,onPoints,panel,snack',
)
check(
  'renderer is sandboxed (no require/process)',
  state.leak.every((t) => t === 'undefined'),
)
check('CSP present', state.csp.includes("default-src 'self'"))
check(
  'config comes through IPC',
  state.config.scale >= 1 &&
    state.config.loadout.skin.length > 0 &&
    Number.isInteger(state.config.points),
)

// Opening the panel toggles it: close one left open by an earlier probe so this really opens it.
const leftOpen = (await listPages()).find((p) => p.url.includes('/panel/'))
if (leftOpen) {
  const stale = await attach(leftOpen)
  await stale.evaluate('window.buddy.panel.close()')
  await sleep(500)
}
await duck.evaluate('window.buddy.duck.openPanel()')
const panel = await attach(await waitForPage('/panel/', 8000))
await sleep(800)
const text = await panel.evaluate('document.body.innerText')
check('panel renders translated text', text.includes('Bag') || text.includes('Zaino'))

const pin = `document.querySelector('header button[aria-pressed]')`
check(
  'panel starts unpinned',
  (await panel.evaluate(`${pin}.getAttribute('aria-pressed')`)) === 'false',
)
await panel.evaluate(`${pin}.click()`)
await sleep(300)
check('pin toggles', (await panel.evaluate(`${pin}.getAttribute('aria-pressed')`)) === 'true')
// Stop the duck from its own page, then let the panel try to walk it: main must ignore that.
// (Tiny race: if the behavior machine starts a walk inside this window, re-run.)
await duck.evaluate('window.buddy.duck.walk(0)')
await sleep(200)
const before = await duck.evaluate('window.screenX')
await panel.evaluate('window.buddy.duck.walk(1)')
await sleep(500)
check('panel cannot drive the duck', (await duck.evaluate('window.screenX')) === before)

// The panel may not earn points either (only the duck page, and main applies the caps).
await sleep(500) // past the click cooldown, so a grant would show
await duck.evaluate(
  'window.__smokePoints = 0; window.buddy.onPoints(() => window.__smokePoints++); 1',
)
await panel.evaluate("window.buddy.duck.earn('click'); 1")
await sleep(400)
check('panel cannot earn points', (await duck.evaluate('window.__smokePoints')) === 0)

await panel.evaluate('window.buddy.panel.close()')
await sleep(1200)
const remaining = (await listPages()).map((p) => p.url)
check(
  'panel window is destroyed on close',
  remaining.some((url) => url.includes('/duck/')) &&
    !remaining.some((url) => url.includes('/panel/')),
)

check('no console errors on the duck page', duck.problems.length === 0, duck.problems.join(' | '))
check(
  'no console errors on the panel page',
  panel.problems.length === 0,
  panel.problems.join(' | '),
)

console.log(
  failures.length === 0 ? '\nsmoke: all checks passed' : `\nsmoke: ${failures.length} failed`,
)
process.exit(failures.length === 0 ? 0 : 1)
