import { useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { Check, CircleAlert, Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import {
  CUSTOM_BASE_URL_HINT,
  GRAMMAR_PROVIDERS,
  PROVIDER_PRESETS,
  type GrammarProvider,
  type GrammarSetup as SetupRequest,
} from '@shared/grammar'
import { invoke } from '@/lib/ipc'
import { Panel } from '@/components/Panel'
import { useGrammar, useActiveIncognito, useActiveSite } from '@/state/grammar'
import { useUi } from '@/state/ui'
import { AppIcon } from '../icons'

/** Setup: which AI, its key, and the first site. Mounted fresh on every open. */
export function GrammarSetup(): React.JSX.Element {
  const open = useUi((s) => s.grammarSetupOpen)
  return <AnimatePresence>{open && <GrammarSetupDialog />}</AnimatePresence>
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; ms: number }
  | { status: 'error'; message: string }

/**
 * What was on the form when a key link took you away to fetch a key, so
 * coming back does not mean starting again. Cleared on finishing.
 */
let draft: { provider: GrammarProvider; model: string; baseUrl: string } | null = null

const label = 'text-[11px] font-medium tracking-wide uppercase'

function GrammarSetupDialog(): React.JSX.Element {
  const close = useUi((s) => s.closeGrammarSetup)
  const info = useGrammar((s) => s.info)
  const site = useActiveSite()
  const incognito = useActiveIncognito()

  const startProvider = draft?.provider ?? info?.provider ?? 'gemini'
  const [step, setStep] = useState<1 | 2 | 3>(draft ? 2 : 1)
  const [provider, setProvider] = useState<GrammarProvider>(startProvider)
  const [model, setModel] = useState(
    draft?.model ??
      (info?.provider === startProvider && info.model
        ? info.model
        : PROVIDER_PRESETS[startProvider].defaultModel),
  )
  const [baseUrl, setBaseUrl] = useState(draft?.baseUrl ?? info?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [saving, setSaving] = useState(false)
  const [allowHere, setAllowHere] = useState(true)

  const preset = PROVIDER_PRESETS[provider]
  const keepsSavedKey = !!info?.hasKey && info.provider === provider
  const unchanged =
    !!info?.ready &&
    info.provider === provider &&
    info.model === model.trim() &&
    (provider !== 'custom' || info.baseUrl === baseUrl.trim()) &&
    !apiKey.trim()
  const canContinue = test.status === 'ok' || unchanged
  const canAllowHere = !!site && !incognito
  const alreadyAllowed = !!site && (info?.sites.includes(site) ?? false)

  const request = (): SetupRequest => ({
    provider,
    model: model.trim(),
    baseUrl: baseUrl.trim(),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  })

  const choose = (next: GrammarProvider): void => {
    setProvider(next)
    setModel(
      info?.provider === next && info.model ? info.model : PROVIDER_PRESETS[next].defaultModel,
    )
    setTest({ status: 'idle' })
  }

  const runTest = async (): Promise<void> => {
    setTest({ status: 'testing' })
    const res = await invoke('grammar:test', request())
    setTest(res.ok ? { status: 'ok', ms: res.ms } : { status: 'error', message: res.message })
  }

  const saveAndContinue = async (): Promise<void> => {
    setSaving(true)
    try {
      const saved = await invoke('grammar:save', request())
      useGrammar.getState().setInfo(saved)
      setApiKey('')
      setStep(3)
    } catch {
      setTest({ status: 'error', message: 'Aura couldn’t save these settings. Try again.' })
    } finally {
      setSaving(false)
    }
  }

  const finish = async (): Promise<void> => {
    draft = null
    // Setup is how the app gets switched on from the Store; make sure it is.
    await invoke('apps:setEnabled', { id: 'grammar', enabled: true })
    if (canAllowHere && allowHere && site && !alreadyAllowed) {
      const next = await invoke('grammar:setSite', { site, allowed: true })
      useGrammar.getState().setInfo(next)
    }
    close()
  }

  const openKeyPage = (): void => {
    if (!preset.keyUrl) return
    draft = { provider, model, baseUrl }
    void invoke('tabs:create', { url: preset.keyUrl, activate: true })
    close()
  }

  const dots = (
    <div className="flex gap-1.5" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: n === step ? 'var(--accent)' : 'var(--surface-glass-strong)' }}
        />
      ))}
    </div>
  )

  const primary =
    'cursor-pointer rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium disabled:cursor-default disabled:opacity-45'
  const secondary =
    'cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] transition-colors hover:bg-(--surface-hover)'

  return (
    <Panel
      overlayKey="grammar-setup"
      icon={<AppIcon id="grammar" size={17} />}
      title="Set up Aura Grammar Checker"
      onClose={close}
      testId="grammar-setup"
      width={520}
      footer={
        <div
          className="flex items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: 'var(--border-glass)' }}
        >
          {dots}
          <span className="flex-1" />
          {step > 1 && (
            <button
              type="button"
              className={secondary}
              style={{ color: 'var(--ink-2)' }}
              onClick={() => setStep(step === 3 ? 2 : 1)}
              data-testid="grammar-back"
            >
              Back
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              className={primary}
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              onClick={() => setStep(2)}
              data-testid="grammar-next"
            >
              Continue
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              className={primary}
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              disabled={!canContinue || saving}
              title={canContinue ? undefined : 'Test the connection first'}
              onClick={() => void saveAndContinue()}
              data-testid="grammar-next"
            >
              Continue
            </button>
          )}
          {step === 3 && (
            <button
              type="button"
              className={primary}
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              onClick={() => void finish()}
              data-testid="grammar-done"
            >
              Done
            </button>
          )}
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" data-step={step}>
        {step === 1 && (
          <div className="space-y-2">
            <h3 className="mb-3 text-[15px] font-medium" style={{ color: 'var(--ink-1)' }}>
              Which AI should check your writing?
            </h3>
            <div role="radiogroup" aria-label="AI provider" className="space-y-2">
              {GRAMMAR_PROVIDERS.map((id) => {
                const p = PROVIDER_PRESETS[id]
                const on = provider === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => choose(id)}
                    className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                    style={{
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border-glass)'}`,
                      background: on ? 'var(--surface-selected)' : 'transparent',
                    }}
                    data-testid="grammar-provider"
                    data-provider={id}
                  >
                    <span
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-full"
                      style={{
                        border: on ? '5px solid var(--accent)' : '1.5px solid var(--ink-3)',
                      }}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span
                        className="block text-[13px] font-medium"
                        style={{ color: 'var(--ink-1)' }}
                      >
                        {p.label}
                      </span>
                      <span className="block text-[12px]" style={{ color: 'var(--ink-3)' }}>
                        {p.note}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-[15px] font-medium" style={{ color: 'var(--ink-1)' }}>
              {provider === 'custom' ? 'Connect your server' : `Add your ${preset.label} key`}
            </h3>

            {provider === 'custom' && (
              <label className="block">
                <span className={label} style={{ color: 'var(--ink-3)' }}>
                  Server address
                </span>
                <input
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value)
                    setTest({ status: 'idle' })
                  }}
                  placeholder={CUSTOM_BASE_URL_HINT}
                  spellCheck={false}
                  className="mt-1 w-full rounded-lg px-3 py-2 font-mono text-[12.5px] outline-none"
                  style={{
                    color: 'var(--ink-1)',
                    background: 'var(--surface-glass)',
                    border: '1px solid var(--border-glass)',
                  }}
                  data-testid="grammar-base-url"
                />
                <span className="mt-1 block text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                  An OpenAI-compatible address. Ollama and LM Studio run on this computer, so text
                  never leaves it.
                </span>
              </label>
            )}

            <label className="block">
              <span className={label} style={{ color: 'var(--ink-3)' }}>
                API key{provider === 'custom' ? ' (if the server needs one)' : ''}
              </span>
              <span
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2"
                style={{
                  background: 'var(--surface-glass)',
                  border: '1px solid var(--border-glass)',
                }}
              >
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setTest({ status: 'idle' })
                  }}
                  placeholder={
                    keepsSavedKey && info?.keyHint
                      ? `Saved key ••••${info.keyHint}. Paste a new one to replace it.`
                      : 'Paste your key'
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] outline-none"
                  style={{ color: 'var(--ink-1)' }}
                  data-testid="grammar-key"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                  className="cursor-pointer"
                  style={{ color: 'var(--ink-3)' }}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </span>
              {preset.keyUrl && preset.keyLabel && (
                <button
                  type="button"
                  onClick={openKeyPage}
                  className="mt-1.5 cursor-pointer text-[12px]"
                  style={{ color: 'var(--accent)' }}
                  data-testid="grammar-key-link"
                >
                  {preset.keyLabel} ↗
                </button>
              )}
            </label>

            <label className="block">
              <span className={label} style={{ color: 'var(--ink-3)' }}>
                Model
              </span>
              <input
                value={model}
                onChange={(e) => {
                  setModel(e.target.value)
                  setTest({ status: 'idle' })
                }}
                list="grammar-models"
                placeholder={provider === 'custom' ? 'llama3.2' : preset.defaultModel}
                spellCheck={false}
                className="mt-1 w-full rounded-lg px-3 py-2 font-mono text-[12.5px] outline-none"
                style={{
                  color: 'var(--ink-1)',
                  background: 'var(--surface-glass)',
                  border: '1px solid var(--border-glass)',
                }}
                data-testid="grammar-model"
              />
              <datalist id="grammar-models">
                {preset.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              {preset.defaultModel && (
                <span className="mt-1 block text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
                  {preset.defaultModel} is quick and costs very little per check.
                </span>
              )}
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={test.status === 'testing'}
                className={secondary}
                style={{ color: 'var(--ink-1)', border: '1px solid var(--border-glass)' }}
                data-testid="grammar-test"
              >
                {test.status === 'testing' ? 'Testing…' : 'Test connection'}
              </button>
              <span
                className="flex min-w-0 items-start gap-1.5 text-[12px]"
                aria-live="polite"
                data-testid="grammar-test-result"
                data-ok={test.status === 'ok' || undefined}
                data-error={test.status === 'error' || undefined}
                style={{
                  color:
                    test.status === 'error'
                      ? 'var(--danger)'
                      : test.status === 'ok'
                        ? '#2fb36d'
                        : 'var(--ink-3)',
                }}
              >
                {test.status === 'testing' && <Loader2 size={13} className="mt-0.5 animate-spin" />}
                {test.status === 'ok' && <Check size={13} className="mt-0.5 shrink-0" />}
                {test.status === 'error' && <CircleAlert size={13} className="mt-0.5 shrink-0" />}
                {test.status === 'ok' &&
                  `Connected. A test check took ${(test.ms / 1000).toFixed(1)} s.`}
                {test.status === 'error' && test.message}
                {test.status === 'idle' &&
                  (unchanged ? 'Already connected.' : 'Continue unlocks once the test passes.')}
              </span>
            </div>

            <p className="flex gap-2 text-[11.5px]" style={{ color: 'var(--ink-3)' }}>
              <Lock size={13} className="mt-0.5 shrink-0" />
              {info?.keyEncrypted === false
                ? 'This computer has no system keychain, so the key is stored without encryption. Web pages can never read it.'
                : 'Saved encrypted in your system keychain. Web pages can never read it, and text goes straight from Aura to the provider.'}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h3 className="text-[15px] font-medium" style={{ color: 'var(--ink-1)' }}>
              Where should it work?
            </h3>
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              It stays off until you allow a site. Once a site is allowed, a small mark shows in the
              corner of the text box you are typing in. Click it to check your writing.
            </p>
            {canAllowHere ? (
              <div role="radiogroup" aria-label="First site" className="space-y-2">
                {[
                  {
                    on: true,
                    title: alreadyAllowed ? `Keep it on for ${site}` : `Allow on ${site}`,
                    note: 'The mark appears in this site’s text boxes.',
                  },
                  {
                    on: false,
                    title: 'I’ll choose later',
                    note: 'Use the button in the right bar, or right-click a page.',
                  },
                ].map((opt) => {
                  const chosen = allowHere === opt.on
                  return (
                    <button
                      key={String(opt.on)}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      onClick={() => setAllowHere(opt.on)}
                      className="flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left"
                      style={{
                        border: `1px solid ${chosen ? 'var(--accent)' : 'var(--border-glass)'}`,
                        background: chosen ? 'var(--surface-selected)' : 'transparent',
                      }}
                      data-testid={opt.on ? 'grammar-allow-here' : 'grammar-allow-later'}
                    >
                      <span
                        className="mt-0.5 h-4 w-4 shrink-0 rounded-full"
                        style={{
                          border: chosen ? '5px solid var(--accent)' : '1.5px solid var(--ink-3)',
                        }}
                        aria-hidden
                      />
                      <span>
                        <span
                          className="block text-[13px] font-medium"
                          style={{ color: 'var(--ink-1)' }}
                        >
                          {opt.title}
                        </span>
                        <span className="block text-[12px]" style={{ color: 'var(--ink-3)' }}>
                          {opt.note}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                {incognito
                  ? 'It never runs in a private Space. Allow a site from a normal Space with the button in the right bar.'
                  : 'Open a site, then switch it on with the button in the right bar.'}
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
