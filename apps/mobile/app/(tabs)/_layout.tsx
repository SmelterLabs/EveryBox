import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Calendar, Inbox, Search, Sparkles, type LucideIcon } from 'lucide-react-native'
import { getThemeTokens } from '@everybox/shared'
import { useMobileStore } from '../../src/store/useMobileStore'
import { UndoFuseSnackbar } from '../../src/components/UndoFuseSnackbar'

export default function TabsLayout() {
  const themeId = useMobileStore((s) => s.themeId)
  const theme = getThemeTokens(themeId)
  const insets = useSafeAreaInsets()

  const navHeight = 68 + insets.bottom

  const renderTabIcon = (focused: boolean, Icon: LucideIcon) => (
    <View
      style={[
        styles.pillIndicator,
        { backgroundColor: focused ? theme.accentSoft : 'transparent' }
      ]}
    >
      <Icon
        size={20}
        color={focused ? theme.accentText : theme.textMuted}
        strokeWidth={focused ? 2.2 : 1.9}
      />
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.bgMain }}>
      <Tabs
        screenListeners={{
          tabPress: () => {
            void Haptics.selectionAsync()
          }
        }}
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: theme.bgNavBar,
            borderTopColor: theme.borderSubtle,
            borderTopWidth: 1,
            height: navHeight,
            paddingTop: 8,
            paddingBottom: Math.max(8, insets.bottom),
            elevation: 0
          },
          tabBarActiveTintColor: theme.textPrimary,
          tabBarInactiveTintColor: theme.textMuted,
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            marginTop: 2
          }
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Mail',
            tabBarIcon: ({ focused }) => renderTabIcon(focused, Inbox)
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarIcon: ({ focused }) => renderTabIcon(focused, Calendar)
          }}
        />
        <Tabs.Screen
          name="brief"
          options={{
            title: 'Brief',
            tabBarIcon: ({ focused }) => renderTabIcon(focused, Sparkles)
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ focused }) => renderTabIcon(focused, Search)
          }}
        />
      </Tabs>

      <UndoFuseSnackbar bottomOffset={navHeight + 12} />
    </View>
  )
}

const styles = StyleSheet.create({
  pillIndicator: {
    width: 58,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
