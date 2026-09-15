import { WebContentsView, clipboard, type MenuItemConstructorOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import type { FindResult, SecurityState, TabInfo, TabKind } from '@shared/models'

import { INCOGNITO_PARTITION } from './partition-names'

export { INCOGNITO_PARTITION }

/** What a Tab needs from its owner (the TabManager). */
export interface TabHost {
  changed(tab: Tab): void
  openUrl(opener: Tab, url: string, activate: boolean): void
  recordVisit(tab: Tab, url: string): void
  updateTitle(tab: Tab, url: string, title: string): void
  popupMenu(template: MenuItemConstructorOptions[]): void
}

/**
 * Find-in-page, injected. Electron 44's webContents.findInPage never emits
 * 'found-in-page' (verified with a minimal repro), so Aura Browser searches text
 * nodes itself and paints matches with the CSS Custom Highlight API. Matches
 * inside cross-origin iframes are not found — same-document text only.
 */
function findScript(query: string, activeIndex: number): string {
  return `(() => {
  const query = ${JSON.stringify(query.toLowerCase())};
  if (!query) return { matches: 0, activeMatchOrdinal: 0 };
  if (!document.getElementById('aurora-find-style')) {
    const style = document.createElement('style');
    style.id = 'aurora-find-style';
    style.textContent = '::highlight(aurora-find){background-color:rgba(255,204,0,.45)} ::highlight(aurora-find-active){background-color:rgba(255,145,0,.95);color:#000}';
    (document.head || document.documentElement).appendChild(style);
  }
  const ranges = [];
  const root = document.body || document.documentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement ? node.parentElement.tagName : '';
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node;
  outer: while ((node = walker.nextNode())) {
    const lower = (node.nodeValue || '').toLowerCase();
    let from = 0, idx;
    while ((idx = lower.indexOf(query, from)) !== -1) {
      const range = new Range();
      range.setStart(node, idx);
      range.setEnd(node, idx + query.length);
      ranges.push(range);
      from = idx + query.length;
      if (ranges.length >= 5000) break outer;
    }
  }
  const count = ranges.length;
  const active = count ? ((${activeIndex} % count) + count) % count : 0;
  CSS.highlights.set('aurora-find', new Highlight(...ranges));
  if (count) {
    CSS.highlights.set('aurora-find-active', new Highlight(ranges[active]));
    const rect = ranges[active].getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > innerHeight) {
      const el = ranges[active].startContainer.parentElement;
      if (el) el.scrollIntoView({ block: 'center' });
    }
  } else {
    CSS.highlights.delete('aurora-find-active');
  }
  return { matches: count, activeMatchOrdinal: count ? active + 1 : 0 };
})()`
}

const CLEAR_FIND_SCRIPT = `(() => {
  CSS.highlights.delete('aurora-find');
  CSS.highlights.delete('aurora-find-active');
})()`

export function isAllowedPageUrl(url: string): boolean {
  return (
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url === 'about:blank' ||
    url.startsWith('data:text/html') // internal error pages
  )
}

function securityFor(url: string): SecurityState {
  if (url.startsWith('https://')) return 'secure'
  if (url.startsWith('http://')) return 'insecure'
  return 'neutral'
}

function errorPage(url: string, description: string): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Can’t open page</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#101321;color:rgba(255,255,255,.9);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
main{text-align:center;max-width:32rem;padding:2rem}h1{font-size:1.1rem;font-weight:600}p{color:rgba(255,255,255,.55);font-size:.85rem;word-break:break-all}</style></head>
<body><main><h1>Aura Browser can’t open this page</h1><p>${esc(url)}</p><p>${esc(description)}</p></main></body></html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

export interface TabOptions {
  spaceId: string
  kind?: TabKind
  incognito?: boolean
  /** Storage partition of the owning Space ('' = Electron default session). */
  partition?: string
  url?: string
  lazy?: boolean
  title?: string
  faviconUrl?: string | null
}

export class Tab {
  readonly id: string = randomUUID()
  readonly view: WebContentsView
  readonly incognito: boolean
  readonly partition: string

  spaceId: string
  kind: TabKind
  lastActiveAt: number = Date.now()

  url = ''
  pendingUrl: string | null = null
  title = ''
  faviconUrl: string | null = null
  isLoading = false
  domReady = false
  crashed = false
  security: SecurityState = 'neutral'

  constructor(
    private readonly host: TabHost,
    opts: TabOptions,
  ) {
    this.spaceId = opts.spaceId
    this.kind = opts.kind ?? 'today'
    this.incognito = opts.incognito ?? false
    this.partition = opts.partition ?? (this.incognito ? INCOGNITO_PARTITION : '')
    this.view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        ...(this.partition ? { partition: this.partition } : {}),
      },
    })
    this.view.setBackgroundColor('#ffffff')
    this.title = opts.title ?? ''
    this.faviconUrl = opts.faviconUrl ?? null
    this.wire()

    if (opts.url) {
      if (opts.lazy) {
        this.pendingUrl = opts.url
        this.security = securityFor(opts.url)
      } else {
        this.navigate(opts.url)
      }
    }
  }

  get wc(): Electron.WebContents {
    return this.view.webContents
  }

  private wire(): void {
    const wc = this.wc

    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (isAllowedPageUrl(url)) this.host.openUrl(this, url, disposition !== 'background-tab')
      return { action: 'deny' }
    })

    wc.on('did-start-loading', () => {
      this.isLoading = true
      this.domReady = false
      this.host.changed(this)
    })
    wc.on('dom-ready', () => {
      this.domReady = true
      this.host.changed(this)
    })
    wc.on('did-stop-loading', () => {
      this.isLoading = false
      this.host.changed(this)
    })
    wc.on('did-navigate', (_e, url) => {
      this.url = url
      this.pendingUrl = null
      this.security = securityFor(url)
      this.host.recordVisit(this, url)
      this.host.changed(this)
    })
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame) return
      this.url = url
      this.host.recordVisit(this, url)
      this.host.changed(this)
    })
    wc.on('page-title-updated', (_e, title) => {
      this.title = title
      this.host.updateTitle(this, this.url, title)
      this.host.changed(this)
    })
    wc.on('page-favicon-updated', (_e, favicons) => {
      this.faviconUrl = favicons[0] ?? null
      this.host.changed(this)
    })
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return
      this.crashed = true
      this.isLoading = false
      this.host.changed(this)
    })
    wc.on('did-fail-load', (_e, code, description, failedUrl, isMainFrame) => {
      // -3 is ERR_ABORTED (e.g. stop button, downloads, redirects) — not a failure to surface.
      if (!isMainFrame || code === -3) return
      this.title = 'Can’t open page'
      void wc.loadURL(errorPage(failedUrl, description || `Error ${code}`))
    })
    wc.on('context-menu', (_e, params) => this.showContextMenu(params))
  }

  private showContextMenu(params: Electron.ContextMenuParams): void {
    const wc = this.wc
    const template: MenuItemConstructorOptions[] = []
    if (params.linkURL) {
      template.push(
        {
          label: 'Open Link in New Tab',
          click: () => this.host.openUrl(this, params.linkURL, true),
        },
        { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' },
      )
    }
    if (params.isEditable) {
      template.push(
        { label: 'Cut', click: () => wc.cut() },
        { label: 'Copy', click: () => wc.copy() },
        { label: 'Paste', click: () => wc.paste() },
        { type: 'separator' },
      )
    } else if (params.selectionText.trim()) {
      template.push({ label: 'Copy', click: () => wc.copy() }, { type: 'separator' })
    }
    template.push(
      {
        label: 'Back',
        enabled: wc.navigationHistory.canGoBack(),
        click: () => wc.navigationHistory.goBack(),
      },
      {
        label: 'Forward',
        enabled: wc.navigationHistory.canGoForward(),
        click: () => wc.navigationHistory.goForward(),
      },
      { label: 'Reload', click: () => wc.reload() },
      { type: 'separator' },
      { label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) },
    )
    this.host.popupMenu(template)
  }

  /** Session-restored tabs only load once first activated. */
  ensureLoaded(): void {
    if (this.pendingUrl && !this.crashed) {
      const url = this.pendingUrl
      this.pendingUrl = null
      void this.wc.loadURL(url)
    }
  }

  navigate(url: string): void {
    if (!isAllowedPageUrl(url)) return
    this.pendingUrl = null
    this.crashed = false
    void this.wc.loadURL(url)
  }

  goBack(): void {
    this.wc.navigationHistory.goBack()
  }

  goForward(): void {
    this.wc.navigationHistory.goForward()
  }

  reload(hard = false): void {
    if (this.crashed) {
      this.crashed = false
      const url = this.url || this.pendingUrl
      if (url) {
        void this.wc.loadURL(url)
      }
      this.host.changed(this)
      return
    }
    if (this.pendingUrl) {
      this.ensureLoaded()
      return
    }
    if (hard) this.wc.reloadIgnoringCache()
    else this.wc.reload()
  }

  stop(): void {
    this.wc.stop()
  }

  zoom(direction: 'in' | 'out' | 'reset'): number {
    const level =
      direction === 'reset' ? 0 : this.wc.getZoomLevel() + (direction === 'in' ? 0.5 : -0.5)
    const clamped = Math.max(-7.6, Math.min(9, level))
    this.wc.setZoomLevel(clamped)
    return this.zoomPercent()
  }

  zoomPercent(): number {
    return Math.round(Math.pow(1.2, this.wc.getZoomLevel()) * 100)
  }

  openDevTools(): void {
    this.wc.openDevTools({ mode: 'detach' })
  }

  private findText = ''
  private findActiveIndex = 0

  async findInPage(
    text: string,
    opts: { forward: boolean; findNext: boolean },
  ): Promise<FindResult> {
    if (!text) return { matches: 0, activeMatchOrdinal: 0 }
    if (opts.findNext && text === this.findText) {
      this.findActiveIndex += opts.forward ? 1 : -1
    } else {
      this.findText = text
      this.findActiveIndex = 0
    }
    try {
      const result = (await this.wc.executeJavaScript(
        findScript(text, this.findActiveIndex),
        true,
      )) as FindResult
      // Normalize the persistent index so prev/next stay in range.
      this.findActiveIndex = result.matches ? result.activeMatchOrdinal - 1 : 0
      return result
    } catch {
      return { matches: 0, activeMatchOrdinal: 0 }
    }
  }

  stopFind(): void {
    this.findText = ''
    this.findActiveIndex = 0
    this.wc.executeJavaScript(CLEAR_FIND_SCRIPT, true).catch(() => {})
  }

  info(): TabInfo {
    return {
      id: this.id,
      spaceId: this.spaceId,
      kind: this.kind,
      url: this.url,
      pendingUrl: this.pendingUrl,
      title: this.title,
      faviconUrl: this.faviconUrl,
      isLoading: this.isLoading,
      domReady: this.domReady,
      canGoBack: !this.crashed && this.wc.navigationHistory.canGoBack(),
      canGoForward: !this.crashed && this.wc.navigationHistory.canGoForward(),
      crashed: this.crashed,
      security: this.security,
      zoomPercent: this.zoomPercent(),
    }
  }

  destroy(): void {
    this.wc.close()
  }
}
