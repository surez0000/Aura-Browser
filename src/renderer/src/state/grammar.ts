import { create } from 'zustand'
import { siteOf, type GrammarInfo } from '@shared/grammar'
import { useTabs, selectActiveSpace, selectActiveTab } from './tabs'

/**
 * Mirror of the grammar checker's settings. Main owns them — and the key,
 * which never comes here; the chrome only ever sees its last four characters.
 */
export interface GrammarState {
  info: GrammarInfo | null
  setInfo(info: GrammarInfo): void
}

export const useGrammar = create<GrammarState>()((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
}))

/** The site of the page on screen, or null for Aura's own pages and blanks. */
export function useActiveSite(): string | null {
  return useTabs((s) => siteOf(selectActiveTab(s)?.url))
}

/** A private Space never runs the checker, whatever the allow-list says. */
export function useActiveIncognito(): boolean {
  return useTabs((s) => selectActiveSpace(s)?.incognito ?? false)
}

/** True when the mark can appear on the page on screen right now. */
export function useGrammarOnHere(): boolean {
  const site = useActiveSite()
  const incognito = useActiveIncognito()
  const ready = useGrammar((s) => s.info?.ready ?? false)
  const allowed = useGrammar((s) => (site ? (s.info?.sites.includes(site) ?? false) : false))
  return ready && allowed && !incognito
}
