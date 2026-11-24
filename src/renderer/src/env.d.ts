import type { GlassmailAPI } from '../../preload/index'

declare global {
  interface Window {
    glassmail: GlassmailAPI
  }
}

export {}
