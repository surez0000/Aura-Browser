/// <reference lib="dom" />
import { diffSegments, inputTypeAllowed, type DiffSegment } from '@shared/grammar'

/**
 * The half of Aura Grammar Checker that lives in a web page: the mark in the
 * corner of the box you are typing in, the result card, Replace and Undo.
 *
 * It runs only on sites you allowed, in an isolated world of its own (the
 * page's scripts cannot see its variables), and draws into a closed shadow
 * root (they cannot read the card either). It never talks to a provider and
 * never sees the key: when you click, it queues the text, and the main
 * process collects it through `next()`, runs the check and hands the answer
 * back through `deliver()`. Pages get no preload, so this pull is the only
 * channel there is.
 *
 * `pageMain` is shipped as source text (Function#toString), so it must not
 * refer to anything outside itself; the diff and the field rules it needs
 * arrive as arguments, also as source.
 */

export const GRAMMAR_WORLD_ID = 1931

export interface GrammarPageConfig {
  /** Shown on the card: who checked the text. */
  label: string
  shortcut: string
  maxChars: number
  /** 'open' only under the e2e harness, so tests can reach inside. */
  shadow: 'open' | 'closed'
}

/** What the page queues for the main process, one per `next()`. */
export type GrammarPageMessage =
  | { type: 'check'; id: number; text: string }
  | { type: 'copy'; text: string }
  | { type: 'settings' }
  | { type: 'ping' }
  | { type: 'disposed' }

/** The answer to a check, as the page receives it. */
export type GrammarPageResult =
  | { ok: true; corrected: string; label: string }
  | { ok: false; kind: string; message: string; label: string }

interface PageLib {
  diff: (before: string, after: string) => DiffSegment[]
  inputAllowed: (type: string, autocomplete: string) => boolean
}

export function grammarPageScript(cfg: GrammarPageConfig): string {
  return `(${pageMain.toString()})(${JSON.stringify(cfg)}, { diff: ${diffSegments.toString()}, inputAllowed: ${inputTypeAllowed.toString()} })`
}

export const NEXT_SCRIPT = 'window.__auraGrammar ? window.__auraGrammar.next() : null'
export const TRIGGER_SCRIPT = 'window.__auraGrammar ? window.__auraGrammar.trigger() : false'
export const DISPOSE_SCRIPT = 'window.__auraGrammar ? window.__auraGrammar.dispose() : null'

export function deliverScript(id: number, result: GrammarPageResult): string {
  return `window.__auraGrammar && window.__auraGrammar.deliver(${JSON.stringify(id)}, ${JSON.stringify(result)})`
}

interface PageApi {
  next(): Promise<GrammarPageMessage>
  deliver(id: number, result: GrammarPageResult): void
  trigger(): boolean
  dispose(): void
  configure(cfg: GrammarPageConfig): void
}

function pageMain(initial: GrammarPageConfig, lib: PageLib): string {
  const scope = window as unknown as { __auraGrammar?: PageApi }
  if (scope.__auraGrammar) {
    scope.__auraGrammar.configure(initial)
    return 'ready'
  }
  const cfg: GrammarPageConfig = { ...initial }
  const MARK = 22
  const NAME = 'Aura Grammar Checker'

  // ---- the channel to the main process ------------------------------------------

  const outbox: GrammarPageMessage[] = []
  let waiter: ((m: GrammarPageMessage) => void) | null = null
  const pending = new Map<number, (r: GrammarPageResult) => void>()
  let nextId = 1
  let disposed = false

  const post = (msg: GrammarPageMessage): void => {
    if (waiter) {
      const resolve = waiter
      waiter = null
      resolve(msg)
    } else {
      outbox.push(msg)
    }
  }

  const next = (): Promise<GrammarPageMessage> => {
    if (disposed) return Promise.resolve({ type: 'disposed' })
    const queued = outbox.shift()
    if (queued) return Promise.resolve(queued)
    // A second caller (a fresh loop after re-injection) retires the first.
    if (waiter) {
      const old = waiter
      waiter = null
      old({ type: 'ping' })
    }
    return new Promise((resolve) => {
      const done = (m: GrammarPageMessage): void => {
        clearTimeout(timer)
        resolve(m)
      }
      // Answer now and then, so the main side's loop never hangs on a page
      // that went away without telling it.
      const timer = setTimeout(() => {
        if (waiter === done) waiter = null
        resolve({ type: 'ping' })
      }, 20_000)
      waiter = done
    })
  }

  const request = (text: string): Promise<GrammarPageResult> =>
    new Promise((resolve) => {
      const id = nextId++
      const timer = setTimeout(() => {
        if (!pending.delete(id)) return
        resolve({
          ok: false,
          kind: 'timeout',
          message: `${cfg.label} took too long to answer.`,
          label: cfg.label,
        })
      }, 45_000)
      pending.set(id, (r) => {
        clearTimeout(timer)
        resolve(r)
      })
      post({ type: 'check', id, text })
    })

  const deliver = (id: number, result: GrammarPageResult): void => {
    const resolve = pending.get(id)
    if (!resolve) return
    pending.delete(id)
    resolve(result)
  }

  // ---- drawing -----------------------------------------------------------------

  const CSS = `
*{box-sizing:border-box}
.ui{--bg:#ffffff;--ink:rgba(18,21,38,.92);--ink2:rgba(18,21,38,.76);--ink3:rgba(18,21,38,.62);--line:rgba(20,24,46,.13);--soft:rgba(18,21,38,.045);--hover:rgba(18,21,38,.08);--ins:#17663f;--insbg:rgba(23,102,63,.13);--warn:#8f4f00;--gold:#f2be45;--goldink:#231900;--goldline:#a86d00;--focus:rgba(168,109,0,.32);--shadow:0 12px 40px rgba(24,30,60,.22),0 2px 8px rgba(24,30,60,.12);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,"Helvetica Neue",Arial,sans-serif;color:var(--ink);letter-spacing:normal;text-align:left;text-transform:none;font-style:normal;font-weight:400}
@media (prefers-color-scheme: dark){.ui{--bg:#151827;--ink:rgba(255,255,255,.93);--ink2:rgba(255,255,255,.76);--ink3:rgba(255,255,255,.6);--line:rgba(255,255,255,.13);--soft:rgba(255,255,255,.05);--hover:rgba(255,255,255,.09);--ins:#82e2ab;--insbg:rgba(130,226,171,.15);--warn:#ffc069;--goldline:#f2be45;--focus:rgba(242,190,69,.3);--shadow:0 12px 40px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.35)}}
[hidden]{display:none!important}
.mark{position:fixed;width:${MARK}px;height:${MARK}px;margin:0;padding:0;border-radius:50%;border:1px solid rgba(20,24,46,.12);background:#fff;box-shadow:0 1px 4px rgba(20,24,46,.22);display:grid;place-items:center;cursor:pointer;transition:transform .12s}
.mark:hover{transform:scale(1.1)}
.mark:focus-visible{outline:2px solid #a86d00;outline-offset:2px}
.mark svg{width:13px;height:13px;display:block}
.mark .ring{position:absolute;inset:-3px;border-radius:50%;border:2px solid transparent;border-top-color:#a86d00;border-right-color:#f2be45;opacity:0}
.mark[data-state=checking] .ring{opacity:1;animation:spin .8s linear infinite}
.mark[data-state=checking] svg{opacity:.45}
.mark .badge{position:absolute;right:-4px;top:-4px;width:12px;height:12px;border-radius:50%;display:none;place-items:center;color:#fff;font:700 8px/1 -apple-system,system-ui,sans-serif;box-shadow:0 0 0 2px #fff}
.mark .badge svg{width:8px;height:8px}
.mark[data-state=done] .badge{display:grid;background:#1e8a52}
.mark[data-state=error] .badge{display:grid;background:#c26a00}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.mark{transition:none}.mark[data-state=checking] .ring{animation:none}.toast .bar{animation:none!important}}
.card{position:fixed;width:min(380px,calc(100vw - 16px));background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.head{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-bottom:1px solid var(--line)}
.head .spark{width:14px;height:14px;flex:none}
.head .name{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.via{font-size:11px;color:var(--ink3);background:var(--soft);border:1px solid var(--line);padding:0 7px;border-radius:999px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis}
.x{width:26px;height:26px;flex:none;display:grid;place-items:center;border:0;background:none;color:var(--ink3);border-radius:7px;cursor:pointer;padding:0}
.x:hover{background:var(--hover);color:var(--ink)}
.x svg{width:14px;height:14px}
.status{display:flex;gap:6px;align-items:flex-start;padding:8px 12px 0;font-size:12px;color:var(--ink2)}
.status svg{width:13px;height:13px;flex:none;margin-top:2px}
.status[data-tone=ok]{color:var(--ins)}
.status[data-tone=warn]{color:var(--warn)}
.ed{display:block;margin:8px 12px 0;padding:9px 11px;min-height:64px;max-height:220px;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--line);border-radius:10px;background:var(--soft);outline:none;font-size:13.5px;line-height:1.6;color:var(--ink);cursor:text}
.ed:focus{border-color:var(--goldline);box-shadow:0 0 0 3px var(--focus)}
.ed[aria-busy=true]{opacity:.55}
mark.hl{background:var(--insbg);color:var(--ins);font-weight:600;border-radius:3px;cursor:pointer;box-shadow:inset 0 -1.5px 0 var(--ins)}
mark.hl.kept{background:none;color:inherit;font-weight:inherit;box-shadow:none;text-decoration:underline dotted var(--ink3);text-underline-offset:3px}
.foot{display:flex;align-items:center;gap:8px;padding:10px 12px 12px}
.grow{flex:1}
.btn{font:500 12.5px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;border-radius:8px;padding:6px 12px;cursor:pointer;border:1px solid var(--line);background:var(--soft);color:var(--ink);white-space:nowrap}
.btn:hover{background:var(--hover)}
.btn:focus-visible{outline:2px solid var(--goldline);outline-offset:1px}
.btn.primary{background:var(--gold);border-color:transparent;color:var(--goldink);font-weight:600}
.btn.primary:hover{filter:brightness(1.05)}
.btn:disabled{opacity:.45;cursor:default;filter:none}
.chip{position:absolute;z-index:2;display:flex;align-items:center;gap:8px;padding:5px 5px 5px 10px;background:var(--bg);border:1px solid var(--line);border-radius:9px;box-shadow:var(--shadow);font-size:12px;color:var(--ink2);white-space:nowrap;max-width:calc(100% - 16px)}
.chip q{color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;quotes:"“" "”"}
.chip .btn{padding:3px 9px;font-size:12px}
.msg{display:flex;gap:10px;padding:12px}
.msg svg{width:17px;height:17px;flex:none;margin-top:1px}
.msg .ok{color:var(--ins)}
.msg .bad{color:var(--warn)}
.msg b{display:block;font-weight:600;margin-bottom:2px}
.msg p{margin:0;color:var(--ink2);font-size:12.5px}
.acts{display:flex;gap:8px;justify-content:flex-end;padding:0 12px 12px}
.toast{position:fixed;display:flex;align-items:center;gap:10px;max-width:min(380px,calc(100vw - 16px));background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:11px;box-shadow:var(--shadow);padding:7px 7px 7px 12px;overflow:hidden;font-size:12.5px}
.toast svg{width:14px;height:14px;flex:none;color:var(--ins)}
.toast .bar{position:absolute;left:0;bottom:0;height:2px;background:var(--goldline);animation:shrink 10s linear forwards}
@keyframes shrink{from{width:100%}to{width:0}}
`

  const NS = 'http://www.w3.org/2000/svg'
  let gradients = 0
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    cls?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text !== undefined) node.textContent = text
    return node
  }
  const stroke = (paths: string[], cls?: string): SVGSVGElement => {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2.2')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('aria-hidden', 'true')
    if (cls) svg.setAttribute('class', cls)
    for (const d of paths) {
      const p = document.createElementNS(NS, 'path')
      p.setAttribute('d', d)
      svg.appendChild(p)
    }
    return svg
  }
  /** Aura's four-point mark, in the brand gold. */
  const spark = (cls?: string): SVGSVGElement => {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    if (cls) svg.setAttribute('class', cls)
    const id = `aura-gold-${++gradients}`
    const defs = document.createElementNS(NS, 'defs')
    const grad = document.createElementNS(NS, 'linearGradient')
    grad.setAttribute('id', id)
    for (const [k, v] of [
      ['x1', '0'],
      ['y1', '0'],
      ['x2', '1'],
      ['y2', '1'],
    ]) {
      grad.setAttribute(k as string, v as string)
    }
    for (const [offset, color] of [
      ['0', '#f6c752'],
      ['1', '#a86d00'],
    ]) {
      const stop = document.createElementNS(NS, 'stop')
      stop.setAttribute('offset', offset as string)
      stop.setAttribute('stop-color', color as string)
      grad.appendChild(stop)
    }
    defs.appendChild(grad)
    svg.appendChild(defs)
    for (const d of [
      'M11 3.2c.55 4.6 3.75 7.8 8.3 8.3-4.55.55-7.75 3.75-8.3 8.3-.55-4.55-3.75-7.75-8.3-8.3 4.55-.5 7.75-3.7 8.3-8.3z',
      'M19.2 1.6c.2 1.45 1.2 2.45 2.65 2.65-1.45.2-2.45 1.2-2.65 2.65-.2-1.45-1.2-2.45-2.65-2.65 1.45-.2 2.45-1.2 2.65-2.65z',
    ]) {
      const p = document.createElementNS(NS, 'path')
      p.setAttribute('d', d)
      p.setAttribute('fill', `url(#${id})`)
      svg.appendChild(p)
    }
    return svg
  }
  const ICON = {
    x: ['M18 6 6 18', 'm6 6 12 12'],
    check: ['M20 6 9 17l-5-5'],
    alert: ['M12 8v4', 'M12 16h.01', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'],
  }

  const host = document.createElement('div')
  host.setAttribute('data-aura-grammar', '')
  host.style.cssText =
    'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;display:block;'
  const root = host.attachShadow({ mode: cfg.shadow })
  // A constructed sheet is not an inline <style>, so a strict style-src does
  // not stop the card from being styled.
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(CSS)
    root.adoptedStyleSheets = [sheet]
  } catch {
    root.appendChild(make('style', undefined, CSS))
  }

  const mark = make('button', 'mark ui')
  mark.type = 'button'
  mark.dataset.state = 'idle'
  mark.hidden = true
  mark.setAttribute('aria-label', 'Check grammar')
  mark.appendChild(spark())
  mark.appendChild(make('span', 'ring'))
  const badge = make('span', 'badge')
  mark.appendChild(badge)

  const card = make('div', 'card ui')
  card.hidden = true
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-label', NAME)
  const toast = make('div', 'toast ui')
  toast.hidden = true
  toast.setAttribute('role', 'status')
  root.append(mark, card, toast)

  const attach = (): void => {
    if (!host.isConnected) (document.documentElement || document.body)?.appendChild(host)
  }
  attach()

  // Typing in the card must not reach the page: a site's own shortcuts listen
  // on the document, and they would see these keys as theirs.
  for (const type of [
    'keydown',
    'keyup',
    'keypress',
    'input',
    'beforeinput',
    'paste',
    'cut',
    'copy',
  ]) {
    card.addEventListener(type, (e) => e.stopPropagation())
  }
  for (const type of ['mousedown', 'pointerdown', 'click', 'mouseup']) {
    card.addEventListener(type, (e) => e.stopPropagation())
    toast.addEventListener(type, (e) => e.stopPropagation())
  }

  // ---- fields ------------------------------------------------------------------------

  interface Target {
    el: HTMLElement
    doc: Document
    win: Window
    kind: 'input' | 'textarea' | 'editable'
    multi: boolean
    offX: number
    offY: number
  }

  const OPTED_OUT =
    '[data-gramm="false"],[data-gramm_editor="false"],[data-enable-grammarly="false"],.cm-editor,.CodeMirror,.monaco-editor,.ace_editor'

  const eligible = (
    el: HTMLElement,
    doc: Document,
    win: Window,
    offX: number,
    offY: number,
  ): Target | null => {
    if (el === host || !el.closest) return null
    if (el.closest(OPTED_OUT) || el.getAttribute('spellcheck') === 'false') return null
    const base = { doc, win, offX, offY }
    if (el.tagName === 'TEXTAREA') {
      const t = el as HTMLTextAreaElement
      return t.readOnly || t.disabled ? null : { ...base, el, kind: 'textarea', multi: true }
    }
    if (el.tagName === 'INPUT') {
      const i = el as HTMLInputElement
      if (i.readOnly || i.disabled || !lib.inputAllowed(i.type, i.autocomplete)) return null
      return { ...base, el, kind: 'input', multi: false }
    }
    if (doc.designMode === 'on' && doc.body) {
      return { ...base, el: doc.body, kind: 'editable', multi: true }
    }
    if (el.isContentEditable) {
      let top = el
      while (top.parentElement && top.parentElement.isContentEditable) top = top.parentElement
      if (top.closest(OPTED_OUT) || top.getAttribute('spellcheck') === 'false') return null
      return { ...base, el: top, kind: 'editable', multi: true }
    }
    return null
  }

  /** The field with focus, looking into same-origin frames (rich editors live in them). */
  const focusedField = (): Target | null => {
    let doc: Document = document
    let win: Window = window
    let offX = 0
    let offY = 0
    let el = doc.activeElement as HTMLElement | null
    for (let depth = 0; el && el.tagName === 'IFRAME' && depth < 4; depth++) {
      const frame = el as HTMLIFrameElement
      let inner: Document | null
      try {
        inner = frame.contentDocument
      } catch {
        inner = null
      }
      if (!inner || !frame.contentWindow) return null
      const r = frame.getBoundingClientRect()
      offX += r.left + frame.clientLeft
      offY += r.top + frame.clientTop
      win = frame.contentWindow
      doc = inner
      el = inner.activeElement as HTMLElement | null
    }
    if (!el) return null
    return eligible(el, doc, win, offX, offY)
  }

  const enoughText = (t: Target): boolean => {
    const text = t.kind === 'editable' ? (t.el.textContent ?? '') : (t.el as HTMLInputElement).value
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    // A search box is a single line too: it needs a sentence before the mark shows.
    return t.multi ? words >= 1 : words >= 3
  }

  // Text as the reader sees it, with a map back to the DOM so a change can be
  // put exactly where it belongs — formatting around it untouched.
  interface Pos {
    node: Node
    offset: number
  }
  interface Entry {
    start: number
    end: number
    text: Text | null
    before: Pos
    after: Pos
    locked: boolean
  }
  interface TextMap {
    text: string
    entries: Entry[]
  }
  const BLOCK =
    /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DETAILS|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|SUMMARY|TABLE|TBODY|TD|TFOOT|TH|THEAD|TR|UL)$/

  const buildMap = (rootEl: HTMLElement, win: Window): TextMap => {
    let text = ''
    const entries: Entry[] = []
    let pendingBreak = false
    let lastWasBr = false
    let lastTextNewline = false
    let lastPos: Pos = { node: rootEl, offset: 0 }
    const keepsSpace = new Map<Element, boolean>()
    const preserves = (e: Element): boolean => {
      let v = keepsSpace.get(e)
      if (v === undefined) {
        const ws = win.getComputedStyle(e).whiteSpace
        v = ws.startsWith('pre') || ws === 'break-spaces'
        keepsSpace.set(e, v)
      }
      return v
    }
    const flush = (next: Pos): void => {
      if (pendingBreak && text.length > 0 && !text.endsWith('\n')) {
        entries.push({
          start: text.length,
          end: text.length + 1,
          text: null,
          before: lastPos,
          after: next,
          locked: false,
        })
        text += '\n'
      }
      pendingBreak = false
    }
    const contentAfter = (node: Node): boolean => {
      for (let n = node.nextSibling; n; n = n.nextSibling) {
        if (n.nodeType === 1 || (n.nodeType === 3 && (n as Text).data.length > 0)) return true
      }
      return false
    }
    const walk = (node: Node, locked: boolean): void => {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) {
          const t = child as Text
          if (!t.data) continue
          let data = t.data
          const parent = t.parentElement
          if (parent && !preserves(parent)) data = data.replace(/[\n\r\t]/g, ' ')
          data = data.replace(/\u00a0/g, ' ')
          flush({ node: t, offset: 0 })
          entries.push({
            start: text.length,
            end: text.length + data.length,
            text: t,
            before: { node: t, offset: 0 },
            after: { node: t, offset: data.length },
            locked,
          })
          text += data
          lastPos = { node: t, offset: data.length }
          lastTextNewline = data.endsWith('\n')
          lastWasBr = false
        } else if (child.nodeType === 1) {
          const e = child as HTMLElement
          const tag = e.tagName
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE' || tag === 'NOSCRIPT') {
            continue
          }
          if (tag === 'BR') {
            const parentNode = e.parentNode as Node
            const index = Array.prototype.indexOf.call(parentNode.childNodes, e)
            // Chromium keeps a trailing <br> after a typed newline so the
            // empty last line shows; it is not another line.
            if (!contentAfter(e) && lastTextNewline) {
              lastPos = { node: parentNode, offset: index + 1 }
              continue
            }
            flush({ node: parentNode, offset: index })
            entries.push({
              start: text.length,
              end: text.length + 1,
              text: null,
              before: { node: parentNode, offset: index },
              after: { node: parentNode, offset: index + 1 },
              locked,
            })
            text += '\n'
            lastPos = { node: parentNode, offset: index + 1 }
            lastWasBr = true
            lastTextNewline = false
            continue
          }
          const block = BLOCK.test(tag)
          if (block && text.length > 0 && !text.endsWith('\n')) pendingBreak = true
          walk(e, locked || e.getAttribute('contenteditable') === 'false')
          if (block && text.length > 0 && !lastWasBr) pendingBreak = true
        }
      }
    }
    walk(rootEl, false)
    return { text, entries }
  }

  const readField = (t: Target): string =>
    t.kind === 'editable' ? buildMap(t.el, t.win).text : (t.el as HTMLInputElement).value

  /** The selected part of the field, as offsets into its text, if any. */
  const selectionIn = (t: Target): [number, number] | null => {
    if (t.kind !== 'editable') {
      const i = t.el as HTMLInputElement
      const s = i.selectionStart ?? 0
      const e = i.selectionEnd ?? 0
      return e > s ? [s, e] : null
    }
    const sel = t.win.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
    if (!t.el.contains(sel.anchorNode) || !t.el.contains(sel.focusNode)) return null
    const map = buildMap(t.el, t.win)
    const indexOf = (node: Node | null, offset: number): number | null => {
      if (!node) return null
      for (const en of map.entries) if (en.text === node) return en.start + offset
      return null
    }
    const a = indexOf(sel.anchorNode, sel.anchorOffset)
    const b = indexOf(sel.focusNode, sel.focusOffset)
    if (a === null || b === null || a === b) return null
    return [Math.min(a, b), Math.max(a, b)]
  }

  interface Hunk {
    start: number
    end: number
    text: string
  }
  const hunksBetween = (before: string, after: string): Hunk[] => {
    const out: Hunk[] = []
    let offset = 0
    for (const seg of lib.diff(before, after)) {
      if ('same' in seg) {
        offset += seg.same.length
      } else {
        out.push({ start: offset, end: offset + seg.from.length, text: seg.to })
        offset += seg.from.length
      }
    }
    return out
  }

  const locate = (map: TextMap, k: number, edge: 'start' | 'end'): Pos | null => {
    let fallback: Pos | null = null
    for (const en of map.entries) {
      if (k < en.start) break
      if (en.text) {
        if (k > en.start && k < en.end) return { node: en.text, offset: k - en.start }
        if (k === en.start && edge === 'start') return { node: en.text, offset: 0 }
        if (k === en.end && edge === 'end') return { node: en.text, offset: en.end - en.start }
        if (k === en.start || k === en.end) fallback = { node: en.text, offset: k - en.start }
      } else if (k === en.start) {
        fallback = en.before
      } else if (k === en.end) {
        fallback = en.after
      }
    }
    if (fallback) return fallback
    const last = map.entries[map.entries.length - 1]
    return last ? last.after : null
  }

  const execEdit = (doc: Document, text: string): boolean =>
    text ? doc.execCommand('insertText', false, text) : doc.execCommand('delete', false)

  const applyHunk = (t: Target, hunk: Hunk): boolean => {
    if (t.kind !== 'editable') {
      const i = t.el as HTMLInputElement
      i.setSelectionRange(hunk.start, hunk.end)
      if (execEdit(t.doc, hunk.text)) return true
      // Some fields refuse editing commands; set the text directly and say so.
      i.setRangeText(hunk.text, hunk.start, hunk.end, 'end')
      i.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }
    const map = buildMap(t.el, t.win)
    // Never edit inside a mention chip or anything else the site locked.
    if (map.entries.some((en) => en.locked && en.start < hunk.end && en.end > hunk.start)) {
      return false
    }
    const a = locate(map, hunk.start, 'start')
    const b = locate(map, hunk.end, 'end')
    const sel = t.win.getSelection()
    if (!a || !b || !sel) return false
    try {
      const range = t.doc.createRange()
      range.setStart(a.node, a.offset)
      range.setEnd(b.node, b.offset)
      sel.removeAllRanges()
      sel.addRange(range)
    } catch {
      return false
    }
    return execEdit(t.doc, hunk.text)
  }

  /** Put `after` in the field in place of `before`, change by change, last first. */
  const applyText = (t: Target, before: string, after: string): number => {
    const hunks = hunksBetween(before, after)
    t.el.focus({ preventScroll: true })
    let applied = 0
    for (let k = hunks.length - 1; k >= 0; k--) {
      if (applyHunk(t, hunks[k] as Hunk)) applied++
    }
    return applied
  }

  // ---- placement -----------------------------------------------------------------------

  const rectOf = (t: Target): DOMRect => {
    const r = t.el.getBoundingClientRect()
    return new DOMRect(r.left + t.offX, r.top + t.offY, r.width, r.height)
  }

  /** Where the mark sits for a field, or null when the field is off screen. */
  const markSpot = (t: Target): { x: number; y: number } | null => {
    const r = rectOf(t)
    if (r.width < 60 || r.height < 16) return null
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null
    if (!t.multi) return { x: r.right - MARK - 6, y: r.top + (r.height - MARK) / 2 }
    // Inside the scrollbar, and above the fold of a box taller than the window.
    const inner = t.el.clientWidth ? r.left + t.el.clientLeft + t.el.clientWidth : r.right
    const x = Math.min(inner, r.right) - MARK - 6
    const y = Math.max(r.top + 4, Math.min(r.bottom, innerHeight) - MARK - 6)
    return { x, y }
  }

  const placeMark = (t: Target | null): void => {
    const spot = t ? markSpot(t) : null
    if (!spot) {
      mark.hidden = true
      return
    }
    mark.hidden = false
    mark.style.left = `${Math.round(spot.x)}px`
    mark.style.top = `${Math.round(spot.y)}px`
  }

  /** Beside the mark: below it if there is room, above it otherwise. */
  const placeBeside = (box: HTMLElement, t: Target): void => {
    const spot = markSpot(t) ?? {
      x: Math.min(innerWidth - MARK - 8, rectOf(t).right - MARK - 6),
      y: Math.min(innerHeight - MARK - 8, Math.max(8, rectOf(t).bottom - MARK - 6)),
    }
    const w = box.offsetWidth
    const h = box.offsetHeight
    let top = spot.y + MARK + 8
    if (top + h > innerHeight - 8) top = spot.y - h - 8
    top = Math.max(8, Math.min(top, innerHeight - h - 8))
    const left = Math.max(8, Math.min(spot.x + MARK - w, innerWidth - w - 8))
    box.style.left = `${Math.round(left)}px`
    box.style.top = `${Math.round(top)}px`
  }

  // ---- the card ------------------------------------------------------------------------

  interface Session {
    t: Target
    /** The whole field when the check started. */
    base: string
    start: number
    end: number
    /** What was checked first: the selection, or the whole field. */
    original: string
    edited: boolean
    label: string
  }

  let current: Target | null = null
  let session: Session | null = null
  let busy = false
  let ed: HTMLElement | null = null
  let chip: HTMLElement | null = null
  let statusEl: HTMLElement | null = null
  let recheckBtn: HTMLButtonElement | null = null
  let replaceBtn: HTMLButtonElement | null = null
  let markReset: ReturnType<typeof setTimeout> | null = null

  const setMarkState = (state: 'idle' | 'checking' | 'done' | 'error'): void => {
    mark.dataset.state = state
    badge.textContent = ''
    if (state === 'done') badge.appendChild(stroke(ICON.check))
    if (state === 'error') badge.textContent = '!'
    if (markReset) clearTimeout(markReset)
    markReset = null
    if (state === 'done') {
      markReset = setTimeout(() => {
        if (mark.dataset.state === 'done') mark.dataset.state = 'idle'
      }, 4000)
    }
  }

  const button = (label: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const b = make('button', primary ? 'btn primary' : 'btn', label)
    b.type = 'button'
    b.addEventListener('click', (e) => {
      if (!e.isTrusted) return
      onClick()
    })
    return b
  }

  const header = (label: string): HTMLElement => {
    const head = make('div', 'head')
    head.appendChild(spark('spark'))
    head.appendChild(make('span', 'name', NAME))
    head.appendChild(make('span', 'via', label))
    const close = make('button', 'x')
    close.type = 'button'
    close.setAttribute('aria-label', 'Close')
    close.title = 'Close (Esc)'
    close.appendChild(stroke(ICON.x))
    close.addEventListener('click', (e) => {
      if (e.isTrusted) dismiss()
    })
    head.appendChild(close)
    return head
  }

  const cardOpen = (): boolean => !card.hidden

  const showCard = (): void => {
    card.hidden = false
    if (session) placeBeside(card, session.t)
  }

  const closeCard = (): void => {
    card.hidden = true
    card.textContent = ''
    ed = null
    chip = null
    statusEl = null
    recheckBtn = null
    replaceBtn = null
    session = null
    schedule()
  }

  /** Close at the user's request, and give the box its caret back. */
  const dismiss = (): void => {
    const t = session?.t ?? null
    closeCard()
    if (t?.el.isConnected) t.el.focus({ preventScroll: true })
  }

  const setStatus = (tone: 'info' | 'ok' | 'warn', text: string): void => {
    if (!statusEl) return
    statusEl.textContent = ''
    statusEl.dataset.tone = tone
    if (tone !== 'info') statusEl.appendChild(stroke(tone === 'ok' ? ICON.check : ICON.alert))
    statusEl.appendChild(make('span', undefined, text))
  }

  const fixes = (n: number): string => `${n} ${n === 1 ? 'fix' : 'fixes'}`

  /** A card with a message instead of an editor: nothing to fix, or something went wrong. */
  const openMessage = (
    tone: 'ok' | 'bad',
    title: string,
    body: string,
    actions: HTMLButtonElement[],
    label: string,
  ): void => {
    card.textContent = ''
    ed = null
    card.appendChild(header(label))
    const msg = make('div', 'msg')
    msg.appendChild(stroke(tone === 'ok' ? ICON.check : ICON.alert, tone))
    const words = make('div')
    words.appendChild(make('b', undefined, title))
    words.appendChild(make('p', undefined, body))
    msg.appendChild(words)
    card.appendChild(msg)
    const acts = make('div', 'acts')
    acts.append(...actions)
    card.appendChild(acts)
    card.dataset.view = tone === 'ok' ? 'clean' : 'error'
    showCard()
    ;(actions[actions.length - 1] ?? card).focus?.({ preventScroll: true })
  }

  const readEditor = (): string => (ed ? buildMap(ed, window).text : '')

  const renderEditor = (segs: DiffSegment[]): void => {
    if (!ed) return
    ed.textContent = ''
    for (const seg of segs) {
      if ('same' in seg) {
        ed.appendChild(document.createTextNode(seg.same))
      } else {
        const m = make('mark', 'hl', seg.to)
        m.dataset.from = seg.from
        m.dataset.to = seg.to
        m.title = `Was “${seg.from}”`
        ed.appendChild(m)
      }
    }
  }

  const updateButtons = (): void => {
    if (!session) return
    if (recheckBtn) recheckBtn.disabled = busy || !session.edited
    if (replaceBtn) replaceBtn.disabled = busy || readEditor() === session.original
  }

  const hideChip = (): void => {
    chip?.remove()
    chip = null
  }

  const showChip = (m: HTMLElement): void => {
    hideChip()
    const kept = m.classList.contains('kept')
    const from = m.dataset.from ?? ''
    const to = m.dataset.to ?? ''
    chip = make('div', 'chip')
    chip.appendChild(make('span', undefined, kept ? 'Suggested' : 'Was'))
    chip.appendChild(make('q', undefined, kept ? to : from))
    chip.appendChild(
      button(kept ? 'Use fix' : 'Use original', () => {
        const nowKept = !m.classList.contains('kept')
        m.classList.toggle('kept', nowKept)
        m.textContent = nowKept ? from : to
        m.title = nowKept ? `Suggested “${to}”` : `Was “${from}”`
        hideChip()
        updateButtons()
      }),
    )
    card.appendChild(chip)
    const cr = card.getBoundingClientRect()
    const mr = m.getBoundingClientRect()
    const w = chip.offsetWidth
    chip.style.left = `${Math.max(8, Math.min(mr.left - cr.left, cr.width - w - 8))}px`
    chip.style.top = `${mr.bottom - cr.top + 6}px`
  }

  const openEditor = (segs: DiffSegment[], label: string): void => {
    card.textContent = ''
    card.appendChild(header(label))
    statusEl = make('div', 'status')
    statusEl.setAttribute('aria-live', 'polite')
    card.appendChild(statusEl)
    ed = make('div', 'ed')
    ed.setAttribute('role', 'textbox')
    ed.setAttribute('aria-multiline', 'true')
    ed.setAttribute('aria-label', 'Corrected text')
    ed.spellcheck = true
    try {
      ed.contentEditable = 'plaintext-only'
    } catch {
      ed.contentEditable = 'true'
    }
    if (ed.contentEditable !== 'plaintext-only') ed.contentEditable = 'true'
    renderEditor(segs)
    const editor = ed
    editor.addEventListener('input', () => {
      if (!session) return
      // A highlight you typed into is your text now.
      for (const m of Array.from(editor.querySelectorAll<HTMLElement>('mark.hl'))) {
        const expected = m.classList.contains('kept') ? m.dataset.from : m.dataset.to
        if (m.textContent !== expected) {
          while (m.firstChild) m.parentNode?.insertBefore(m.firstChild, m)
          m.remove()
        }
      }
      session.edited = true
      hideChip()
      setStatus('info', 'Edited. Recheck to check your changes.')
      updateButtons()
    })
    editor.addEventListener('paste', (e) => {
      // Plain text only, whatever the clipboard holds.
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      document.execCommand('insertText', false, text)
    })
    editor.addEventListener('click', (e) => {
      const m = (e.target as Element | null)?.closest?.('mark.hl') as HTMLElement | null
      if (m && e.isTrusted) showChip(m)
      else hideChip()
    })
    editor.addEventListener('scroll', hideChip)
    card.appendChild(editor)

    const foot = make('div', 'foot')
    foot.appendChild(
      button('Copy', () => {
        post({ type: 'copy', text: readEditor() })
        setStatus('ok', 'Copied to the clipboard.')
      }),
    )
    foot.appendChild(make('span', 'grow'))
    recheckBtn = button('Recheck', () => void recheck())
    recheckBtn.title = 'Check the text again, with your edits'
    replaceBtn = button('Replace', replace, true)
    replaceBtn.title = 'Put this text in the box (⌘↩)'
    foot.append(recheckBtn, replaceBtn)
    card.appendChild(foot)
    card.dataset.view = 'editor'
    const n = segs.filter((s) => 'from' in s).length
    setStatus('info', `${fixes(n)}. Edit anything, or click a highlight to see what it was.`)
    updateButtons()
    showCard()
    replaceBtn.focus({ preventScroll: true })
  }

  const failure = (res: Extract<GrammarPageResult, { ok: false }>, retry: () => void): void => {
    if (res.kind === 'key' || res.kind === 'notReady') {
      openMessage(
        'bad',
        res.message,
        res.kind === 'key'
          ? 'It may have been revoked or mistyped. Nothing on the page was changed.'
          : 'Nothing was sent.',
        [
          button('Close', dismiss),
          button(
            res.kind === 'key' ? 'Update key' : 'Open setup',
            () => {
              post({ type: 'settings' })
              closeCard()
            },
            true,
          ),
        ],
        res.label,
      )
      return
    }
    openMessage(
      'bad',
      res.message,
      'Your text is unchanged.',
      [button('Close', dismiss), button('Try again', retry, true)],
      res.label,
    )
  }

  const check = async (t: Target): Promise<void> => {
    if (busy || disposed) return
    const base = readField(t)
    const sel = selectionIn(t)
    const [start, end] = sel ?? [0, base.length]
    const original = base.slice(start, end)
    if (!original.trim()) return
    closeCard()
    hideToast()
    current = t
    const mine: Session = { t, base, start, end, original, edited: false, label: cfg.label }
    session = mine
    if (original.length > cfg.maxChars) {
      setMarkState('error')
      openMessage(
        'bad',
        `This ${sel ? 'selection' : 'box'} has ${original.length.toLocaleString()} characters.`,
        `${NAME} checks up to ${cfg.maxChars.toLocaleString()} at a time. Select a part, then click the mark again.`,
        [button('OK', dismiss, true)],
        cfg.label,
      )
      return
    }
    busy = true
    setMarkState('checking')
    const res = await request(original)
    busy = false
    if (session !== mine || disposed) {
      setMarkState('idle')
      return
    }
    mine.label = res.label
    if (!res.ok) {
      setMarkState('error')
      failure(res, () => void check(t))
      return
    }
    const segs = lib.diff(original, res.corrected)
    if (!segs.some((s) => 'from' in s)) {
      setMarkState('done')
      openMessage(
        'ok',
        'Looks good.',
        'No changes needed.',
        [button('OK', dismiss, true)],
        res.label,
      )
      return
    }
    setMarkState('idle')
    openEditor(segs, res.label)
  }

  const recheck = async (): Promise<void> => {
    const mine = session
    const editor = ed
    if (!mine || !editor || busy) return
    const text = readEditor()
    if (!text.trim()) return
    if (text.length > cfg.maxChars) {
      setStatus(
        'warn',
        `That is ${text.length.toLocaleString()} characters. ${NAME} checks up to ${cfg.maxChars.toLocaleString()} at a time.`,
      )
      return
    }
    busy = true
    hideChip()
    editor.setAttribute('aria-busy', 'true')
    editor.contentEditable = 'false'
    setStatus('info', 'Checking…')
    updateButtons()
    setMarkState('checking')
    const res = await request(text)
    busy = false
    if (session !== mine || ed !== editor) {
      setMarkState('idle')
      return
    }
    editor.removeAttribute('aria-busy')
    try {
      editor.contentEditable = 'plaintext-only'
    } catch {
      editor.contentEditable = 'true'
    }
    if (editor.contentEditable !== 'plaintext-only') editor.contentEditable = 'true'
    if (!res.ok) {
      setMarkState('error')
      setStatus('warn', `${res.message} Your text is unchanged.`)
      updateButtons()
      return
    }
    setMarkState('idle')
    mine.edited = false
    const segs = lib.diff(text, res.corrected)
    renderEditor(segs)
    const n = segs.filter((s) => 'from' in s).length
    if (n === 0) setStatus('ok', 'Rechecked: no more fixes.')
    else setStatus('info', `Rechecked: ${n} more ${n === 1 ? 'fix' : 'fixes'}.`)
    updateButtons()
  }

  // ---- replace and undo ------------------------------------------------------------------------

  let toastTimer: ReturnType<typeof setTimeout> | null = null
  let toastFor: Target | null = null

  const hideToast = (): void => {
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = null
    toast.hidden = true
    toast.textContent = ''
    toastFor = null
  }

  const showToast = (t: Target, text: string, undo: (() => void) | null, ok: boolean): void => {
    hideToast()
    if (ok) toast.appendChild(stroke(ICON.check))
    toast.appendChild(make('span', undefined, text))
    if (undo) toast.appendChild(button('Undo', undo))
    toast.appendChild(make('span', 'bar'))
    toast.dataset.view = ok ? 'replaced' : 'partial'
    toast.hidden = false
    toastFor = t
    placeBeside(toast, t)
    toastTimer = setTimeout(hideToast, 10_000)
  }

  const replace = (): void => {
    const mine = session
    if (!mine || busy) return
    const t = mine.t
    if (!t.el.isConnected || readField(t) !== mine.base) {
      setStatus(
        'warn',
        'This box changed after the check. Copy the text, or close this and check again.',
      )
      return
    }
    const edited = readEditor()
    const before = mine.base
    const after = before.slice(0, mine.start) + edited + before.slice(mine.end)
    if (after === before) {
      closeCard()
      return
    }
    const total = hunksBetween(before, after).length
    const applied = applyText(t, before, after)
    const now = readField(t)
    closeCard()
    const undo = (): void => {
      hideToast()
      if (readField(t) !== now) return
      applyText(t, now, before)
    }
    if (now === after) {
      setMarkState('done')
      showToast(t, `Replaced ${total} ${total === 1 ? 'change' : 'changes'}.`, undo, true)
      return
    }
    post({ type: 'copy', text: edited })
    showToast(
      t,
      applied > 0
        ? 'This box didn’t take every change. The corrected text is copied, so you can paste it.'
        : 'This box didn’t accept the changes. The corrected text is copied, so you can paste it.',
      applied > 0 ? undo : null,
      false,
    )
  }

  // ---- watching focus ----------------------------------------------------------------------

  let frame = 0
  const refresh = (): void => {
    frame = 0
    if (disposed) return
    attach()
    if (session && cardOpen()) {
      placeMark(session.t)
      placeBeside(card, session.t)
      return
    }
    const t = focusedField()
    if (t) current = t
    else if (document.activeElement !== host) current = null
    placeMark(current && current.el.isConnected && enoughText(current) ? current : null)
    if (toastFor && !toast.hidden) placeBeside(toast, toastFor)
  }
  const schedule = (): void => {
    if (!frame && !disposed) frame = requestAnimationFrame(refresh)
  }

  const onFocusIn = (e: Event): void => {
    // Moving to another field drops a card you have not touched.
    if (session && cardOpen() && !session.edited && e.target !== host) {
      const t = focusedField()
      if (t && t.el !== session.t.el) closeCard()
    }
    schedule()
  }
  const onInput = (e: Event): void => {
    if (e.target === host) return
    if (mark.dataset.state === 'done' || mark.dataset.state === 'error') setMarkState('idle')
    schedule()
  }
  const onPointerDown = (e: Event): void => {
    if (e.composedPath().includes(host)) return
    // A stray click never throws away edits; ✕ and Esc still do.
    if (session && cardOpen() && !session.edited) closeCard()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (!cardOpen()) return
    if (e.key === 'Escape') {
      e.preventDefault()
      if (chip) hideChip()
      else dismiss()
    } else if (
      e.key === 'Enter' &&
      (e.metaKey || e.ctrlKey) &&
      replaceBtn &&
      !replaceBtn.disabled
    ) {
      e.preventDefault()
      replace()
    }
  }

  mark.addEventListener('mousedown', (e) => {
    // Keep the caret and any selection where they are.
    e.preventDefault()
    e.stopPropagation()
  })
  mark.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.isTrusted) return
    if (cardOpen()) {
      if (!session?.edited) closeCard()
      return
    }
    if (current) void check(current)
  })
  card.addEventListener('keydown', onKey)
  // Esc from the page side too, while the caret is still in the box.
  const onDocKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && cardOpen() && !e.composedPath().includes(host)) dismiss()
  }
  document.addEventListener('keydown', onDocKey, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', schedule, true)
  document.addEventListener('input', onInput, true)
  document.addEventListener('scroll', schedule, true)
  document.addEventListener('mousedown', onPointerDown, true)
  window.addEventListener('resize', schedule)
  const interval = setInterval(refresh, 700)
  schedule()

  const api: PageApi = {
    next,
    deliver,
    trigger: () => {
      const t = focusedField() ?? current
      if (!t) return false
      void check(t)
      return true
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      clearInterval(interval)
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', schedule, true)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('scroll', schedule, true)
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onDocKey, true)
      window.removeEventListener('resize', schedule)
      hideToast()
      host.remove()
      for (const resolve of pending.values()) {
        resolve({
          ok: false,
          kind: 'notReady',
          message: `${NAME} is off for this site.`,
          label: cfg.label,
        })
      }
      pending.clear()
      if (waiter) {
        const resolve = waiter
        waiter = null
        resolve({ type: 'disposed' })
      }
      delete scope.__auraGrammar
    },
    configure: (nextCfg) => {
      Object.assign(cfg, nextCfg)
      mark.title = `Check grammar (${cfg.shortcut})`
    },
  }
  api.configure(cfg)
  scope.__auraGrammar = api
  return 'ready'
}
