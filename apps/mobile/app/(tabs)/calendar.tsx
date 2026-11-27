import React, { useMemo, useState } from 'react'
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import {
  Calendar as CalendarIcon,
  Copy,
  Layers,
  MapPin,
  Plus,
  Settings,
  Users,
  Video,
  X
} from 'lucide-react-native'
import { getThemeTokens, hexToRgba } from '@everybox/shared'
import { useMobileStore } from '../../src/store/useMobileStore'
import type { MobileCalendarItem } from '../../src/data/demoData'
import { FocusPillStrip } from '../../src/components/FocusPillStrip'
import { AccountBadge } from '../../src/components/AccountBadge'

interface MergedEvent {
  primary: MobileCalendarItem
  occurrences: Array<{ accountId: string; color: string; name: string; email: string }>
}

const WEEK_DAYS = [
  { dow: 'M', num: 23, dots: ['#3B82F6'] },
  { dow: 'T', num: 24, dots: ['#3B82F6', '#34C77B'] },
  { dow: 'W', num: 25, dots: ['#E87A48'] },
  { dow: 'T', num: 26, dots: ['#3B82F6', '#34C77B', '#E87A48'], today: true },
  { dow: 'F', num: 27, dots: ['#3B82F6', '#34C77B'] },
  { dow: 'S', num: 28, dots: ['#E87A48'] },
  { dow: 'S', num: 29, dots: [] }
]

export default function CombinedCalendarScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const themeId = useMobileStore((s) => s.themeId)
  const accounts = useMobileStore((s) => s.accounts)
  const focusAccountId = useMobileStore((s) => s.focusAccountId)
  const calendarEvents = useMobileStore((s) => s.calendarEvents)
  const showToast = useMobileStore((s) => s.showToast)

  const [mode, setMode] = useState<'agenda' | '3day'>('agenda')
  const [merged, setMerged] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<MergedEvent | null>(null)

  const theme = getThemeTokens(themeId)

  const priorityRank = useMemo(
    () => new Map(accounts.map((a, idx) => [a.id, idx])),
    [accounts]
  )

  const scopedEvents = useMemo(
    () =>
      calendarEvents.filter(
        (ev) => focusAccountId === 'all' || ev.accountId === focusAccountId
      ),
    [calendarEvents, focusAccountId]
  )

  const combinedEvents = useMemo<MergedEvent[]>(() => {
    if (!merged) {
      return scopedEvents.map((ev) => ({
        primary: ev,
        occurrences: [
          {
            accountId: ev.accountId,
            color: ev.accountColor,
            name: ev.calendarName,
            email: ev.accountEmail
          }
        ]
      }))
    }
    const map = new Map<string, MergedEvent>()
    for (const ev of scopedEvents) {
      const key = `${ev.title.toLowerCase()}|${ev.startAt}|${ev.endAt}|${ev.allDay}`
      const occ = {
        accountId: ev.accountId,
        color: ev.accountColor,
        name: ev.calendarName,
        email: ev.accountEmail
      }
      const existing = map.get(key)
      if (!existing) {
        map.set(key, { primary: ev, occurrences: [occ] })
      } else {
        const curRank = priorityRank.get(existing.primary.accountId) ?? 99
        const newRank = priorityRank.get(ev.accountId) ?? 99
        if (newRank < curRank) existing.primary = ev
        existing.occurrences.push(occ)
        existing.occurrences.sort(
          (a, b) => (priorityRank.get(a.accountId) ?? 99) - (priorityRank.get(b.accountId) ?? 99)
        )
      }
    }
    return Array.from(map.values())
  }, [scopedEvents, merged, priorityRank])

  const allDayEvents = combinedEvents.filter((e) => e.primary.allDay)
  const thuTimed = combinedEvents.filter((e) => !e.primary.allDay && e.primary.dayKey === 'thu')
  const friTimed = combinedEvents.filter((e) => !e.primary.allDay && e.primary.dayKey === 'fri')
  const satTimed = combinedEvents.filter((e) => !e.primary.allDay && e.primary.dayKey === 'sat')

  const activeSheetEvent = selectedEvent ?? thuTimed[0] ?? null

  const handleJoinMeeting = (url?: string) => {
    if (!url) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void Linking.openURL(url).catch(() => {
      showToast('Opened meeting link')
    })
  }

  const handleCopyMeetingLink = async (url?: string) => {
    if (!url) return
    await Clipboard.setStringAsync(url)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    showToast('Copied meeting link', undefined, 2400)
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bgMain }]}>
      {/* Top App Bar */}
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + 4, backgroundColor: theme.bgMain }
        ]}
      >
        <View style={styles.topLeft}>
          <View style={[styles.brandBadge, { backgroundColor: theme.accentSoft }]}>
            <CalendarIcon size={18} color={theme.accentText} strokeWidth={2.2} />
          </View>
          <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>Nov 2026</Text>
        </View>

        <View style={styles.topRight}>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync()
              showToast('Jumped to Today (Thu, Nov 26)', undefined, 1800)
            }}
            style={[styles.todayPill, { borderColor: theme.borderStrong }]}
          >
            <Text style={[styles.todayText, { color: theme.textPrimary }]}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync()
              showToast('New event sheet ready in Phase 2', undefined, 2000)
            }}
            accessibilityLabel="Create calendar event"
            style={styles.iconBtn}
          >
            <Plus size={20} color={theme.textSecondary} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityLabel="Accounts and Settings"
            style={styles.iconBtn}
          >
            <Settings size={20} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Coupled Multi-Account Focus Pill Strip */}
      <FocusPillStrip showUnreadCounts={false} />

      {/* View Switcher (Agenda / 3-Day) + Merged vs. Raw Toggle */}
      <View
        style={[
          styles.controlsBar,
          { backgroundColor: theme.bgList, borderBottomColor: theme.borderSubtle }
        ]}
      >
        <View style={[styles.modeSeg, { backgroundColor: theme.bgElevated }]}>
          {(['agenda', '3day'] as const).map((m) => {
            const active = mode === m
            return (
              <Pressable
                key={m}
                onPress={() => {
                  void Haptics.selectionAsync()
                  setMode(m)
                }}
                style={[
                  styles.modeBtn,
                  { backgroundColor: active ? theme.bgMain : 'transparent' }
                ]}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: active ? theme.textPrimary : theme.textMuted }
                  ]}
                >
                  {m === 'agenda' ? 'Agenda' : '3-Day'}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync()
            setMerged((v) => !v)
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: merged }}
          style={[
            styles.mergePill,
            {
              backgroundColor: merged ? theme.accentSoft : theme.bgElevated,
              borderColor: merged ? theme.accent : theme.borderStrong
            }
          ]}
        >
          <Layers size={14} color={merged ? theme.accentText : theme.textSecondary} />
          <Text
            style={[
              styles.mergeText,
              { color: merged ? theme.accentText : theme.textSecondary }
            ]}
          >
            {merged ? 'Merged' : 'Raw'}
          </Text>
        </Pressable>
      </View>

      {/* Week Day Strip */}
      <View
        style={[
          styles.weekStrip,
          { backgroundColor: theme.bgList, borderBottomColor: theme.borderSubtle }
        ]}
      >
        {WEEK_DAYS.map((d) => (
          <View key={d.num} style={styles.dayCol}>
            <Text
              style={[
                styles.dayDow,
                { color: d.today ? theme.accentText : theme.textMuted }
              ]}
            >
              {d.dow}
            </Text>
            <View
              style={[
                styles.dayNumCircle,
                { backgroundColor: d.today ? theme.accentBtn : 'transparent' }
              ]}
            >
              <Text
                style={[
                  styles.dayNumText,
                  { color: d.today ? theme.onPrimary : theme.textPrimary }
                ]}
              >
                {d.num}
              </Text>
            </View>
            <View style={styles.dotRow}>
              {d.dots.map((dot, idx) => (
                <View key={idx} style={[styles.dot, { backgroundColor: dot }]} />
              ))}
            </View>
          </View>
        ))}
      </View>

      {/* Pinned All-Day Strip */}
      {allDayEvents.length > 0 && (
        <View style={[styles.allDayStrip, { borderBottomColor: theme.borderSubtle }]}>
          <Text style={[styles.allDayLabel, { color: theme.textMuted }]}>ALL DAY</Text>
          <View style={styles.allDayList}>
            {allDayEvents.map((item) => (
              <Pressable
                key={item.primary.id}
                onPress={() => setSelectedEvent(item)}
                style={[
                  styles.allDayChip,
                  {
                    backgroundColor: hexToRgba(item.primary.accountColor, 0.14),
                    borderColor: hexToRgba(item.primary.accountColor, 0.34)
                  }
                ]}
              >
                <AccountBadge
                  icon={item.primary.accountIcon}
                  color={item.primary.accountColor}
                  size="xs"
                />
                <Text numberOfLines={1} style={[styles.allDayText, { color: theme.textPrimary }]}>
                  {item.primary.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Schedule Content */}
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
      >
        {mode === 'agenda' ? (
          <>
            <View style={styles.nowLine}>
              <View style={[styles.nowDot, { backgroundColor: theme.accent }]} />
              <View style={[styles.nowRule, { backgroundColor: theme.accent }]} />
              <Text style={[styles.nowLabel, { color: theme.accentText }]}>9:41 AM</Text>
            </View>

            {thuTimed.length === 0 ? (
              <Text style={[styles.emptyCal, { color: theme.textMuted }]}>
                Your schedule is clear for the selected account today.
              </Text>
            ) : (
              thuTimed.map((item) => {
                const ev = item.primary
                return (
                  <Pressable
                    key={`${ev.id}-${item.occurrences.length}`}
                    onPress={() => {
                      void Haptics.selectionAsync()
                      setSelectedEvent(item)
                    }}
                    style={styles.agendaRow}
                  >
                    <View style={styles.timeCol}>
                      <Text style={[styles.timeStart, { color: theme.textPrimary }]}>
                        {ev.startLabel}
                      </Text>
                      <Text style={[styles.timeDur, { color: theme.textMuted }]}>
                        {ev.durationLabel}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.eventBlock,
                        {
                          backgroundColor: hexToRgba(ev.accountColor, 0.14),
                          borderColor: hexToRgba(ev.accountColor, 0.32)
                        }
                      ]}
                    >
                      <View style={styles.eventTop}>
                        <Text
                          numberOfLines={1}
                          style={[styles.eventTitle, { color: theme.textPrimary }]}
                        >
                          {ev.title}
                        </Text>
                        <View style={styles.occDots}>
                          {item.occurrences.map((o, i) => (
                            <View
                              key={`${o.accountId}-${i}`}
                              style={[styles.occDot, { backgroundColor: o.color }]}
                            />
                          ))}
                        </View>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[styles.eventSub, { color: theme.textSecondary }]}
                      >
                        {ev.location || ev.calendarName}
                        {!merged ? ` · ${ev.calendarName}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                )
              })
            )}
          </>
        ) : (
          <View style={styles.threeDayGrid}>
            {[
              { label: 'Thu 26', highlight: true, items: thuTimed },
              { label: 'Fri 27', highlight: false, items: friTimed },
              { label: 'Sat 28', highlight: false, items: satTimed }
            ].map((col) => (
              <View
                key={col.label}
                style={[styles.threeDayCol, { backgroundColor: theme.bgList }]}
              >
                <Text
                  style={[
                    styles.threeDayHdr,
                    { color: col.highlight ? theme.accentText : theme.textSecondary }
                  ]}
                >
                  {col.label}
                </Text>
                {col.items.map((item) => (
                  <Pressable
                    key={item.primary.id}
                    onPress={() => setSelectedEvent(item)}
                    style={[
                      styles.miniEv,
                      {
                        backgroundColor: hexToRgba(item.primary.accountColor, 0.16),
                        borderColor: hexToRgba(item.primary.accountColor, 0.34)
                      }
                    ]}
                  >
                    <Text
                      numberOfLines={2}
                      style={[styles.miniEvTitle, { color: theme.textPrimary }]}
                    >
                      {item.primary.title}
                    </Text>
                    <Text style={[styles.miniEvTime, { color: theme.textMuted }]}>
                      {item.primary.startLabel}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Docked Next-Meeting Quick Sheet */}
      {activeSheetEvent && (
        <View
          style={[
            styles.dockedSheet,
            {
              backgroundColor: theme.bgElevated,
              borderTopColor: activeSheetEvent.primary.accountColor
            }
          ]}
        >
          <View style={styles.sheetHandleRow}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.textMuted }]} />
          </View>
          <View style={styles.sheetBody}>
            <View style={styles.sheetTitleRow}>
              <View
                style={[
                  styles.titleDot,
                  { backgroundColor: activeSheetEvent.primary.accountColor }
                ]}
              />
              <Text
                numberOfLines={1}
                style={[styles.sheetTitle, { color: theme.textPrimary }]}
              >
                {activeSheetEvent.primary.title}
              </Text>
            </View>
            <Text style={[styles.sheetTime, { color: theme.textSecondary }]}>
              {activeSheetEvent.primary.dayLabel}, Nov 26 · {activeSheetEvent.primary.startLabel}
              {activeSheetEvent.primary.endLabel ? ` – ${activeSheetEvent.primary.endLabel}` : ''} (
              {activeSheetEvent.primary.durationLabel})
            </Text>

            <View style={styles.sheetActions}>
              {activeSheetEvent.primary.meetingUrl ? (
                <>
                  <Pressable
                    onPress={() => handleJoinMeeting(activeSheetEvent.primary.meetingUrl)}
                    style={[styles.joinBtn, { backgroundColor: theme.accentBtn }]}
                  >
                    <Video size={17} color={theme.onPrimary} strokeWidth={2.2} />
                    <Text style={[styles.joinBtnText, { color: theme.onPrimary }]}>
                      Join Meeting
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleCopyMeetingLink(activeSheetEvent.primary.meetingUrl)}
                    accessibilityLabel="Copy meeting link"
                    style={[styles.copyLinkBtn, { backgroundColor: theme.bgMain }]}
                  >
                    <Copy size={18} color={theme.textPrimary} />
                  </Pressable>
                </>
              ) : (
                <View style={styles.locRow}>
                  <MapPin size={15} color={theme.textMuted} />
                  <Text style={[styles.sheetMeta, { color: theme.textSecondary }]}>
                    {activeSheetEvent.primary.location || 'No location specified'}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.sheetMetaBlock}>
              <View style={styles.sheetMetaRow}>
                <View style={styles.occDots}>
                  {activeSheetEvent.occurrences.map((o, idx) => (
                    <View
                      key={`${o.accountId}-${idx}`}
                      style={[styles.occDot, { backgroundColor: o.color }]}
                    />
                  ))}
                </View>
                <Text style={[styles.sheetMeta, { color: theme.textSecondary }]}>
                  {activeSheetEvent.occurrences.length > 1
                    ? `Merged · ${activeSheetEvent.occurrences.map((o) => o.name).join(' & ')} calendars`
                    : `${activeSheetEvent.occurrences[0]?.name} calendar`}
                </Text>
              </View>
              {activeSheetEvent.primary.attendees.length > 0 && (
                <View style={styles.sheetMetaRow}>
                  <Users size={13} color={theme.textMuted} />
                  <Text numberOfLines={1} style={[styles.sheetMeta, { color: theme.textSecondary }]}>
                    {activeSheetEvent.primary.attendees.map((a) => a.name || a.email).join(', ')} (
                    {activeSheetEvent.primary.attendees.length})
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Full Event Detail Modal when tapped explicitly */}
      <Modal
        visible={Boolean(selectedEvent)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <Pressable
          style={styles.modalScrim}
          onPress={() => setSelectedEvent(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.modalSheet,
              {
                backgroundColor: theme.bgElevated,
                borderTopColor: selectedEvent?.primary.accountColor || theme.accent,
                paddingBottom: Math.max(20, insets.bottom + 12)
              }
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                {selectedEvent?.primary.title}
              </Text>
              <Pressable
                onPress={() => setSelectedEvent(null)}
                accessibilityLabel="Close event details"
                style={styles.iconBtn}
              >
                <X size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.sheetTime, { color: theme.textSecondary, marginBottom: 14 }]}>
              {selectedEvent?.primary.startLabel}
              {selectedEvent?.primary.endLabel ? ` – ${selectedEvent.primary.endLabel}` : ''} ·{' '}
              {selectedEvent?.primary.durationLabel}
            </Text>
            {selectedEvent?.primary.description && (
              <Text style={[styles.modalDesc, { color: theme.textPrimary }]}>
                {selectedEvent.primary.description}
              </Text>
            )}
            {selectedEvent?.primary.meetingUrl && (
              <View style={[styles.sheetActions, { marginTop: 16 }]}>
                <Pressable
                  onPress={() => handleJoinMeeting(selectedEvent.primary.meetingUrl)}
                  style={[styles.joinBtn, { backgroundColor: theme.accentBtn }]}
                >
                  <Video size={17} color={theme.onPrimary} />
                  <Text style={[styles.joinBtnText, { color: theme.onPrimary }]}>
                    Join Meeting
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleCopyMeetingLink(selectedEvent.primary.meetingUrl)}
                  style={[styles.copyLinkBtn, { backgroundColor: theme.bgMain }]}
                >
                  <Copy size={18} color={theme.textPrimary} />
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  todayPill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4
  },
  todayText: { fontSize: 13, fontWeight: '600' },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1
  },
  modeSeg: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3
  },
  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8
  },
  modeBtnText: { fontSize: 13, fontWeight: '600' },
  mergePill: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  mergeText: { fontSize: 13, fontWeight: '600' },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1
  },
  dayCol: { flex: 1, alignItems: 'center', gap: 3 },
  dayDow: { fontSize: 11.5, fontWeight: '600' },
  dayNumCircle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dayNumText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dotRow: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 999 },
  allDayStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1
  },
  allDayLabel: { fontSize: 11.5, fontWeight: '700' },
  allDayList: { flex: 1, flexDirection: 'row', gap: 8 },
  allDayChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1
  },
  allDayText: { fontSize: 12.5, fontWeight: '600', flex: 1 },
  bodyScroll: { flex: 1 },
  nowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10
  },
  nowDot: { width: 8, height: 8, borderRadius: 999 },
  nowRule: { flex: 1, height: 1.5, opacity: 0.7 },
  nowLabel: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  emptyCal: { textAlign: 'center', marginTop: 28, fontSize: 13.5 },
  agendaRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  timeCol: { width: 64, paddingTop: 8, alignItems: 'flex-end' },
  timeStart: { fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  timeDur: { fontSize: 11.5, fontVariant: ['tabular-nums'] },
  eventBlock: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1
  },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  eventTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  occDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  occDot: { width: 8, height: 8, borderRadius: 999 },
  eventSub: { fontSize: 12.5, marginTop: 3 },
  threeDayGrid: { flexDirection: 'row', gap: 8 },
  threeDayCol: { flex: 1, borderRadius: 10, padding: 8, minHeight: 200 },
  threeDayHdr: { fontSize: 12.5, fontWeight: '700', marginBottom: 8 },
  miniEv: { padding: 7, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  miniEvTitle: { fontSize: 12, fontWeight: '700' },
  miniEvTime: { fontSize: 11.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  dockedSheet: { borderTopWidth: 3 },
  sheetHandleRow: { alignItems: 'center', paddingTop: 7, paddingBottom: 3 },
  sheetHandle: { width: 32, height: 4, borderRadius: 999, opacity: 0.4 },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 12 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleDot: { width: 10, height: 10, borderRadius: 999 },
  sheetTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  sheetTime: { fontSize: 12.5, marginTop: 3, fontVariant: ['tabular-nums'] },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  joinBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  joinBtnText: { fontSize: 14, fontWeight: '700' },
  copyLinkBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetMetaBlock: { marginTop: 10, gap: 5 },
  sheetMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sheetMeta: { fontSize: 12.5, flex: 1 },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end'
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 3,
    paddingHorizontal: 20,
    paddingTop: 14
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  modalTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  modalDesc: { fontSize: 14, lineHeight: 21 }
})
