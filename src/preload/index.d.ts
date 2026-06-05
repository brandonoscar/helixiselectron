import type { HelixisApi } from '../shared/types'

declare global {
  interface Window {
    helixis: HelixisApi
  }
}

export {}
