import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'EveryBox',
  slug: 'everybox',
  version: '0.1.0',
  scheme: 'everybox',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  icon: '../../build/icon.png',
  splash: {
    image: '../../build/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#11151d'
  },
  android: {
    package: 'app.everybox.mobile',
    versionCode: 1,
    edgeToEdgeEnabled: true,
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: '../../build/icon.png',
      backgroundColor: '#11151d'
    },
    softwareKeyboardLayoutMode: 'resize'
  },
  plugins: [
    'expo-router',
    [
      'expo-sqlite',
      {
        enableFTS: true,
        useSQLCipher: false
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  }
}

export default config
