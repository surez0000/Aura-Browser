import type { AuroraBridge } from './index'

declare global {
  interface Window {
    aurora: AuroraBridge
  }
}

export {}
