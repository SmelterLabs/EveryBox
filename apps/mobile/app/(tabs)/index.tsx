import React, { useMemo, useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import * as Haptics from 'expo-haptics'
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  Pencil,
  RefreshCw,
  Settings
} from 'lucide-react-native'
import { getThemeTokens, type InboxCategory } from '@everybox/shared'
import { useMobileStore } from '../../src/store/useMobileStore'
import type { MobileThreadItem } from '../../src/data/demoData'
import { FocusPillStrip } from '../../src/components/FocusPillStrip'
import { SwipeableThreadRow } from '../../src/components/SwipeableThreadRow'

type ListRow =
  | { type: 'header'; id: string; label: string; count: number }
  | { type: 'thread'; id: string; thread: MobileThreadItem }

export default function UnifiedInboxScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const themeId = useMobileStore((s) => s.themeId)
  const rowStyle = useMobileStore((s) => s.rowStyle)
  const focusAccountId = useMobileStore((s) => s.focusAccountId)
  const category = useMobileStore((s) => s.category)
  const threads = useMobileStore((s) => s.threads)
  const isSyncing = useMobileStore((s) => s.isSyncing)
  const hasToast = useMobileStore((s) => Boolean(s.toast))
  const setCategory = useMobileStore((s) => s.setCategory)
  const selectFocusAccount = useMobileStore((s) => s.selectFocusAccount)
  const archiveThread = useMobileStore((s) => s.archiveThread)
  const trashThread = useMobileStore((s) => s.trashThread)
  const markThreadRead = useMobileStore((s) => s.markThreadRead)
  const triggerSync = useMobileStore((s) => s.triggerSync)

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const theme = getThemeTokens(themeId)

  const scopedThreads = useMemo(
    () =>
      threads.filter(
        (t) =>
          t.folderRole === 'inbox' &&
          (focusAccountId === 'all' || t.accountId === focusAccountId)
      ),
    [threads, focusAccountId]
  )

  const totalUnread = useMemo(
    () => scopedThreads.filter((t) => !t.isRead).length,
    [scopedThreads]
  )
  const peopleUnread = useMemo(
    () => scopedThreads.filter((t) => t.category === 'people' && !t.isRead).length,
    [scopedThreads]
  )
  const updatesUnread = useMemo(
    () => scopedThreads.filter((t) => t.category === 'updates' && !t.isRead).length,
    [scopedThreads]
  )

  const visibleThreads = useMemo(
    () =>
      scopedThreads.filter((t) => category === 'all' || t.category === category),
    [scopedThreads, category]
  )

  const listData = useMemo<ListRow[]>(() => {
    const groups: Record<string, MobileThreadItem[]> = {}
    for (const t of visibleThreads) {
      if (!groups[t.group]) groups[t.group] = []
      groups[t.group].push(t)
    }
    const rows: ListRow[] = []
    for (const [label, items] of Object.entries(groups)) {
      rows.push({ type: 'header', id: `hdr-${label}`, label, count: items.length })
      if (!collapsedGroups[label]) {
        for (const thread of items) {
          rows.push({ type: 'thread', id: thread.id, thread })
        }
      }
    }
    return rows
  }, [visibleThreads, collapsedGroups])

  const showAccountTint = focusAccountId === 'all'

  const categories: { id: InboxCategory; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'people', label: 'People', count: peopleUnread },
    { id: 'updates', label: 'Updates', count: updatesUnread }
  ]

  const openThread = (thread: MobileThreadItem) => {
    if (!thread.isRead) markThreadRead(thread.id, true)
    router.push({ pathname: '/thread/[id]', params: { id: thread.id } })
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bgList }]}>
      {/* Top App Bar */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 4,
            backgroundColor: theme.bgMain
          }
        ]}
      >
        <View style={styles.topLeft}>
          <View style={[styles.brandBadge, { backgroundColor: theme.accentSoft }]}>
            <Inbox size={18} color={theme.accentText} strokeWidth={2.2} />
          </View>
          <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>Inbox</Text>
          <Text style={[styles.unreadMeta, { color: theme.textMuted }]}>
            {totalUnread} unread
          </Text>
        </View>

        <View style={styles.topRight}>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync()
              triggerSync()
            }}
            accessibilityRole="button"
            accessibilityLabel="Sync mail"
            style={styles.iconBtn}
          >
            <RefreshCw size={20} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync()
              router.push('/settings')
            }}
            accessibilityRole="button"
            accessibilityLabel="Accounts and Settings"
            style={styles.iconBtn}
          >
            <Settings size={20} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Synchronized Multi-Account Focus Pill Strip */}
      <FocusPillStrip showUnreadCounts />

      {/* Category Filter Row */}
      <View
        style={[
          styles.filterRow,
          { backgroundColor: theme.bgList, borderBottomColor: theme.borderSubtle }
        ]}
      >
        <View style={styles.catGroup}>
          {categories.map((c) => {
            const active = category === c.id
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  void Haptics.selectionAsync()
                  setCategory(c.id)
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={styles.catHit}
              >
                <View
                  style={[
                    styles.catPill,
                    { backgroundColor: active ? theme.bgElevated : 'transparent' }
                  ]}
                >
                  <Text
                    style={[
                      styles.catLabel,
                      { color: active ? theme.textPrimary : theme.textMuted }
                    ]}
                  >
                    {c.label}
                  </Text>
                  {typeof c.count === 'number' && c.count > 0 && (
                    <Text style={[styles.catCount, { color: theme.textMuted }]}>{c.count}</Text>
                  )}
                </View>
              </Pressable>
            )
          })}
        </View>

        <Text style={[styles.swipeHint, { color: theme.textMuted }]}>Swipe to triage</Text>
      </View>

      {/* Date-Grouped FlashList */}
      {visibleThreads.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.bgElevated }]}>
            <Inbox size={26} color={theme.accentText} strokeWidth={2} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>All clear here</Text>
          <Text style={[styles.emptySub, { color: theme.textMuted }]}>
            No conversations match this account and filter.
          </Text>
          {(focusAccountId !== 'all' || category !== 'all') && (
            <Pressable
              onPress={() => {
                selectFocusAccount('all')
                setCategory('all')
              }}
              style={[styles.emptyCta, { backgroundColor: theme.accentSoft }]}
            >
              <Text style={[styles.emptyCtaText, { color: theme.accentText }]}>
                Show all accounts
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlashList
          data={listData}
          keyExtractor={(item) => item.id}
          estimatedItemSize={86}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: 108 }}
          refreshControl={
            <RefreshControl
              refreshing={isSyncing}
              onRefresh={triggerSync}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              const collapsed = Boolean(collapsedGroups[item.label])
              return (
                <Pressable
                  onPress={() =>
                    setCollapsedGroups((prev) => ({
                      ...prev,
                      [item.label]: !prev[item.label]
                    }))
                  }
                  style={[styles.groupHdr, { backgroundColor: theme.bgElevated }]}
                >
                  <View style={styles.groupHdrLeft}>
                    {collapsed ? (
                      <ChevronRight size={15} color={theme.textSecondary} />
                    ) : (
                      <ChevronDown size={15} color={theme.textSecondary} />
                    )}
                    <Text style={[styles.groupHdrLabel, { color: theme.textSecondary }]}>
                      {item.label}
                    </Text>
                  </View>
                  <Text style={[styles.groupHdrCount, { color: theme.textMuted }]}>
                    {item.count}
                  </Text>
                </Pressable>
              )
            }

            return (
              <SwipeableThreadRow
                thread={item.thread}
                themeId={themeId}
                rowStyle={rowStyle}
                showAccountTint={showAccountTint}
                onPress={openThread}
                onArchive={archiveThread}
                onTrash={trashThread}
              />
            )
          }}
        />
      )}

      {/* Single Primary Material 3 Extended Compose FAB */}
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          router.push('/compose')
        }}
        accessibilityRole="button"
        accessibilityLabel="Compose new email"
        style={[
          styles.fab,
          {
            backgroundColor: theme.accentBtn,
            bottom: hasToast ? 78 : 18
          }
        ]}
      >
        <Pencil size={18} color={theme.onPrimary} strokeWidth={2.2} />
        <Text style={[styles.fabText, { color: theme.onPrimary }]}>Compose</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 6
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  brandBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  screenTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.3
  },
  unreadMeta: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1
  },
  catGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  catHit: {
    minHeight: 48,
    justifyContent: 'center'
  },
  catPill: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  catLabel: {
    fontSize: 13,
    fontWeight: '600'
  },
  catCount: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  },
  swipeHint: {
    fontSize: 12,
    fontWeight: '500'
  },
  groupHdr: {
    marginHorizontal: 8,
    marginTop: 6,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  groupHdrLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  groupHdrLabel: {
    fontSize: 12.5,
    fontWeight: '600'
  },
  groupHdrCount: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums']
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700'
  },
  emptySub: {
    fontSize: 13.5,
    textAlign: 'center',
    marginTop: 6
  },
  emptyCta: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999
  },
  emptyCtaText: {
    fontSize: 13.5,
    fontWeight: '700'
  },
  fab: {
    position: 'absolute',
    right: 16,
    height: 54,
    paddingHorizontal: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    elevation: 6
  },
  fabText: {
    fontSize: 14.5,
    fontWeight: '700'
  }
})
