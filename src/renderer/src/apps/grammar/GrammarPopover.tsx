import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Globe, ShieldAlert, X } from 'lucide-react'
import { TabFavicon } from '@/components/sidebar/TabFavicon'
import { PROVIDER_PRESETS, providerLabel } from '@shared/grammar'
import { invoke, isMac } from '@/lib/ipc'
import { holdOverlay, releaseOverlay } from '@/lib/overlay'
import { Switch } from '@/components/Switch'
import { useGrammar, useActiveIncognito, useActiveSite } from '@/state/grammar'
import { useTabs, selectActiveTab } from '@/state/tabs'
import { useUi } from '@/state/ui'
import { AppIcon } from '../icons'

/**
 * The grammar checker's button in the right bar opens this: the switch for
 * the site on screen first, since that is what you came for, then every site
 * it may run on and the AI it uses. It sits over the page, so the page is a
 * snapshot while it is open (ADR-0003).
 */
export function GrammarPopover(): React.JSX.Element {
  const open = useUi((s) => s.grammarOpen)
  return <AnimatePresence>{open && <GrammarPopoverCard />}</AnimatePresence>
}

function GrammarPopoverCard(): React.JSX.Element {
  const close = useUi((s) => s.closeGrammar)
  const openSetup = useUi((s) => s.openGrammarSetup)
  const info = useGrammar((s) => s.info)
  const site = useActiveSite()
  const incognito = useActiveIncognito()
  const tab = useTabs(selectActiveTab)

  useEffect(() => {
    void holdOverlay('grammar')
    return () => releaseOverlay('grammar')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const allowed = !!site && (info?.sites.includes(site) ?? false)
  const setSite = (s: string, on: boolean): void => {
    void invoke('grammar:setSite', { site: s, allowed: on }).then(useGrammar.getState().setInfo)
  }
  const siteNote = !site
    ? 'Open a web page to use it there.'
    : incognito
      ? 'Always off in private Spaces.'
      : allowed
        ? 'The mark shows in text boxes here.'
        : 'Off. Nothing is sent from this site.'

  return (
    <>
      <div className="absolute inset-0 z-40" onClick={close} aria-hidden />
      <motion.div
        className="popover-over-page absolute right-[56px] bottom-3 z-50 w-[320px] overflow-hidden rounded-2xl shadow-2xl"
        style={{ border: '1px solid var(--border-glass)' }}
        initial={{ y: 8, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 6, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 520, damping: 36 }}
        role="dialog"
        aria-label="Aura Grammar Checker"
        data-testid="grammar-popover"
      >
        <div
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{ borderColor: 'var(--border-glass)' }}
        >
          <span style={{ color: 'var(--accent)' }}>
            <AppIcon id="grammar" size={15} />
          </span>
          <span className="flex-1 text-[13.5px] font-medium" style={{ color: 'var(--ink-1)' }}>
            Aura Grammar Checker
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1 transition-colors hover:bg-(--surface-hover)"
            style={{ color: 'var(--ink-3)' }}
            data-testid="grammar-popover-close"
          >
            <X size={15} />
          </button>
        </div>

        {!info?.ready ? (
          <div className="px-4 py-4">
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Choose the AI that checks your writing and add your key. It takes a minute.
            </p>
            <button
              type="button"
              onClick={openSetup}
              className="mt-3 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              data-testid="grammar-popover-setup"
            >
              Set up
            </button>
          </div>
        ) : (
          <>
            <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-glass)' }}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {tab && site ? (
                    <TabFavicon tab={tab} size={14} />
                  ) : (
                    <Globe size={14} style={{ color: 'var(--ink-3)' }} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[13px] font-medium"
                    style={{ color: 'var(--ink-1)' }}
                    data-testid="grammar-current-site"
                  >
                    {site ?? 'No web page'}
                  </div>
                  <div className="text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                    {siteNote}
                  </div>
                </div>
                <Switch
                  on={allowed && !incognito}
                  disabled={!site || incognito}
                  label={site ? `Use Aura Grammar Checker on ${site}` : 'No web page open'}
                  onChange={(on) => site && setSite(site, on)}
                  testId="grammar-site-toggle"
                />
              </div>
            </div>

            <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-glass)' }}>
              <div className="mb-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
                Allowed sites
              </div>
              {info.sites.length === 0 ? (
                <p className="py-1 text-[12px]" style={{ color: 'var(--ink-3)' }}>
                  None yet. Switch it on above for the site you are on.
                </p>
              ) : (
                <ul className="max-h-40 overflow-y-auto">
                  {info.sites.map((s) => (
                    <li
                      key={s}
                      className="group flex items-center gap-2 py-0.5"
                      data-testid="grammar-site-row"
                      data-site={s}
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-[12.5px]"
                        style={{ color: 'var(--ink-2)' }}
                      >
                        {s}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSite(s, false)}
                        aria-label={`Stop Aura Grammar Checker on ${s}`}
                        title="Remove"
                        className="cursor-pointer rounded-md p-1 transition-colors hover:bg-(--surface-hover)"
                        style={{ color: 'var(--ink-3)' }}
                        data-testid="grammar-site-remove"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-3">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: '#2fb36d' }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px]" style={{ color: 'var(--ink-1)' }}>
                  {info.provider ? PROVIDER_PRESETS[info.provider].label : 'AI'}
                </div>
                <div
                  className="truncate text-[11.5px]"
                  style={{ color: 'var(--ink-3)' }}
                  data-testid="grammar-connection"
                >
                  {info.model}
                  {info.provider === 'custom' && ` · ${providerLabel('custom', info.baseUrl)}`}
                  {info.hasKey && info.keyHint && ` · key ••••${info.keyHint}`}
                </div>
              </div>
              <button
                type="button"
                onClick={openSetup}
                className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12.5px] font-medium"
                style={{ color: 'var(--accent)' }}
                data-testid="grammar-change"
              >
                Change
              </button>
            </div>
            {info.hasKey && !info.keyEncrypted && (
              <div className="flex gap-2 px-4 pb-3 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                No system keychain here, so the key is stored without encryption.
              </div>
            )}
            <div
              className="border-t px-4 py-2.5 text-[11.5px]"
              style={{ borderColor: 'var(--border-glass)', color: 'var(--ink-3)' }}
            >
              {isMac() ? '⌥⌘G' : 'Ctrl+Alt+G'} checks the box you are typing in.
            </div>
          </>
        )}
      </motion.div>
    </>
  )
}
