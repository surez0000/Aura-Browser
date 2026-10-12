import { expect, test } from '@playwright/test'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Page } from 'playwright'
import {
  closeAndWaitForExit,
  createTabViaPalette,
  launchAurora,
  modifierKey,
  pageFor,
  startFixtureServer,
} from './helpers'

interface SeenRequest {
  auth: string | undefined
  raw: string
  text: string
}

/**
 * A stand-in for an OpenAI-compatible provider: the custom provider path is
 * the real code path, so this exercises request building, the network call
 * and response reading end to end without leaving the machine.
 */
async function startMockAi(): Promise<{
  url: string
  seen: SeenRequest[]
  close: () => Promise<void>
}> {
  const seen: SeenRequest[] = []
  const read = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => resolve(body))
    })
  const server = createServer((req, res) => {
    void read(req).then((raw) => {
      if (req.url !== '/v1/chat/completions') {
        res.writeHead(404).end()
        return
      }
      const body = JSON.parse(raw) as { messages: Array<{ role: string; content: string }> }
      const user = body.messages.find((m) => m.role === 'user')?.content ?? ''
      const text = user.replace(/^<text>\n/, '').replace(/\n<\/text>$/, '')
      seen.push({ auth: req.headers.authorization, raw, text })
      if (text.includes('fail-auth')) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Incorrect API key provided' } }))
        return
      }
      const corrected = text
        .replace(/\bhas\b/g, 'have')
        .replace(/\bTheir\b/g, 'There')
        .replace(/\bteh\b/g, 'the')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: corrected } }] }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

const mark = (page: Page) => page.locator('[data-aura-grammar] .mark')
const card = (page: Page) => page.locator('[data-aura-grammar] .card')
const editor = (page: Page) => page.locator('[data-aura-grammar] .card .ed')
const toast = (page: Page) => page.locator('[data-aura-grammar] .toast')

test('the grammar checker: setup, allow a site, check, edit, recheck, replace, undo', async () => {
  test.setTimeout(120_000)
  const fixtures = await startFixtureServer()
  const ai = await startMockAi()
  const { app, chrome } = await launchAurora()
  try {
    // Switching it on in the Store goes straight to setup.
    await chrome.getByTestId('apps-button').click()
    const row = chrome.locator('[data-testid="app-row"][data-app="grammar"]')
    await expect(row).toContainText('Aura Grammar Checker')
    await row.getByTestId('app-toggle').click()
    await expect(chrome.getByTestId('grammar-setup')).toBeVisible()

    // Step 1: a provider. Step 2: where it is, a key, a passing test.
    await chrome.locator('[data-testid="grammar-provider"][data-provider="custom"]').click()
    await chrome.getByTestId('grammar-next').click()
    await chrome.getByTestId('grammar-base-url').fill(`${ai.url}/v1`)
    await chrome.getByTestId('grammar-model').fill('mock-model')
    await chrome.getByTestId('grammar-key').fill('sk-test-AB12')
    await expect(chrome.getByTestId('grammar-next')).toBeDisabled()
    await chrome.getByTestId('grammar-test').click()
    await expect(chrome.getByTestId('grammar-test-result')).toHaveAttribute('data-ok', 'true')
    expect(ai.seen).toHaveLength(1)
    expect(ai.seen[0]?.auth).toBe('Bearer sk-test-AB12')
    await chrome.getByTestId('grammar-next').click()
    // Step 3: no page is open yet, so there is no site to offer.
    await chrome.getByTestId('grammar-done').click()
    await expect(chrome.getByTestId('grammar-setup')).toHaveCount(0)

    const button = chrome.locator('[data-testid="pinned-app"][data-app="grammar"]')
    await expect(button).toBeVisible()

    await createTabViaPalette(chrome, `${fixtures.url}/grammar.html`)
    await expect(
      chrome.getByTestId('tab-title').filter({ hasText: 'Grammar Fixture' }),
    ).toBeVisible()
    const page = await pageFor(app, '/grammar.html', 10_000)
    expect(page, 'the fixture page should be reachable').not.toBeNull()
    if (!page) return

    // Off until the site is allowed: nothing in the page, nothing sent.
    await page.click('#ta')
    await page.keyboard.type('I has a cat.')
    await page.waitForTimeout(400)
    await expect(page.locator('[data-aura-grammar]')).toHaveCount(0)
    expect(ai.seen).toHaveLength(1)

    // Allow it from the right bar.
    await button.click()
    await expect(chrome.getByTestId('grammar-popover')).toBeVisible()
    await expect(chrome.getByTestId('grammar-current-site')).toHaveText(/^127\.0\.0\.1:\d+$/)
    await expect(chrome.getByTestId('grammar-connection')).toContainText('••••AB12')
    await chrome.getByTestId('grammar-site-toggle').click()
    await expect(chrome.getByTestId('grammar-site-row')).toHaveCount(1)
    await chrome.getByTestId('grammar-popover-close').click()
    await expect(button).toHaveAttribute('data-on-here', 'true')

    // The mark shows in the box with focus. Typing alone sends nothing.
    await page.click('#ta')
    await page.fill('#ta', 'Their is one problem. I has teh report.')
    await expect(mark(page)).toBeVisible()
    await page.waitForTimeout(400)
    expect(ai.seen).toHaveLength(1)

    // One click, one request: the box's text and nothing about the page.
    await mark(page).click()
    await expect(card(page)).toHaveAttribute('data-view', 'editor')
    expect(ai.seen).toHaveLength(2)
    expect(ai.seen[1]?.text).toBe('Their is one problem. I has teh report.')
    expect(ai.seen[1]?.raw).not.toContain('127.0.0.1')
    expect(ai.seen[1]?.raw).not.toContain('Grammar Fixture')
    await expect(editor(page)).toHaveText('There is one problem. I have the report.')
    await expect(card(page).locator('mark.hl')).toHaveCount(2)
    await expect(card(page).locator('.status')).toContainText('2 fixes')

    // A highlight says what it was, and can go back to it.
    await card(page).locator('mark.hl').first().click()
    await expect(card(page).locator('.chip')).toContainText('Their')
    await card(page).locator('.chip button').click()
    await expect(editor(page)).toHaveText('Their is one problem. I have the report.')

    // Edit the result, then check it again.
    await expect(card(page).getByRole('button', { name: 'Recheck' })).toBeDisabled()
    await editor(page).click()
    await page.keyboard.press(`${modifierKey()}+ArrowDown`)
    await page.keyboard.type(' Send teh rest.')
    await expect(card(page).locator('.status')).toContainText('Edited')
    await card(page).getByRole('button', { name: 'Recheck' }).click()
    await expect(card(page).locator('.status')).toContainText('Rechecked')
    expect(ai.seen).toHaveLength(3)
    expect(ai.seen[2]?.text).toBe('Their is one problem. I have the report. Send teh rest.')
    await expect(editor(page)).toHaveText('There is one problem. I have the report. Send the rest.')

    // Replace puts it in the box; Undo takes it back out.
    await card(page).getByRole('button', { name: 'Replace' }).click()
    await expect(card(page)).toBeHidden()
    await expect(page.locator('#ta')).toHaveValue(
      'There is one problem. I have the report. Send the rest.',
    )
    await expect(toast(page)).toContainText('Replaced')
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('#ta')).toHaveValue('Their is one problem. I has teh report.')

    // Rich text: the change lands inside the editable, text around it intact.
    await page.click('#ce')
    await page.keyboard.type('We has a plan.')
    await expect(mark(page)).toBeVisible()
    await mark(page).click()
    await expect(editor(page)).toHaveText('We have a plan.')
    await card(page).getByRole('button', { name: 'Replace' }).click()
    await expect(page.locator('#ce')).toHaveText('We have a plan.')

    // Never in password fields, or in fields a site marked off-limits.
    await page.click('#pw')
    await page.keyboard.type('several secret words here')
    await page.waitForTimeout(400)
    await expect(mark(page)).toBeHidden()
    await page.click('#optout')
    await page.keyboard.type('I has opted out.')
    await page.waitForTimeout(400)
    await expect(mark(page)).toBeHidden()

    // A rejected key says so, and changes nothing.
    await page.fill('#ta', 'fail-auth on this one please')
    await page.click('#ta')
    await expect(mark(page)).toBeVisible()
    await mark(page).click()
    await expect(card(page)).toHaveAttribute('data-view', 'error')
    await expect(card(page)).toContainText('didn’t accept your key')
    await expect(page.locator('#ta')).toHaveValue('fail-auth on this one please')
    await page.keyboard.press('Escape')
    await expect(card(page)).toBeHidden()

    // Stopping the site takes everything back out of the page.
    await button.click()
    await chrome.getByTestId('grammar-site-toggle').click()
    await expect(chrome.getByTestId('grammar-site-row')).toHaveCount(0)
    await chrome.getByTestId('grammar-popover-close').click()
    await expect(page.locator('[data-aura-grammar]')).toHaveCount(0)
  } finally {
    await closeAndWaitForExit(app)
    await ai.close()
    await fixtures.close()
  }
})

test('the shortcut checks the box with focus, and the settings survive a restart', async () => {
  test.setTimeout(120_000)
  const fixtures = await startFixtureServer()
  const ai = await startMockAi()
  const first = await launchAurora()
  try {
    const { chrome } = first
    await chrome.getByTestId('apps-button').click()
    await chrome
      .locator('[data-testid="app-row"][data-app="grammar"] [data-testid="app-toggle"]')
      .click()
    await chrome.locator('[data-testid="grammar-provider"][data-provider="custom"]').click()
    await chrome.getByTestId('grammar-next').click()
    await chrome.getByTestId('grammar-base-url').fill(`${ai.url}/v1`)
    await chrome.getByTestId('grammar-model').fill('mock-model')
    await chrome.getByTestId('grammar-test').click()
    await expect(chrome.getByTestId('grammar-test-result')).toHaveAttribute('data-ok', 'true')
    await chrome.getByTestId('grammar-next').click()
    await chrome.getByTestId('grammar-done').click()
    await createTabViaPalette(chrome, `${fixtures.url}/grammar.html`)
    await expect(
      chrome.getByTestId('tab-title').filter({ hasText: 'Grammar Fixture' }),
    ).toBeVisible()
    await chrome.locator('[data-testid="pinned-app"][data-app="grammar"]').click()
    await chrome.getByTestId('grammar-site-toggle').click()
    await chrome.getByTestId('grammar-popover-close').click()
  } finally {
    await closeAndWaitForExit(first.app)
  }

  const second = await launchAurora(first.userDataDir)
  try {
    const { app, chrome } = second
    // The restored tab loads when shown; the allow-list came back with it.
    const page = await pageFor(app, '/grammar.html', 15_000)
    expect(page, 'the restored page should be reachable').not.toBeNull()
    if (!page) return
    await expect(chrome.locator('[data-testid="pinned-app"][data-app="grammar"]')).toHaveAttribute(
      'data-on-here',
      'true',
    )
    await page.click('#ta')
    await page.keyboard.type('Teh shortcut has to work.')
    await expect(mark(page)).toBeVisible()
    const before = ai.seen.length
    // Playwright's keyboard goes over CDP, which skips before-input-event, so
    // press the shortcut through Electron's own input path, as a real key does.
    await app.evaluate(({ webContents }, mac) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('grammar.html'))
      const modifiers: Array<'alt' | 'meta' | 'control'> = mac
        ? ['alt', 'meta']
        : ['alt', 'control']
      wc?.sendInputEvent({ type: 'keyDown', keyCode: 'G', modifiers })
      wc?.sendInputEvent({ type: 'keyUp', keyCode: 'G', modifiers })
    }, process.platform === 'darwin')
    await expect(card(page)).toHaveAttribute('data-view', 'editor')
    expect(ai.seen.length).toBe(before + 1)
    await expect(editor(page)).toHaveText('Teh shortcut have to work.')
  } finally {
    await closeAndWaitForExit(second.app)
    await ai.close()
    await fixtures.close()
  }
})

test('never in a private Space, even on an allowed site', async () => {
  const fixtures = await startFixtureServer()
  const ai = await startMockAi()
  const { app, chrome } = await launchAurora()
  try {
    const site = new URL(fixtures.url).host
    await chrome.evaluate(
      async ({ aiUrl, site }) => {
        const aurora = (
          window as unknown as {
            aurora: { invoke: (c: string, p: unknown) => Promise<unknown> }
          }
        ).aurora
        await aurora.invoke('grammar:save', {
          provider: 'custom',
          model: 'mock-model',
          baseUrl: `${aiUrl}/v1`,
        })
        await aurora.invoke('apps:setEnabled', { id: 'grammar', enabled: true })
        await aurora.invoke('grammar:setSite', { site, allowed: true })
        await aurora.invoke('spaces:openIncognito', {})
      },
      { aiUrl: ai.url, site },
    )
    await createTabViaPalette(chrome, `${fixtures.url}/grammar.html?private`)
    const page = await pageFor(app, '/grammar.html?private', 10_000)
    expect(page, 'the private page should be reachable').not.toBeNull()
    if (!page) return
    await page.click('#ta')
    await page.keyboard.type('I has typed this in private.')
    await page.waitForTimeout(800)
    await expect(page.locator('[data-aura-grammar]')).toHaveCount(0)
    expect(ai.seen).toHaveLength(0)
    await expect(
      chrome.locator('[data-testid="pinned-app"][data-app="grammar"]'),
    ).not.toHaveAttribute('data-on-here', 'true')
  } finally {
    await closeAndWaitForExit(app)
    await ai.close()
    await fixtures.close()
  }
})
