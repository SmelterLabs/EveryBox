import React, { useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import {
  Check,
  ChevronDown,
  Clock,
  Paperclip,
  Send,
  Sparkles,
  X
} from 'lucide-react-native'
import { getThemeTokens, hexToRgba } from '@everybox/shared'
import { useMobileStore } from '../src/store/useMobileStore'
import { AccountBadge } from '../src/components/AccountBadge'

type ToneKey = 'shorter' | 'warmer' | 'polish' | 'executive'

const TONE_REWRITES: Record<ToneKey, string> = {
  polish:
    "Hi Maya,\n\nSplitting the importer and the migration window makes complete sense — keeping the release freeze clean is the right call.\n\nI'll review section 3 this afternoon and leave inline comments before Thursday's 10:30 AM walkthrough.\n\nThanks,\nAlex",
  shorter:
    "Hi Maya,\n\nAgreed on splitting the importer and migration. I'll review section 3 today and share notes before Thursday at 10:30.\n\nThanks,\nAlex",
  warmer:
    "Hi Maya,\n\nReally appreciate you folding in the design and support feedback so quickly! Splitting the importer first feels like the calmest path.\n\nI'll review section 3 this afternoon and come ready for Thursday's 10:30 walkthrough.\n\nWarmly,\nAlex",
  executive:
    'Maya,\n\nApproved: ship importer first, defer migration two weeks past freeze. Section 3 feedback incoming today before Thursday 10:30.\n\nAlex'
}

export default function ComposerScreen() {
  const params = useLocalSearchParams<{
    accountId?: string
    to?: string
    toName?: string
    subject?: string
    body?: string
    mode?: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const themeId = useMobileStore((s) => s.themeId)
  const accounts = useMobileStore((s) => s.accounts)
  const focusAccountId = useMobileStore((s) => s.focusAccountId)
  const sendComposedEmailWithUndo = useMobileStore((s) => s.sendComposedEmailWithUndo)

  const theme = getThemeTokens(themeId)

  const initialAccId =
    params.accountId ||
    (focusAccountId !== 'all' ? focusAccountId : accounts[0]?.id) ||
    'acc-work'

  const [accountId, setAccountId] = useState(initialAccId)
  const [fromSheetOpen, setFromSheetOpen] = useState(false)
  const [toInput, setToInput] = useState(params.toName || params.to || '')
  const [subject, setSubject] = useState(params.subject || '')
  const [body, setBody] = useState(params.body || '')
  const [activeTone, setActiveTone] = useState<ToneKey | null>(null)
  const [scheduled, setScheduled] = useState(false)

  const activeAccount = accounts.find((a) => a.id === accountId) || accounts[0]
  const modeLabel = params.mode || 'New Message'

  const handleTone = (tone: ToneKey) => {
    void Haptics.selectionAsync()
    setActiveTone(tone)
    setBody(TONE_REWRITES[tone])
  }

  const handleSend = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    sendComposedEmailWithUndo({
      accountId: activeAccount.id,
      to: toInput.trim() || 'Maya Okafor',
      subject: subject.trim() || '(No subject)',
      body,
      scheduledLabel: scheduled ? 'Tomorrow, 8:00 AM' : undefined
    })
    router.back()
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bgMain }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Safe top inset + 3dp account-colored top accent hairline */}
      <View style={{ height: insets.top, backgroundColor: theme.bgMain }} />
      <View style={[styles.topHairline, { backgroundColor: activeAccount.color }]} />

      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: hexToRgba(activeAccount.color, 0.10),
            borderBottomColor: theme.borderSubtle
          }
        ]}
      >
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Close composer"
            style={styles.iconBtn}
          >
            <X size={21} color={theme.textPrimary} strokeWidth={2.2} />
          </Pressable>
          <Text style={[styles.modeTitle, { color: theme.textPrimary }]}>{modeLabel}</Text>
          <Text style={[styles.savedLabel, { color: theme.textMuted }]}>Saved</Text>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync()
              setScheduled((v) => !v)
            }}
            accessibilityLabel="Toggle schedule send"
            style={styles.iconBtn}
          >
            <Clock
              size={20}
              color={scheduled ? theme.accentText : theme.textSecondary}
              strokeWidth={2.1}
            />
          </Pressable>
          <Pressable
            onPress={handleSend}
            style={[styles.sendPill, { backgroundColor: theme.accentBtn }]}
          >
            <Send size={14} color={theme.onPrimary} strokeWidth={2.3} />
            <Text style={[styles.sendText, { color: theme.onPrimary }]}>
              {scheduled ? 'Schedule' : 'Send'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* From Account Switcher */}
      <View
        style={[
          styles.fieldRow,
          { backgroundColor: theme.bgElevated, borderBottomColor: theme.borderSubtle }
        ]}
      >
        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>From</Text>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync()
            setFromSheetOpen(true)
          }}
          style={[styles.fromBtn, { backgroundColor: theme.bgMain }]}
        >
          <View style={styles.fromBtnLeft}>
            <AccountBadge icon={activeAccount.icon} color={activeAccount.color} size="sm" />
            <Text style={[styles.fromName, { color: theme.textPrimary }]}>
              {activeAccount.name}
            </Text>
            <Text numberOfLines={1} style={[styles.fromEmail, { color: theme.textMuted }]}>
              {activeAccount.email}
            </Text>
          </View>
          <ChevronDown size={16} color={theme.textMuted} />
        </Pressable>
      </View>

      {/* To Field */}
      <View
        style={[
          styles.fieldRow,
          { backgroundColor: theme.bgElevated, borderBottomColor: theme.borderSubtle }
        ]}
      >
        <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>To</Text>
        <TextInput
          value={toInput}
          onChangeText={setToInput}
          placeholder="Add recipients…"
          placeholderTextColor={theme.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          style={[styles.toInput, { color: theme.textPrimary }]}
        />
      </View>

      {/* Subject Field */}
      <View style={[styles.subjectRow, { borderBottomColor: theme.borderSubtle }]}>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          placeholder="Subject"
          placeholderTextColor={theme.textMuted}
          style={[styles.subjectInput, { color: theme.textPrimary }]}
        />
      </View>

      {scheduled && (
        <View style={[styles.scheduleBanner, { backgroundColor: theme.accentSoft }]}>
          <View style={styles.scheduleLeft}>
            <Clock size={14} color={theme.accentText} />
            <Text style={[styles.scheduleText, { color: theme.accentText }]}>
              Scheduled · Tomorrow, 8:00 AM
            </Text>
          </View>
          <Pressable onPress={() => setScheduled(false)}>
            <Text style={[styles.clearLink, { color: theme.accentText }]}>Clear</Text>
          </Pressable>
        </View>
      )}

      {/* Body Canvas */}
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write your message…"
          placeholderTextColor={theme.textMuted}
          multiline
          style={[styles.bodyInput, { color: theme.textPrimary }]}
        />
      </ScrollView>

      {/* AI Assist Quick-Tone Strip */}
      <View
        style={[
          styles.toneBar,
          { backgroundColor: theme.bgList, borderTopColor: theme.borderSubtle }
        ]}
      >
        <Sparkles size={15} color={theme.accentText} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(
            [
              { key: 'shorter', label: 'Shorter' },
              { key: 'warmer', label: 'Warmer' },
              { key: 'polish', label: 'Polish' },
              { key: 'executive', label: 'Executive' }
            ] as const
          ).map((chip) => {
            const active = activeTone === chip.key
            return (
              <Pressable
                key={chip.key}
                onPress={() => handleTone(chip.key)}
                style={[
                  styles.toneChip,
                  { backgroundColor: active ? theme.accentSoft : theme.bgElevated }
                ]}
              >
                <Text
                  style={[
                    styles.toneChipText,
                    { color: active ? theme.accentText : theme.textPrimary }
                  ]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* Lightweight IME-Docked Formatting Bar */}
      <View
        style={[
          styles.fmtBar,
          {
            backgroundColor: theme.bgNavBar,
            borderTopColor: theme.borderSubtle,
            paddingBottom: Math.max(8, insets.bottom)
          }
        ]}
      >
        <View style={styles.fmtGroup}>
          <Pressable style={styles.fmtBtn}>
            <Text style={[styles.fmtChar, { color: theme.textSecondary, fontWeight: '800' }]}>
              B
            </Text>
          </Pressable>
          <Pressable style={styles.fmtBtn}>
            <Text style={[styles.fmtChar, { color: theme.textSecondary, fontStyle: 'italic' }]}>
              I
            </Text>
          </Pressable>
        </View>
        <Pressable style={styles.fmtBtn} accessibilityLabel="Attach file">
          <Paperclip size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* Send-From Account Switcher Bottom Sheet */}
      <Modal
        visible={fromSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFromSheetOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setFromSheetOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.fromSheet,
              {
                backgroundColor: theme.bgElevated,
                paddingBottom: Math.max(20, insets.bottom + 12)
              }
            ]}
          >
            <Text style={[styles.sheetHeading, { color: theme.textPrimary }]}>Send from</Text>
            {accounts.map((acc) => {
              const selected = acc.id === activeAccount.id
              return (
                <Pressable
                  key={acc.id}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    setAccountId(acc.id)
                    setFromSheetOpen(false)
                  }}
                  style={[
                    styles.accOption,
                    { backgroundColor: selected ? theme.bgSelected : 'transparent' }
                  ]}
                >
                  <AccountBadge icon={acc.icon} color={acc.color} size="md" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accOptName, { color: theme.textPrimary }]}>
                      {acc.name}
                    </Text>
                    <Text style={[styles.accOptEmail, { color: theme.textMuted }]}>
                      {acc.email}
                    </Text>
                  </View>
                  {selected && <Check size={18} color={theme.accentText} strokeWidth={2.4} />}
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHairline: { height: 3, width: '100%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 1
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modeTitle: { fontSize: 17, fontWeight: '700' },
  savedLabel: { fontSize: 12, marginLeft: 6 },
  sendPill: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  sendText: { fontSize: 14, fontWeight: '700' },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: 52,
    gap: 10,
    borderBottomWidth: 1
  },
  fieldLabel: { width: 42, fontSize: 13, fontWeight: '600' },
  fromBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  fromBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  fromName: { fontSize: 13.5, fontWeight: '700' },
  fromEmail: { fontSize: 12.5, flex: 1 },
  toInput: { flex: 1, fontSize: 14.5, paddingVertical: 8 },
  subjectRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  subjectInput: { fontSize: 16, fontWeight: '700' },
  scheduleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  scheduleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleText: { fontSize: 12.5, fontWeight: '700' },
  clearLink: { fontSize: 12.5, fontWeight: '700', textDecorationLine: 'underline' },
  bodyScroll: { flex: 1 },
  bodyInput: { flex: 1, fontSize: 15, lineHeight: 24, textAlignVertical: 'top' },
  toneBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1
  },
  toneChip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999 },
  toneChipText: { fontSize: 13, fontWeight: '600' },
  fmtBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
    borderTopWidth: 1
  },
  fmtGroup: { flexDirection: 'row', alignItems: 'center' },
  fmtBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  fmtChar: { fontSize: 16 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  fromSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 18
  },
  sheetHeading: { fontSize: 16, fontWeight: '700', marginBottom: 12, paddingHorizontal: 6 },
  accOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 4
  },
  accOptName: { fontSize: 14.5, fontWeight: '700' },
  accOptEmail: { fontSize: 12.5, marginTop: 1 }
})
