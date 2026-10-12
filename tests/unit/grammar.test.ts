import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRAMMAR_CONFIG,
  GRAMMAR_SYSTEM_PROMPT,
  applySegments,
  buildGrammarRequest,
  changeCount,
  cleanCorrection,
  diffSegments,
  errorForStatus,
  inputTypeAllowed,
  isReady,
  parseGrammarResponse,
  providerLabel,
  siteOf,
  type DiffSegment,
} from '@shared/grammar'

const rebuild = (segs: DiffSegment[], side: 'from' | 'to'): string =>
  segs.map((s) => ('same' in s ? s.same : s[side])).join('')

describe('diffSegments', () => {
  const before =
    'Hi Priya,\n\nI has attached the report for last week. Their are two issue we need to discuss before friday, please let me know when your free.\n\nThanks,\nSam'
  const after =
    "Hi Priya,\n\nI have attached the report for last week. There are two issues we need to discuss before Friday. Please let me know when you're free.\n\nThanks,\nSam"

  it('finds each fix, grouping changes that only a space keeps apart', () => {
    const segs = diffSegments(before, after)
    const changes = segs.filter((s): s is { from: string; to: string } => 'from' in s)
    expect(changes).toEqual([
      { from: 'has', to: 'have' },
      { from: 'Their', to: 'There' },
      { from: 'issue', to: 'issues' },
      { from: 'friday, please', to: 'Friday. Please' },
      { from: 'your', to: "you're" },
    ])
    expect(changeCount(segs)).toBe(5)
  })

  it('rebuilds both texts exactly', () => {
    const segs = diffSegments(before, after)
    expect(rebuild(segs, 'from')).toBe(before)
    expect(rebuild(segs, 'to')).toBe(after)
  })

  it('keeps the original wording for the changes asked to stay', () => {
    const segs = diffSegments(before, after)
    const firstChange = segs.findIndex((s) => 'from' in s)
    const kept = applySegments(segs, new Set([firstChange]))
    expect(kept).toContain('I has attached')
    expect(kept).toContain('There are two issues')
  })

  it('returns one unchanged run for identical text', () => {
    expect(diffSegments('All good here.', 'All good here.')).toEqual([{ same: 'All good here.' }])
  })

  it('gives a pure deletion a word to point at', () => {
    const segs = diffSegments('I saw the the cat.', 'I saw the cat.')
    const change = segs.find((s): s is { from: string; to: string } => 'from' in s)
    expect(change?.to.trim()).not.toBe('')
    expect(rebuild(segs, 'from')).toBe('I saw the the cat.')
    expect(rebuild(segs, 'to')).toBe('I saw the cat.')
  })

  it('gives a pure insertion an original to go back to', () => {
    const segs = diffSegments('I attached it.', 'I have attached it.')
    const change = segs.find((s): s is { from: string; to: string } => 'from' in s)
    expect(change?.from.trim()).not.toBe('')
    expect(change?.to.trim()).not.toBe('')
    expect(rebuild(segs, 'from')).toBe('I attached it.')
    expect(rebuild(segs, 'to')).toBe('I have attached it.')
  })

  it('handles a deletion at the very end', () => {
    const segs = diffSegments('Done done', 'Done')
    expect(rebuild(segs, 'from')).toBe('Done done')
    expect(rebuild(segs, 'to')).toBe('Done')
    expect(segs.every((s) => 'same' in s || s.to.trim() !== '')).toBe(true)
  })

  it('handles empty text on either side', () => {
    expect(rebuild(diffSegments('', 'Hello'), 'to')).toBe('Hello')
    expect(rebuild(diffSegments('Hello', ''), 'from')).toBe('Hello')
  })

  it('round-trips random edits', () => {
    const words = ['the', 'a', 'cat', 'sat', 'on', 'mat', 'quickly', 'teh', 'is', 'are', ',', '.']
    let seed = 7
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    for (let run = 0; run < 200; run++) {
      const make = (): string =>
        Array.from({ length: 3 + rand(12) }, () => words[rand(words.length)]).join(
          rand(5) === 0 ? '\n' : ' ',
        )
      const x = make()
      const y = rand(3) === 0 ? x : make()
      const segs = diffSegments(x, y)
      expect(rebuild(segs, 'from')).toBe(x)
      expect(rebuild(segs, 'to')).toBe(y)
      for (const s of segs) if ('from' in s) expect(s.from !== s.to).toBe(true)
    }
  })
})

describe('cleanCorrection', () => {
  it('drops tags and fences a model adds anyway', () => {
    expect(cleanCorrection('I has it.', '<text>\nI have it.\n</text>')).toBe('I have it.')
    expect(cleanCorrection('I has it.', '```\nI have it.\n```')).toBe('I have it.')
  })

  it('keeps the whitespace around the original', () => {
    expect(cleanCorrection('  i has it.\n', 'I have it.')).toBe('  I have it.\n')
  })

  it('refuses a reply that is an answer, not a correction', () => {
    const original = 'Can you tell me what the capital of France is please?'
    const answer =
      'The capital of France is Paris. It has been the capital since the 10th century and is the largest city in the country by far, with millions of residents.'
    expect(cleanCorrection(original, answer)).toBeNull()
    expect(cleanCorrection(original, '')).toBeNull()
  })
})

describe('requests', () => {
  it('builds an Anthropic Messages request with the fixed prompt', () => {
    const req = buildGrammarRequest(
      { provider: 'anthropic', model: 'claude-haiku-4-5', baseUrl: '', apiKey: 'sk-ant-x' },
      'i has it',
    )
    expect(req.url).toBe('https://api.anthropic.com/v1/messages')
    expect(req.headers['x-api-key']).toBe('sk-ant-x')
    expect(req.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(req.body)
    expect(body.model).toBe('claude-haiku-4-5')
    expect(body.system).toBe(GRAMMAR_SYSTEM_PROMPT)
    expect(body.messages).toEqual([{ role: 'user', content: '<text>\ni has it\n</text>' }])
    expect(body.max_tokens).toBeGreaterThan(1000)
    expect(body).not.toHaveProperty('temperature')
  })

  it('sends Gemini to its OpenAI-compatible endpoint', () => {
    const req = buildGrammarRequest(
      { provider: 'gemini', model: 'gemini-3.5-flash-lite', baseUrl: '', apiKey: 'AIza' },
      'x',
    )
    expect(req.url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    expect(req.headers.authorization).toBe('Bearer AIza')
    const body = JSON.parse(req.body)
    expect(body.messages[0]).toEqual({ role: 'system', content: GRAMMAR_SYSTEM_PROMPT })
    expect(body).not.toHaveProperty('reasoning_effort')
  })

  it('asks the original GPT-5 models for minimal reasoning only', () => {
    const nano = JSON.parse(
      buildGrammarRequest(
        { provider: 'openai', model: 'gpt-5-nano', baseUrl: '', apiKey: 'k' },
        'x',
      ).body,
    )
    expect(nano.reasoning_effort).toBe('minimal')
    const other = JSON.parse(
      buildGrammarRequest(
        { provider: 'openai', model: 'gpt-4o-mini', baseUrl: '', apiKey: 'k' },
        'x',
      ).body,
    )
    expect(other).not.toHaveProperty('reasoning_effort')
  })

  it('lets a custom endpoint run without a key', () => {
    const req = buildGrammarRequest(
      {
        provider: 'custom',
        model: 'llama3.2',
        baseUrl: 'http://localhost:11434/v1/',
        apiKey: null,
      },
      'x',
    )
    expect(req.url).toBe('http://localhost:11434/v1/chat/completions')
    expect(req.headers).not.toHaveProperty('authorization')
  })
})

describe('responses', () => {
  it('reads chat completions and Anthropic messages', () => {
    expect(
      parseGrammarResponse(
        'openai',
        200,
        { choices: [{ message: { content: 'Fixed.' } }] },
        'OpenAI',
      ),
    ).toEqual({ ok: true, text: 'Fixed.' })
    expect(
      parseGrammarResponse(
        'anthropic',
        200,
        { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Fixed.' }] },
        'Anthropic',
      ),
    ).toEqual({ ok: true, text: 'Fixed.' })
  })

  it('names a refusal as a refusal', () => {
    const r = parseGrammarResponse(
      'anthropic',
      200,
      { stop_reason: 'refusal', content: [] },
      'Anthropic',
    )
    expect(r.ok).toBe(false)
    expect(!r.ok && r.kind).toBe('refused')
  })

  it('maps HTTP failures to what a person can act on', () => {
    expect(errorForStatus(401, {}, 'Gemini').kind).toBe('key')
    expect(errorForStatus(403, {}, 'Gemini').kind).toBe('key')
    expect(errorForStatus(404, {}, 'Gemini').kind).toBe('model')
    expect(errorForStatus(400, { error: { message: 'model not found: x' } }, 'Gemini').kind).toBe(
      'model',
    )
    expect(errorForStatus(429, {}, 'Gemini').kind).toBe('rate')
    const server = errorForStatus(500, [{ error: { message: 'boom' } }], 'Gemini')
    expect(server.kind).toBe('server')
    expect(server.message).toContain('boom')
  })

  it('calls an unreadable body unexpected', () => {
    const r = parseGrammarResponse('openai', 200, { nope: true }, 'OpenAI')
    expect(!r.ok && r.kind).toBe('unexpected')
  })
})

describe('setup and sites', () => {
  it('is ready only with a provider, a model and a key where one is needed', () => {
    expect(isReady(DEFAULT_GRAMMAR_CONFIG, false)).toBe(false)
    const gemini = { ...DEFAULT_GRAMMAR_CONFIG, provider: 'gemini' as const, model: 'm' }
    expect(isReady(gemini, false)).toBe(false)
    expect(isReady(gemini, true)).toBe(true)
    const custom = { ...DEFAULT_GRAMMAR_CONFIG, provider: 'custom' as const, model: 'm' }
    expect(isReady(custom, false)).toBe(false)
    expect(isReady({ ...custom, baseUrl: 'http://localhost:11434/v1' }, false)).toBe(true)
  })

  it('keys sites by host and port, web pages only', () => {
    expect(siteOf('https://Mail.Example.com/inbox?x=1')).toBe('mail.example.com')
    expect(siteOf('http://127.0.0.1:5173/a')).toBe('127.0.0.1:5173')
    expect(siteOf('data:text/html,hi')).toBeNull()
    expect(siteOf('about:blank')).toBeNull()
    expect(siteOf('not a url')).toBeNull()
  })

  it('labels providers the way the card shows them', () => {
    expect(providerLabel('gemini')).toBe('Gemini')
    expect(providerLabel('custom', 'http://localhost:11434/v1')).toBe('localhost:11434')
  })

  it('lets only plain text and search fields carry the mark', () => {
    expect(inputTypeAllowed('text', '')).toBe(true)
    expect(inputTypeAllowed('', '')).toBe(true)
    expect(inputTypeAllowed('search', 'off')).toBe(true)
    expect(inputTypeAllowed('password', '')).toBe(false)
    expect(inputTypeAllowed('email', '')).toBe(false)
    expect(inputTypeAllowed('text', 'username')).toBe(false)
    expect(inputTypeAllowed('text', 'cc-number')).toBe(false)
    expect(inputTypeAllowed('text', 'one-time-code')).toBe(false)
  })
})
