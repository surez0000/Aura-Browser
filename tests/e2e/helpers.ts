import { _electron, type ElectronApplication, type Page } from 'playwright'
import electronPath from 'electron'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const root = process.cwd()

export interface LaunchedApp {
  app: ElectronApplication
  chrome: Page
  userDataDir: string
}

/** Launch the built app (out/) with an isolated profile directory. */
export async function launchAurora(userDataDir?: string): Promise<LaunchedApp> {
  const profiles = join(root, 'test-results', 'profiles')
  mkdirSync(profiles, { recursive: true })
  const dir = userDataDir ?? mkdtempSync(join(profiles, 'aurora-'))

  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  env.AURORA_USER_DATA_DIR = dir
  env.AURORA_E2E = '1'

  const app = await _electron.launch({
    executablePath: electronPath as unknown as string,
    args: [join(root, 'out', 'main', 'index.js')],
    cwd: root,
    env,
  })
  // Fail fast instead of hanging if the app exits before a window appears
  // (e.g. it lost the single-instance lock to a still-exiting predecessor).
  const chrome = await Promise.race([
    app.firstWindow(),
    new Promise<never>((_, reject) =>
      app.on('close', () => reject(new Error('aurora exited before opening a window'))),
    ),
  ])
  await chrome.waitForSelector('[data-testid="sidebar"]')
  return { app, chrome, userDataDir: dir }
}

/** Close and wait for the process to fully exit (releases the single-instance lock). */
export async function closeAndWaitForExit(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  const exited =
    proc.exitCode !== null
      ? Promise.resolve()
      : new Promise<void>((resolve) => proc.once('exit', () => resolve()))
  await app.close()
  await exited
}

export interface FixtureServer {
  url: string
  close: () => Promise<void>
}

/** Tiny static server for tests/e2e/fixtures — e2e never touches the network. */
export async function startFixtureServer(): Promise<FixtureServer> {
  const dir = join(root, 'tests', 'e2e', 'fixtures')
  const server = createServer((req, res) => {
    const name = basename((req.url ?? '/a.html').split('?')[0] ?? '') || 'a.html'
    if (name === 'file.bin') {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="file.bin"',
        'content-length': '2048',
      })
      res.end(Buffer.alloc(2048, 7))
      return
    }
    readFile(join(dir, name))
      .then((content) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(content)
      })
      .catch(() => {
        res.writeHead(404)
        res.end('not found')
      })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/** Create a tab through the palette flow, like a user would. */
export async function createTabViaPalette(chrome: Page, url: string): Promise<void> {
  await chrome.getByTestId('new-tab-button').click()
  const input = chrome.getByTestId('palette-input')
  await input.fill(url)
  await input.press('Enter')
}

export function modifierKey(): 'Meta' | 'Control' {
  return process.platform === 'darwin' ? 'Meta' : 'Control'
}

/** Find the Playwright Page backing a tab's WebContentsView, if exposed. */
export async function pageFor(
  app: ElectronApplication,
  urlPart: string,
  timeoutMs = 5_000,
): Promise<Page | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if (page.url().includes(urlPart)) return page
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}
