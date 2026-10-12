import {
  clipboard,
  safeStorage,
  session,
  type ContextMenuParams,
  type Input,
  type MenuItemConstructorOptions,
  type Session,
  type WebContents,
} from 'electron'
import {
  DEFAULT_GRAMMAR_CONFIG,
  GRAMMAR_MAX_CHARS,
  GRAMMAR_PROVIDERS,
  PROVIDER_PRESETS,
  buildGrammarRequest,
  cleanCorrection,
  isHttpUrl,
  isReady,
  parseGrammarResponse,
  providerLabel,
  siteOf,
  type GrammarCheckResult,
  type GrammarConfig,
  type GrammarError,
  type GrammarInfo,
  type GrammarProvider,
  type GrammarSetup,
  type GrammarTestResult,
  type RequestConfig,
} from '@shared/grammar'
import type { KvStore } from '../services/db/kv'
import type { AppRegistry } from './registry'
import type { Tab } from '../tabs/tab'
import {
  DISPOSE_SCRIPT,
  GRAMMAR_WORLD_ID,
  NEXT_SCRIPT,
  TRIGGER_SCRIPT,
  deliverScript,
  grammarPageScript,
  type GrammarPageConfig,
  type GrammarPageMessage,
} from './grammar-page'

const CONFIG_KEY = 'grammar'
const SECRET_KEY = 'grammar:key'
const REQUEST_TIMEOUT_MS = 30_000
const MAX_SITES = 500
/** The sentence setup sends to prove a key, a model and an address work. */
const TEST_SENTENCE = 'This sentence have a error.'

interface StoredSecret {
  encrypted: boolean
  data: string
  hint: string
}

export interface GrammarServiceDeps {
  kv: KvStore
  apps: AppRegistry
  /** Every live page in the window: tabs, and the Peek. */
  pages: () => Tab[]
  changed: (info: GrammarInfo) => void
  /** Bring up the app's settings in the chrome (setup, when it is not ready). */
  openSettings: () => void
  /** Store the key without the system keychain (e2e, so no keychain prompt). */
  plainKeys: boolean
  /** The page card's shadow root: 'open' only for the e2e harness. */
  shadow: 'open' | 'closed'
  /** Provider requests; defaults to an in-memory session's fetch. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

function sanitize(raw: Partial<GrammarConfig> | null): GrammarConfig {
  const provider = GRAMMAR_PROVIDERS.includes(raw?.provider as GrammarProvider)
    ? (raw?.provider as GrammarProvider)
    : null
  const sites = Array.isArray(raw?.sites)
    ? [...new Set(raw.sites.filter((s): s is string => typeof s === 'string' && isSite(s)))]
    : []
  return {
    ...DEFAULT_GRAMMAR_CONFIG,
    provider,
    model: typeof raw?.model === 'string' ? raw.model : '',
    baseUrl: typeof raw?.baseUrl === 'string' ? raw.baseUrl : '',
    sites: sites.slice(0, MAX_SITES),
  }
}

/** A site is a bare host, port allowed: what `siteOf` produces. */
function isSite(value: string): boolean {
  return siteOf(`http://${value}/`) === value
}

/**
 * Aura Grammar Checker, main-process half: the settings, the key, the
 * provider calls, and which pages the mark may appear on.
 *
 * The key never leaves this process. Pages get the page script only on sites
 * the person allowed, never in a private Space, and the script can only hand
 * text over — it cannot reach the provider, the key, or Aura's IPC.
 */
export class GrammarService {
  private config: GrammarConfig
  /** Decrypted lazily, on the first check: undefined until then. */
  private keyCache: string | null | undefined = undefined
  /** Per webContents: bumped by every new document, so stale loops stop. */
  private readonly generations = new Map<number, number>()
  /** webContents whose current document runs the page script. */
  private readonly active = new Set<number>()
  private readonly watched = new Set<number>()
  private netSession: Session | null = null

  constructor(private readonly deps: GrammarServiceDeps) {
    this.config = sanitize(deps.kv.get<Partial<GrammarConfig>>(CONFIG_KEY))
  }

  // ---- settings ----------------------------------------------------------------

  info(): GrammarInfo {
    const secret = this.secret()
    const hasKey = !!secret?.data
    return {
      ...this.config,
      sites: [...this.config.sites],
      hasKey,
      keyHint: hasKey ? (secret?.hint ?? null) : null,
      keyEncrypted: hasKey ? (secret?.encrypted ?? false) : this.canEncrypt(),
      ready: isReady(this.config, hasKey),
    }
  }

  private ready(): boolean {
    return isReady(this.config, !!this.secret()?.data)
  }

  save(req: GrammarSetup): GrammarInfo {
    const previous = this.config.provider
    const provider = req.provider
    this.config = {
      ...this.config,
      provider,
      model: req.model.trim() || PROVIDER_PRESETS[provider].defaultModel,
      baseUrl: provider === 'custom' ? req.baseUrl.trim() : '',
    }
    if (req.apiKey !== undefined) this.writeKey(req.apiKey.trim() || null)
    // A key belongs to the provider it came from.
    else if (previous !== provider) this.writeKey(null)
    this.persist()
    return this.info()
  }

  setSite(site: string, allowed: boolean): GrammarInfo {
    const key = site.trim().toLowerCase()
    if (!isSite(key)) return this.info()
    const rest = this.config.sites.filter((s) => s !== key)
    this.config = {
      ...this.config,
      sites: allowed ? [key, ...rest].slice(0, MAX_SITES) : rest,
    }
    this.persist()
    return this.info()
  }

  private persist(): void {
    this.deps.kv.set(CONFIG_KEY, this.config)
    this.deps.changed(this.info())
    this.sync({ reconfigure: true })
  }

  // ---- the key -------------------------------------------------------------------

  private secret(): StoredSecret | null {
    const s = this.deps.kv.get<StoredSecret>(SECRET_KEY)
    return s && typeof s.data === 'string' && s.data ? s : null
  }

  private canEncrypt(): boolean {
    if (this.deps.plainKeys) return false
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  private writeKey(key: string | null): void {
    this.keyCache = key
    if (!key) {
      this.deps.kv.set(SECRET_KEY, null)
      return
    }
    // The keychain can refuse (access denied at the macOS prompt); the key is
    // then kept as plain text, and setup and the popover both say so.
    let encrypted = this.canEncrypt()
    let data = ''
    if (encrypted) {
      try {
        data = safeStorage.encryptString(key).toString('base64')
      } catch {
        encrypted = false
      }
    }
    if (!encrypted) data = Buffer.from(key, 'utf8').toString('base64')
    const stored: StoredSecret = { encrypted, data, hint: key.slice(-4) }
    this.deps.kv.set(SECRET_KEY, stored)
  }

  private readKey(): string | null {
    if (this.keyCache !== undefined) return this.keyCache
    const s = this.secret()
    if (!s) return (this.keyCache = null)
    try {
      const bytes = Buffer.from(s.data, 'base64')
      this.keyCache = s.encrypted ? safeStorage.decryptString(bytes) : bytes.toString('utf8')
    } catch {
      this.keyCache = null
    }
    return this.keyCache
  }

  // ---- talking to the provider -----------------------------------------------------

  /**
   * Requests go through an in-memory session of their own: the system proxy
   * applies, but no Space's cookies, cache or logins ride along.
   */
  private fetchImpl(url: string, init: RequestInit): Promise<Response> {
    if (this.deps.fetch) return this.deps.fetch(url, init)
    this.netSession ??= session.fromPartition('aura-grammar', { cache: false })
    return this.netSession.fetch(url, init)
  }

  private async call(
    cfg: RequestConfig,
    text: string,
  ): Promise<{ ok: true; text: string } | ({ ok: false } & GrammarError)> {
    const label = providerLabel(cfg.provider, cfg.baseUrl)
    const req = buildGrammarRequest(cfg, text)
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    try {
      const response = await this.fetchImpl(req.url, {
        method: 'POST',
        headers: req.headers,
        body: req.body,
        credentials: 'omit',
        signal: controller.signal,
      })
      let json: unknown = null
      try {
        json = await response.json()
      } catch {
        json = null
      }
      return parseGrammarResponse(cfg.provider, response.status, json, label)
    } catch {
      return timedOut
        ? { ok: false, kind: 'timeout', message: `${label} took too long to answer.` }
        : {
            ok: false,
            kind: 'offline',
            message: `Couldn’t reach ${label}. Check your connection, then try again.`,
          }
    } finally {
      clearTimeout(timer)
    }
  }

  /** One check of the text a page handed over. */
  async check(text: string): Promise<GrammarCheckResult> {
    const { provider, model, baseUrl } = this.config
    const label = providerLabel(provider, baseUrl)
    const key = this.readKey()
    if (provider && this.ready() && PROVIDER_PRESETS[provider].keyRequired && !key) {
      // Stored, but the keychain would not hand it back.
      return {
        ok: false,
        label,
        kind: 'key',
        message: 'Aura couldn’t unlock your saved key.',
      }
    }
    if (!provider || !this.ready()) {
      return {
        ok: false,
        label,
        kind: 'notReady',
        message: 'Finish setting up Aura Grammar Checker first.',
      }
    }
    if (text.length > GRAMMAR_MAX_CHARS) {
      return {
        ok: false,
        label,
        kind: 'tooLong',
        message: `Aura Grammar Checker checks up to ${GRAMMAR_MAX_CHARS.toLocaleString('en-US')} characters at a time.`,
      }
    }
    const res = await this.call({ provider, model, baseUrl, apiKey: key }, text)
    if (!res.ok) return { ...res, label }
    const corrected = cleanCorrection(text, res.text)
    if (corrected === null) {
      return {
        ok: false,
        label,
        kind: 'unexpected',
        message: `${label} rewrote the text instead of correcting it.`,
      }
    }
    return { ok: true, corrected, label }
  }

  /** Setup's "Test": a real request with what is on the form. */
  async test(req: GrammarSetup): Promise<GrammarTestResult> {
    const preset = PROVIDER_PRESETS[req.provider]
    const key =
      req.apiKey !== undefined
        ? req.apiKey.trim() || null
        : req.provider === this.config.provider
          ? this.readKey()
          : null
    const model = req.model.trim() || preset.defaultModel
    if (!model) return { ok: false, kind: 'model', message: 'Enter the name of a model.' }
    if (preset.keyRequired && !key) {
      return { ok: false, kind: 'key', message: 'Paste your API key first.' }
    }
    if (req.provider === 'custom' && !isHttpUrl(req.baseUrl.trim())) {
      return {
        ok: false,
        kind: 'server',
        message: 'Enter the server’s address, starting with http:// or https://.',
      }
    }
    const started = Date.now()
    const res = await this.call(
      { provider: req.provider, model, baseUrl: req.baseUrl.trim(), apiKey: key },
      TEST_SENTENCE,
    )
    if (!res.ok) return res
    return { ok: true, ms: Date.now() - started }
  }

  // ---- pages -------------------------------------------------------------------------

  private pageConfig(): GrammarPageConfig {
    return {
      label: providerLabel(this.config.provider, this.config.baseUrl),
      shortcut: process.platform === 'darwin' ? '⌥⌘G' : 'Ctrl+Alt+G',
      maxChars: GRAMMAR_MAX_CHARS,
      shadow: this.deps.shadow,
    }
  }

  private allowedFor(tab: Tab): boolean {
    if (tab.incognito || tab.held || tab.wc.isDestroyed()) return false
    if (!this.deps.apps.isEnabled('grammar') || !this.ready()) return false
    const site = siteOf(tab.wc.getURL())
    return !!site && this.config.sites.includes(site)
  }

  /** A new document finished parsing in a tab. */
  pageReady(tab: Tab): void {
    const wc = tab.wc
    // Whatever ran in the old document is gone with it.
    this.bump(wc)
    this.active.delete(wc.id)
    if (this.allowedFor(tab)) void this.inject(tab)
  }

  /** Bring every live page in line with the switches and the allow-list. */
  sync(opts: { reconfigure?: boolean } = {}): void {
    for (const tab of this.deps.pages()) {
      if (tab.wc.isDestroyed() || !tab.domReady) continue
      const run = this.allowedFor(tab)
      const running = this.active.has(tab.wc.id)
      if (run && (!running || opts.reconfigure)) void this.inject(tab)
      else if (!run && running) this.stop(tab)
    }
  }

  private bump(wc: WebContents): number {
    const gen = (this.generations.get(wc.id) ?? 0) + 1
    this.generations.set(wc.id, gen)
    if (!this.watched.has(wc.id)) {
      this.watched.add(wc.id)
      const id = wc.id
      wc.once('destroyed', () => {
        this.generations.delete(id)
        this.active.delete(id)
        this.watched.delete(id)
      })
    }
    return gen
  }

  private alive(wc: WebContents, gen: number): boolean {
    return !wc.isDestroyed() && this.generations.get(wc.id) === gen
  }

  private async inject(tab: Tab): Promise<void> {
    const wc = tab.wc
    if (wc.isDestroyed()) return
    const gen = this.bump(wc)
    this.active.add(wc.id)
    try {
      await wc.executeJavaScriptInIsolatedWorld(GRAMMAR_WORLD_ID, [
        { code: grammarPageScript(this.pageConfig()) },
      ])
    } catch {
      if (this.alive(wc, gen)) this.active.delete(wc.id)
      return
    }
    void this.pump(wc, gen)
  }

  private stop(tab: Tab): void {
    const wc = tab.wc
    this.bump(wc)
    this.active.delete(wc.id)
    if (!wc.isDestroyed()) {
      wc.executeJavaScriptInIsolatedWorld(GRAMMAR_WORLD_ID, [{ code: DISPOSE_SCRIPT }]).catch(
        () => undefined,
      )
    }
  }

  /** Collect what the page queued, one message at a time, for as long as it runs. */
  private async pump(wc: WebContents, gen: number): Promise<void> {
    while (this.alive(wc, gen)) {
      let msg: GrammarPageMessage | null
      try {
        msg = (await wc.executeJavaScriptInIsolatedWorld(GRAMMAR_WORLD_ID, [
          { code: NEXT_SCRIPT },
        ])) as GrammarPageMessage | null
      } catch {
        return
      }
      if (!this.alive(wc, gen) || !msg || msg.type === 'disposed') return
      if (msg.type === 'check') void this.answer(wc, gen, msg)
      else if (msg.type === 'copy' && typeof msg.text === 'string') {
        clipboard.writeText(msg.text.slice(0, 100_000))
      } else if (msg.type === 'settings') this.deps.openSettings()
    }
  }

  private async answer(
    wc: WebContents,
    gen: number,
    msg: Extract<GrammarPageMessage, { type: 'check' }>,
  ): Promise<void> {
    if (typeof msg.id !== 'number' || typeof msg.text !== 'string') return
    const result = await this.check(msg.text)
    if (!this.alive(wc, gen)) return
    wc.executeJavaScriptInIsolatedWorld(GRAMMAR_WORLD_ID, [
      { code: deliverScript(msg.id, result) },
    ]).catch(() => undefined)
  }

  /** Check the box with focus — the shortcut and the context menu. */
  trigger(tab: Tab): void {
    if (!this.active.has(tab.wc.id) || tab.wc.isDestroyed()) return
    tab.wc
      .executeJavaScriptInIsolatedWorld(GRAMMAR_WORLD_ID, [{ code: TRIGGER_SCRIPT }], true)
      .catch(() => undefined)
  }

  /** ⌥⌘G (Ctrl+Alt+G elsewhere) while a page has focus. True when handled. */
  handleKey(tab: Tab, input: Input): boolean {
    if (input.type !== 'keyDown' || input.code !== 'KeyG' || !input.alt || input.shift) return false
    const mod = process.platform === 'darwin' ? input.meta && !input.control : input.control
    if (!mod || !this.active.has(tab.wc.id)) return false
    this.trigger(tab)
    return true
  }

  /** The page's right-click menu: allow or stop this site, check this box. */
  menuItems(tab: Tab, params: ContextMenuParams): MenuItemConstructorOptions[] {
    if (!this.deps.apps.isEnabled('grammar') || tab.incognito) return []
    const site = siteOf(tab.wc.getURL())
    if (!site) return []
    if (!this.ready()) {
      return [{ label: 'Set Up Aura Grammar Checker…', click: () => this.deps.openSettings() }]
    }
    const allowed = this.config.sites.includes(site)
    const items: MenuItemConstructorOptions[] = []
    if (allowed && params.isEditable) {
      items.push({
        label: 'Check Grammar',
        accelerator: 'Alt+CommandOrControl+G',
        registerAccelerator: false,
        click: () => this.trigger(tab),
      })
    }
    items.push({
      label: allowed
        ? `Stop Aura Grammar Checker on ${site}`
        : `Use Aura Grammar Checker on ${site}`,
      click: () => this.setSite(site, !allowed),
    })
    return items
  }
}
