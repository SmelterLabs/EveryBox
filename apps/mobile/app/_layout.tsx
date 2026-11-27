import React from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { getThemeTokens } from '@everybox/shared'
import { useMobileStore } from '../src/store/useMobileStore'

export default function RootLayout() {
  const themeId = useMobileStore((s) => s.themeId)
  const theme = getThemeTokens(themeId)

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.bgMain }}>
      <SafeAreaProvider>
        <StatusBar style={theme.statusBarStyle} translucent backgroundColor="transparent" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.bgMain },
            animation: 'slide_from_right'
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="thread/[id]" options={{ headerShown: false }} />
          <Stack.Screen
            name="compose"
            options={{
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom'
            }}
          />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
