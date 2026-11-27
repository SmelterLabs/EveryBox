import React, { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { Copy, Settings, Sparkles, Video } from 'lucide-react-native'
import { getThemeTokens } from '@everybox/shared'
import { useMobileStore } from '../../src/store/useMobileStore'
import { FocusPillStrip } from '../../src/components/FocusPillStrip'
import { AccountBadge } from '../../src/components/AccountBadge'

export default function BriefScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const themeId = useMobileStore((s) => s.themeId)
  const focusAccountId = useMobileStore((s) => s.focusAccountId)
  const threads = useMobileStore((s) => s.threads)
  const calendarEvents = useMobileStore((s) => s.calendarEvents)
  const showToast = useMobileStore((s) => s.showToast)

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

  const signInThreads = scopedThreads.filter((t) => Boolean(t.signInCode))
  const needsYou = scopedThreads.filter((t) => !t.isRead && t.category === 'people')
  const waitingOnYou = scopedThreads.filter((t) => Boolean(t.aiDrafts))
  const worthALook = scopedThreads.filter((t) => t.category === 'updates' && !t.signInCode)

  const todayMeetings = useMemo(
    () =>
      calendarEvents.filter(
        (ev) =>
          !ev.allDay &&
          ev.dayKey === 'thu' &&
          (focusAccountId === 'all' || ev.accountId === focusAccountId)
      ),
    [calendarEvents, focusAccountId]
  )

  return (
    <View style={[styles.container, { backgroundColor: theme.bgMain }]}>
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 4, backgroundColor: theme.bgMain }
        ]}
      >
        <View style={styles.topLeft}>
          <View style={[styles.brandBadge, { backgroundColor: theme.accentSoft }]}>
            <Sparkles size={18} color={theme.accentText} strokeWidth={2.2} />
          </View>
          <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>Today Brief</Text>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityLabel="Accounts and Settings"
          style={styles.iconBtn}
        >
          <Settings size={20} color={theme.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>

      <FocusPillStrip showUnreadCounts />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.greeting, { color: theme.textPrimary }]}>Good morning, Alex</Text>
        <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
          {needsYou.length} conversation{needsYou.length === 1 ? '' : 's'} from people need you,{' '}
          {waitingOnYou.length} AI reply draft{waitingOnYou.length === 1 ? '' : 's'} ready.
        </Text>

        {/* Recent 2FA Codes */}
        {signInThreads.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              Recent sign-in codes
            </Text>
            {signInThreads.map((t) => (
              <Pressable
                key={t.id}
                onPress={async () => {
                  await Clipboard.setStringAsync((t.signInCode || '').replace(/\s+/g, ''))
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                  showToast(`Copied code ${t.signInCode}`, undefined, 2200)
                }}
                style={[
                  styles.codeCard,
                  { backgroundColor: theme.bgElevated, borderColor: theme.borderSubtle }
                ]}
              >
                <View style={styles.codeLeft}>
                  <AccountBadge icon={t.accountIcon} color={t.accountColor} size="sm" />
                  <Text style={[styles.cardSender, { color: theme.textPrimary }]}>
                    {t.latestFrom.name}
                  </Text>
                </View>
                <View style={[styles.codeChip, { backgroundColor: theme.accentSoft }]}>
                  <Text style={[styles.codeMono, { color: theme.accentText }]}>
                    {t.signInCode}
                  </Text>
                  <Copy size={13} color={theme.accentText} />
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Needs You / Waiting on You */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            Needs You ({needsYou.length})
          </Text>
          {needsYou.length === 0 ? (
            <Text style={[styles.emptyLine, { color: theme.textMuted }]}>
              No unread conversations from people in this focus.
            </Text>
          ) : (
            needsYou.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/thread/[id]', params: { id: t.id } })}
                style={[
                  styles.briefCard,
                  { backgroundColor: theme.bgElevated, borderColor: theme.borderSubtle }
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardTopLeft}>
                    <AccountBadge icon={t.accountIcon} color={t.accountColor} size="xs" />
                    <Text style={[styles.cardSender, { color: theme.textPrimary }]}>
                      {t.latestFrom.name}
                    </Text>
                  </View>
                  {t.aiDrafts && (
                    <View style={[styles.badgePill, { backgroundColor: theme.amberSoft }]}>
                      <Sparkles size={11} color={theme.amber} />
                      <Text style={[styles.badgeText, { color: theme.amber }]}>Draft Ready</Text>
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} style={[styles.cardSubject, { color: theme.textPrimary }]}>
                  {t.subject}
                </Text>
                <Text numberOfLines={2} style={[styles.cardSnippet, { color: theme.textMuted }]}>
                  {t.snippet}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        {/* Next Up Today */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            Today&apos;s Schedule ({todayMeetings.length})
          </Text>
          {todayMeetings.slice(0, 3).map((ev) => (
            <Pressable
              key={ev.id}
              onPress={() => router.push('/(tabs)/calendar')}
              style={[
                styles.briefCard,
                { backgroundColor: theme.bgElevated, borderColor: theme.borderSubtle }
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardTopLeft}>
                  <AccountBadge icon={ev.accountIcon} color={ev.accountColor} size="xs" />
                  <Text style={[styles.cardSender, { color: theme.textPrimary }]}>
                    {ev.title}
                  </Text>
                </View>
                {ev.meetingUrl && <Video size={15} color={theme.accentText} />}
              </View>
              <Text style={[styles.cardSnippet, { color: theme.textMuted, marginTop: 4 }]}>
                {ev.startLabel} – {ev.endLabel} · {ev.location || ev.calendarName}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Worth a Look */}
        {worthALook.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              Worth a Look ({worthALook.length})
            </Text>
            {worthALook.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/thread/[id]', params: { id: t.id } })}
                style={[
                  styles.briefCard,
                  { backgroundColor: theme.bgElevated, borderColor: theme.borderSubtle }
                ]}
              >
                <View style={styles.cardTopLeft}>
                  <AccountBadge icon={t.accountIcon} color={t.accountColor} size="xs" />
                  <Text style={[styles.cardSender, { color: theme.textPrimary }]}>
                    {t.latestFrom.name}
                  </Text>
                </View>
                <Text numberOfLines={1} style={[styles.cardSubject, { color: theme.textPrimary }]}>
                  {t.subject}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 6
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  screenTitle: { fontSize: 21, fontWeight: '700', letterSpacing: -0.3 },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scrollContent: { padding: 16, paddingBottom: 100 },
  greeting: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  summaryText: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  section: { marginTop: 22, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  emptyLine: { fontSize: 13.5 },
  codeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 54
  },
  codeLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  codeMono: { fontFamily: 'monospace', fontSize: 13.5, fontWeight: '700' },
  briefCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardSender: { fontSize: 14, fontWeight: '700' },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  badgeText: { fontSize: 11.5, fontWeight: '700' },
  cardSubject: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  cardSnippet: { fontSize: 13, marginTop: 3, lineHeight: 18 }
})
