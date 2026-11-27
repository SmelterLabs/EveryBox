import { requireOptionalNativeModule } from 'expo-modules-core'

export interface NativeBridgeStatus {
  engine: string
  platform: string
  sdkInt: number
  ready: boolean
}

interface EveryBoxMailNativeModuleType {
  getNativeBridgeStatus(): NativeBridgeStatus
}

const NativeModule = requireOptionalNativeModule<EveryBoxMailNativeModuleType>('EveryBoxMailNative')

export function getNativeBridgeStatus(): NativeBridgeStatus {
  if (NativeModule) {
    try {
      return NativeModule.getNativeBridgeStatus()
    } catch {
      // Fall through to safe fallback
    }
  }
  return {
    engine: 'everybox-mail-native',
    platform: 'unavailable',
    sdkInt: 0,
    ready: false
  }
}
