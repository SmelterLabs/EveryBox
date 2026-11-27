import 'react-native-gesture-handler'
import React from 'react'
import { registerRootComponent } from 'expo'
import { ExpoRoot } from 'expo-router'

export function App() {
  const ctx = require.context(
    './app',
    true,
    /^(?:\.\/)(?!(?:(?:(?:.*\+api)|(?:\+html)))\.[tj]sx?$).*(?:\.ios|\.web)?\.[tj]sx?$/,
    'sync'
  )
  return React.createElement(ExpoRoot, { context: ctx })
}

registerRootComponent(App)
