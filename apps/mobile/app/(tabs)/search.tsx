import React, { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Search as SearchIcon, Trash2, X } from 'lucide-react-native'
import { getThemeTokens, parseSearchQuery } from '@everybox/shared'
import { useMobileStore } from '../../src/store/useMobileStore'
import { AccountBadge } from '../../src/components/AccountBadge'

const EXAMPLE_QUERIES = ['pdf from maya', 'is:unread', 'from:devon', 'code']

export default function SearchScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const themeId = useMobileStore((s) => s.themeId)
  const accounts = useMobileStore((s) => s.accounts)
  const focusAccountId = useMobileStore((s) => s.focusAccountId)
  const threads = useMobileStore((s) => s.threads)

  const [query, setQuery] = useState('')
  const [searchAllAccounts, setSearchAllAccounts] = useState(true)
  const [includeTrash, setIncludeTrash] = useState(false)

  const theme = getThemeTokens(themeId)
  const activeAccount = accounts.find((a) => a.id === focusAccountId)

  const parsed = useMemo(() => parseSearchQuery(query), [query])

  const results = useMemo(() => {
    return threads.filter((t) => {
      if (!includeTrash && (t.folderRole === 'trash' || t.folderRole === 'junk')) {
        return false
      }
      if (!searchAllAccounts && focusAccountId !== 'all' && t.accountId !== focusAccountId) {
        return false
      }
      if (parsed.isUnread && t.isRead) return false
      if (parsed.hasAttachment && !t.hasAttachments) return false
      if (parsed.from) {
        const hay = `${t.latestFrom.name} ${t.latestFrom.email}`.toLowerCase()
        if (!hay.includes(parsed.from.toLowerCase())) return false
      }
      if (parsed.textQuery) {
        const hay = `${t.latestFrom.name} ${t.latestFrom.email} ${t.subject} ${t.snippet} ${t.signInCode ?? ''}`.toLowerCase()
        if (!hay.includes(parsed.textQuery.toLowerCase())) return false
      }
      return true
    })
  }, [threads, parsed, includeTrash, searchAllAccounts, focusAccountId])

  return (
    <View style={[styles.container, { backgroundColor: theme.bgMain }]}>
      <View style={[styles.searchHeader, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.bgElevated, borderColor: theme.borderStrong }
          ]}
        >
          <SearchIcon size={18} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder='Try "pdf from maya" or "is:unread"'
            placeholderTextColor={theme.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.textPrimary }]}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityLabel="Clear search"
              style={styles.clearBtn}
            >
              <X size={16} color={theme.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Scope & Trash Toggles */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toggleRow}
        >
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync()
              setSearchAllAccounts((v) => !v)
            }}
            style={[
              styles.filterChip,
              {
                backgroundColor: searchAllAccounts ? theme.accentSoft : theme.bgElevated,
                borderColor: searchAllAccounts ? theme.accent : theme.borderSubtle
              }
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: searchAllAccounts ? theme.accentText : theme.textSecondary }
              ]}
            >
              {searchAllAccounts
                ? 'Search all accounts'
                : `Scoped: ${activeAccount?.name || 'All'}`}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync()
              setIncludeTrash((v) => !v)
            }}
            style={[
              styles.filterChip,
              {
                backgroundColor: includeTrash ? theme.dangerSoft : theme.bgElevated,
                borderColor: includeTrash ? theme.danger : theme.borderSubtle
              }
            ]}
          >
            <Trash2 size={13} color={includeTrash ? theme.danger : theme.textMuted} />
            <Text
              style={[
                styles.filterChipText,
                { color: includeTrash ? theme.danger : theme.textSecondary }
              ]}
            >
              {includeTrash ? 'Including Trash & Junk' : 'Include Trash & Junk'}
            </Text>
          </Pressable>
        </ScrollView>

        {/* Parsed Natural-Language Pills */}
        {parsed.pills.length > 0 && (
          <View style={styles.parsedRow}>
            {parsed.pills.map((p) => (
              <View
                key={`${p.key}-${p.value}`}
                style={[styles.parsedPill, { backgroundColor: theme.accentSoft }]}
              >
                <Text style={[styles.parsedPillText, { color: theme.accentText }]}>
                  {p.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.resultsScroll}>
        {query.trim().length === 0 && (
          <View style={styles.quickQueries}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Quick filters</Text>
            <View style={styles.quickChips}>
              {EXAMPLE_QUERIES.map((ex) => (
                <Pressable
                  key={ex}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    setQuery(ex)
                  }}
                  style={[
                    styles.quickChip,
                    { backgroundColor: theme.bgElevated, borderColor: theme.borderSubtle }
                  ]}
                >
                  <Text style={[styles.quickChipText, { color: theme.textPrimary }]}>{ex}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
          {results.length} result{results.length === 1 ? '' : 's'}
        </Text>

        {results.map((t) => {
          const isTrash = t.folderRole === 'trash' || t.folderRole === 'junk'
          return (
            <Pressable
              key={t.id}
              onPress={() => router.push({ pathname: '/thread/[id]', params: { id: t.id } })}
              style={[
                styles.resultRow,
                { backgroundColor: theme.bgElevated, borderColor: theme.borderSubtle }
              ]}
            >
              <View style={styles.resultTop}>
                <View style={styles.resultSender}>
                  <AccountBadge icon={t.accountIcon} color={t.accountColor} size="xs" />
                  <Text numberOfLines={1} style={[styles.senderText, { color: theme.textPrimary }]}>
                    {t.latestFrom.name}
                  </Text>
                </View>
                <View
                  style={[
                    styles.folderBadge,
                    { backgroundColor: isTrash ? theme.dangerSoft : theme.accentSoft }
                  ]}
                >
                  <Text
                    style={[
                      styles.folderBadgeText,
                      { color: isTrash ? theme.danger : theme.accentText }
                    ]}
                  >
                    {t.folderRole === 'trash' ? 'Trash' : 'Inbox'}
                  </Text>
                </View>
              </View>
              <Text numberOfLines={1} style={[styles.subjectText, { color: theme.textPrimary }]}>
                {t.subject}
              </Text>
              <Text numberOfLines={1} style={[styles.snippetText, { color: theme.textMuted }]}>
                {t.snippet}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchHeader: { paddingHorizontal: 14, paddingBottom: 8 },
  searchBox: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  searchInput: { flex: 1, fontSize: 15 },
  clearBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { paddingTop: 10, gap: 8 },
  filterChip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  filterChipText: { fontSize: 12.5, fontWeight: '600' },
  parsedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  parsedPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  parsedPillText: { fontSize: 12, fontWeight: '700' },
  resultsScroll: { padding: 14, paddingBottom: 100, gap: 8 },
  quickQueries: { marginBottom: 12 },
  sectionLabel: { fontSize: 12.5, fontWeight: '700', marginBottom: 8 },
  quickChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1
  },
  quickChipText: { fontSize: 13, fontWeight: '600' },
  resultRow: { padding: 13, borderRadius: 12, borderWidth: 1 },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  resultSender: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  senderText: { fontSize: 14, fontWeight: '700' },
  folderBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  folderBadgeText: { fontSize: 11.5, fontWeight: '700' },
  subjectText: { fontSize: 14, fontWeight: '600', marginTop: 5 },
  snippetText: { fontSize: 12.5, marginTop: 2 }
})
