import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { getThemeTokens } from '@everybox/shared'
import { useMobileStore } from '../store/useMobileStore'
import { AccountBadge } from './AccountBadge'

interface FocusPillStripProps {
  showUnreadCounts?: boolean
}

export const FocusPillStrip: React.FC<FocusPillStripProps> = ({ showUnreadCounts = true }) => {
  const themeId = useMobileStore((s) => s.themeId)
  const accounts = useMobileStore((s) => s.accounts)
  const threads = useMobileStore((s) => s.threads)
  const focusAccountId = useMobileStore((s) => s.focusAccountId)
  const selectFocusAccount = useMobileStore((s) => s.selectFocusAccount)

  const theme = getThemeTokens(themeId)
  const inboxThreads = threads.filter((t) => t.folderRole === 'inbox')
  const totalUnread = inboxThreads.filter((t) => !t.isRead).length

  const handlePress = (id: string | 'all') => {
    void Haptics.selectionAsync()
    selectFocusAccount(id)
  }

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: theme.bgMain,
          borderBottomColor: theme.borderSubtle
        }
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Pressable
          onPress={() => handlePress('all')}
          accessibilityRole="tab"
          accessibilityState={{ selected: focusAccountId === 'all' }}
          accessibilityLabel={`All accounts, ${totalUnread} unread`}
          style={styles.touchWrapper}
        >
          <View
            style={[
              styles.pill,
              {
                backgroundColor: focusAccountId === 'all' ? theme.bgSelected : theme.bgElevated,
                borderColor: focusAccountId === 'all' ? theme.accent : theme.borderSubtle
              }
            ]}
          >
            <Text
              style={[
                styles.pillLabel,
                { color: focusAccountId === 'all' ? theme.textPrimary : theme.textSecondary }
              ]}
            >
              All
            </Text>
            {showUnreadCounts && (
              <Text
                style={[
                  styles.pillCount,
                  { color: focusAccountId === 'all' ? theme.accentText : theme.textMuted }
                ]}
              >
                {totalUnread}
              </Text>
            )}
          </View>
        </Pressable>

        {accounts.map((acc) => {
          const unread = inboxThreads.filter((t) => t.accountId === acc.id && !t.isRead).length
          const active = focusAccountId === acc.id
          return (
            <Pressable
              key={acc.id}
              onPress={() => handlePress(acc.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${acc.name} account, ${unread} unread, tap to solo`}
              style={styles.touchWrapper}
            >
              <View
                style={[
                  styles.pill,
                  {
                    backgroundColor: active ? theme.bgSelected : theme.bgElevated,
                    borderColor: active ? acc.color : theme.borderSubtle
                  }
                ]}
              >
                <AccountBadge icon={acc.icon} color={acc.color} size="xs" />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.pillLabel,
                    { color: active ? theme.textPrimary : theme.textSecondary }
                  ]}
                >
                  {acc.name}
                </Text>
                {showUnreadCounts && unread > 0 && (
                  <Text
                    style={[
                      styles.pillCount,
                      { color: active ? theme.accentText : theme.textMuted }
                    ]}
                  >
                    {unread}
                  </Text>
                )}
              </View>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: 1
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 2,
    gap: 8,
    alignItems: 'center'
  },
  touchWrapper: {
    minHeight: 48,
    justifyContent: 'center'
  },
  pill: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600'
  },
  pillCount: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums']
  }
})
