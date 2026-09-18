import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const shared = resolve(__dirname, 'src/shared')

/**
 * Chromium 152 dropped `-webkit-backdrop-filter` altogether: it is not a
 * recognised property there, and `CSS.supports` says so. The CSS pipeline's
 * browser data still believes Chrome wants the prefix, so it emits the
 * prefixed declaration *instead of* the standard one — which left every
 * frosted surface in the app rendering as a flat panel, dialogs included.
 *
 * Put the standard property back beside the prefixed one. This is additive and
 * idempotent: it only writes a declaration that is missing, so once the
 * upstream data catches up the plugin quietly stops doing anything and can go.
 */
function keepStandardBackdropFilter(): Plugin {
  const patch = (css: string): string =>
    css.replace(
      // The `(?! *backdrop-filter)` keeps this idempotent: a pair that is
      // already written out is left exactly as it is.
      /-webkit-backdrop-filter:\s*([^;}]+?)\s*([;}])(?!\s*backdrop-filter)/g,
      (_whole, value: string, end: string) =>
        `-webkit-backdrop-filter: ${value}; backdrop-filter: ${value}${end}`,
    )

  return {
    name: 'aura:keep-standard-backdrop-filter',
    enforce: 'post',
    // Dev server: CSS is served straight from the transform pipeline.
    transform(code, id) {
      if (!id.includes('.css')) return null
      if (!code.includes('-webkit-backdrop-filter')) return null
      return { code: patch(code), map: null }
    },
    // Production: the Tailwind pass runs late, so patch the emitted asset.
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue
        const css = typeof file.source === 'string' ? file.source : file.source.toString()
        if (css.includes('-webkit-backdrop-filter')) file.source = patch(css)
      }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
  },
  renderer: {
    plugins: [react(), tailwindcss(), keepStandardBackdropFilter()],
    resolve: {
      alias: {
        '@shared': shared,
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
  },
})
