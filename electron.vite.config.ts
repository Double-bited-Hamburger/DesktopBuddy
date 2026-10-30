import { resolve } from 'node:path'
import preact from '@preact/preset-vite'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'

const CSP_BASE = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'"

/** Fills the `__CSP__` placeholder: strict in production, with HMR allowances in dev. */
function cspPlugin(): Plugin {
  return {
    name: 'buddy-csp',
    transformIndexHtml(html, ctx) {
      const csp = ctx.server
        ? `${CSP_BASE}; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*`
        : `${CSP_BASE}; script-src 'self'`
      return html.replace('__CSP__', csp)
    },
  }
}

// Main and preload entries are auto-detected (src/main/index.ts, src/preload/index.ts).
// Renderer pages: the always-on duck, the on-demand panel, the optional pill, a carried snack
// the break sign, the duck's speech bubble and the talk box (rubber-duck mode).
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: resolve('src/renderer'),
    plugins: [preact(), cspPlugin()],
    // Baked sprite sheets live in /assets, outside the renderer root.
    server: { fs: { allow: [resolve('.')] } },
    build: {
      rollupOptions: {
        input: {
          duck: resolve('src/renderer/duck/index.html'),
          panel: resolve('src/renderer/panel/index.html'),
          pill: resolve('src/renderer/pill/index.html'),
          snack: resolve('src/renderer/snack/index.html'),
          sign: resolve('src/renderer/sign/index.html'),
          bubble: resolve('src/renderer/bubble/index.html'),
          talk: resolve('src/renderer/talk/index.html'),
          friend: resolve('src/renderer/friend/index.html'),
        },
      },
    },
  },
})
