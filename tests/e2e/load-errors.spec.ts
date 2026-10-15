import { expect, test } from '@playwright/test'
import { createServer as createHttpsServer } from 'node:https'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTabViaPalette, launchAurora, startFixtureServer } from './helpers'

/**
 * Pages that do not load get Chrome's pages, drawn by Aura's chrome in place of
 * the page: the certificate warning with its way through, and the "This site
 * can’t be reached" family with Reload.
 */

const tls = join(process.cwd(), 'tests', 'e2e', 'fixtures', 'tls')

/** A page behind a certificate nobody trusts (see fixtures/tls). */
async function startUntrustedServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createHttpsServer(
    {
      key: readFileSync(join(tls, 'localhost.key')),
      cert: readFileSync(join(tls, 'localhost.crt')),
    },
    (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><title>TLS Fixture</title><p>behind a self-signed certificate</p>')
    },
  )
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `https://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/** A port that was just in use and is now closed: connecting is refused. */
async function closedPort(): Promise<number> {
  const server: Server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

test('an untrusted certificate gets Chrome’s warning, and Proceed goes through for that site', async () => {
  const untrusted = await startUntrustedServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, untrusted.url)
    const page = chrome.getByTestId('load-error')
    await expect(page).toBeVisible()
    await expect(page).toHaveAttribute('data-kind', 'certificate')
    await expect(chrome.getByTestId('load-error-title')).toHaveText(
      'Your connection is not private',
    )
    await expect(chrome.getByTestId('load-error-summary')).toContainText('127.0.0.1')
    await expect(chrome.getByTestId('load-error-code')).toHaveText(/^NET::ERR_CERT_/)
    // The address stays the page you asked for, marked not secure.
    await expect(chrome.getByTestId('url-pill')).toContainText('127.0.0.1')
    await expect(chrome.getByTestId('url-not-secure')).toBeVisible()

    // The way through hides behind Advanced, as in Chrome.
    await expect(chrome.getByTestId('load-error-proceed')).toHaveCount(0)
    await chrome.getByTestId('load-error-advanced').click()
    await expect(chrome.getByTestId('load-error-details')).toContainText('could not prove')
    await chrome.getByTestId('load-error-proceed').click()

    await expect(chrome.getByTestId('load-error')).toHaveCount(0)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'TLS Fixture' })).toBeVisible()
    // Through, but still not secure.
    await expect(chrome.getByTestId('url-not-secure')).toBeVisible()

    // Accepted for this site in this Space: a second tab goes straight in.
    await createTabViaPalette(chrome, `${untrusted.url}again`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'TLS Fixture' })).toHaveCount(2)
    await expect(chrome.getByTestId('load-error')).toHaveCount(0)
  } finally {
    await app.close()
    await untrusted.close()
  }
})

test('Back to safety leaves a certificate warning for the page before it', async () => {
  const server = await startFixtureServer()
  const untrusted = await startUntrustedServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/a.html`)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await chrome.evaluate(
      (url) =>
        (
          window as unknown as { aurora: { invoke: (c: string, r: unknown) => Promise<unknown> } }
        ).aurora.invoke('tabs:navigate', { url }),
      untrusted.url,
    )
    await expect(chrome.getByTestId('load-error')).toHaveAttribute('data-kind', 'certificate')
    await chrome.getByTestId('load-error-back').click()
    await expect(chrome.getByTestId('load-error')).toHaveCount(0)
    await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Fixture A' })).toBeVisible()
    await expect(chrome.getByTestId('tab-item')).toHaveCount(1)
  } finally {
    await app.close()
    await untrusted.close()
    await server.close()
  }
})

test('a refused connection says so, keeps the address, and Reload tries again', async () => {
  const port = await closedPort()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `http://127.0.0.1:${port}/`)
    const page = chrome.getByTestId('load-error')
    await expect(page).toHaveAttribute('data-kind', 'unreachable')
    await expect(chrome.getByTestId('load-error-title')).toHaveText('This site can’t be reached')
    await expect(chrome.getByTestId('load-error-summary')).toHaveText(
      `127.0.0.1:${port} refused to connect.`,
    )
    await expect(chrome.getByTestId('load-error-code')).toHaveText('ERR_CONNECTION_REFUSED')
    await expect(chrome.getByTestId('url-pill')).toContainText('127.0.0.1')
    await expect(
      chrome.getByTestId('tab-title').filter({ hasText: `127.0.0.1:${port}` }),
    ).toBeVisible()

    // Something starts listening there: Reload now finds it.
    const back = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><title>Came Back</title><p>up again</p>')
    })
    await new Promise<void>((resolve) => back.listen(port, '127.0.0.1', resolve))
    try {
      await chrome.getByTestId('load-error-reload').click()
      await expect(chrome.getByTestId('load-error')).toHaveCount(0)
      await expect(chrome.getByTestId('tab-title').filter({ hasText: 'Came Back' })).toBeVisible()
    } finally {
      await new Promise<void>((resolve) => back.close(() => resolve()))
    }
  } finally {
    await app.close()
  }
})

test('an empty 404 gets Chrome’s page; a server’s own 404 page is left alone', async () => {
  const server = await startFixtureServer()
  const { app, chrome } = await launchAurora()
  try {
    await createTabViaPalette(chrome, `${server.url}/empty-404`)
    await expect(chrome.getByTestId('load-error')).toHaveAttribute('data-kind', 'notFound')
    await expect(chrome.getByTestId('load-error-title')).toHaveText('This page can’t be found')
    await expect(chrome.getByTestId('load-error-code')).toHaveText('HTTP ERROR 404')

    // The fixture server's 404 says "not found" itself: that is the page.
    await createTabViaPalette(chrome, `${server.url}/missing.html`)
    await expect(chrome.getByTestId('tab-item')).toHaveCount(2)
    await chrome.waitForTimeout(500)
    await expect(chrome.getByTestId('load-error')).toHaveCount(0)
  } finally {
    await app.close()
    await server.close()
  }
})
