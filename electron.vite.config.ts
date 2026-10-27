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
// The renderer has three pages: the always-on duck, the on-demand panel and the optional pill.
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
        },
      },
    },
  },
})
