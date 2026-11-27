import React, { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
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
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Forward,
  Paperclip,
  Reply,
  ReplyAll,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2
} from 'lucide-react-native'
import { getThemeTokens } from '@everybox/shared'
import { useMobileStore } from '../../src/store/useMobileStore'
import type { VoiceToneKey } from '../../src/data/demoData'
import { AccountBadge } from '../../src/components/AccountBadge'
import { UndoFuseSnackbar } from '../../src/components/UndoFuseSnackbar'

const VOICE_OPTIONS: { key: VoiceToneKey; label: string }[] = [
  { key: 'colleague', label: 'Colleague' },
  { key: 'executive', label: 'Executive' },
  { key: 'personal', label: 'Warm' }
]

export default function ThreadReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const themeId = useMobileStore((s) => s.themeId)
  const threads = useMobileStore((s) => s.threads)
  const toggleStarThread = useMobileStore((s) => s.toggleStarThread)
  const archiveThread = useMobileStore((s) => s.archiveThread)
  const trashThread = useMobileStore((s) => s.trashThread)
  const sendReplyWithUndo = useMobileStore((s) => s.sendReplyWithUndo)

  const theme = getThemeTokens(themeId)
  const thread = threads.find((t) => t.id === id) ?? threads[0]

  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})
  const [voice, setVoice] = useState<VoiceToneKey>('colleague')
  const [draftText, setDraftText] = useState(thread?.aiDrafts?.colleague ?? '')
  const [quickReply, setQuickReply] = useState('')

  useEffect(() => {
    if (!thread) return
    const init: Record<string, boolean> = {}
    thread.messages.forEach((m, idx) => {
      init[m.id] = idx === thread.messages.length - 1
    })
    setExpandedIds(init)
    setVoice('colleague')
    setDraftText(thread.aiDrafts?.colleague ?? '')
  }, [thread?.id])

  if (!thread) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bgMain, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.textSecondary }}>Conversation not found.</Text>
      </View>
    )
  }

  const handleSelectVoice = (nextVoice: VoiceToneKey) => {
    void Haptics.selectionAsync()
    setVoice(nextVoice)
    if (thread.aiDrafts?.[nextVoice]) {
      setDraftText(thread.aiDrafts[nextVoice])
    }
  }

  const handleSendAiDraft = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    sendReplyWithUndo(thread.id, thread.latestFrom.name, draftText)
  }

  const handleQuickSend = () => {
    if (!quickReply.trim()) return
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    sendReplyWithUndo(thread.id, thread.latestFrom.name, quickReply)
    setQuickReply('')
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bgMain }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top Action Bar */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 4,
            backgroundColor: theme.bgMain,
            borderBottomColor: theme.borderSubtle
          }
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back to inbox"
          style={styles.iconBtn}
        >
          <ArrowLeft size={22} color={theme.textPrimary} strokeWidth={2.1} />
        </Pressable>

        <View style={styles.topActions}>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              archiveThread(thread.id)
              router.back()
            }}
            accessibilityLabel="Archive thread"
            style={styles.iconBtn}
          >
            <Archive size={20} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              trashThread(thread.id)
              router.back()
            }}
            accessibilityLabel="Delete thread"
            style={styles.iconBtn}
          >
            <Trash2 size={20} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Subject + Star */}
        <View style={styles.subjectRow}>
          <Text style={[styles.subject, { color: theme.textPrimary }]}>{thread.subject}</Text>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync()
              toggleStarThread(thread.id)
            }}
            accessibilityLabel={thread.isStarred ? 'Remove star' : 'Star conversation'}
            style={styles.iconBtn}
          >
            <Star
              size={20}
              color={thread.isStarred ? theme.amber : theme.textMuted}
              fill={thread.isStarred ? theme.amber : 'none'}
              strokeWidth={2}
            />
          </Pressable>
        </View>

        {/* Account Pill + Trackers Blocked Shield */}
        <View style={styles.metaRow}>
          <View style={[styles.metaPill, { backgroundColor: theme.bgElevated }]}>
            <AccountBadge icon={thread.accountIcon} color={thread.accountColor} size="xs" />
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>
              {thread.accountName} · {thread.accountEmail}
            </Text>
          </View>
          {thread.trackersBlocked > 0 && (
            <View
              style={[
                styles.metaPill,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(45, 212, 191, 0.16)'
                    : 'rgba(15, 118, 110, 0.12)'
                }
              ]}
            >
              <ShieldCheck size={13} color={theme.success} strokeWidth={2.2} />
              <Text style={[styles.metaText, { color: theme.success }]}>
                {thread.trackersBlocked} tracker{thread.trackersBlocked === 1 ? '' : 's'} blocked
              </Text>
            </View>
          )}
        </View>

        {/* Collapsible Message Stack */}
        {thread.messages.map((m, idx) => {
          const isLatest = idx === thread.messages.length - 1
          const isExpanded = expandedIds[m.id] ?? isLatest

          if (!isExpanded) {
            return (
              <Pressable
                key={m.id}
                onPress={() => setExpandedIds((prev) => ({ ...prev, [m.id]: true }))}
                style={[styles.collapsedCard, { backgroundColor: theme.bgElevated }]}
              >
                <ChevronRight size={15} color={theme.textMuted} />
                <View style={[styles.miniAvatar, { backgroundColor: theme.bgMain }]}>
                  <Text style={[styles.miniAvatarText, { color: theme.textSecondary }]}>
                    {m.initials}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.collapsedSender, { color: theme.textPrimary }]}>
                    {m.fromName}
                  </Text>
                  <Text numberOfLines={1} style={[styles.collapsedSnippet, { color: theme.textMuted }]}>
                    {m.snippet}
                  </Text>
                </View>
                <Text style={[styles.timeText, { color: theme.textMuted }]}>{m.dateLabel}</Text>
              </Pressable>
            )
          }

          return (
            <View
              key={m.id}
              style={[
                styles.expandedMsg,
                { borderTopColor: theme.borderSubtle }
              ]}
            >
              <Pressable
                onPress={() => {
                  if (!isLatest) {
                    setExpandedIds((prev) => ({ ...prev, [m.id]: false }))
                  }
                }}
                style={styles.msgHdr}
              >
                <View style={styles.msgHdrLeft}>
                  {!isLatest && <ChevronDown size={15} color={theme.textMuted} />}
                  <View style={[styles.msgAvatar, { backgroundColor: theme.bgElevated }]}>
                    <Text style={[styles.msgAvatarText, { color: theme.textSecondary }]}>
                      {m.initials}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.msgSender, { color: theme.textPrimary }]}>
                      {m.fromName}
                    </Text>
                    <Text numberOfLines={1} style={[styles.msgSub, { color: theme.textMuted }]}>
                      {m.fromEmail} · {m.toLabel}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.timeText, { color: theme.textMuted }]}>{m.timeLabel}</Text>
              </Pressable>

              <Text style={[styles.bodyText, { color: theme.textPrimary }]}>{m.body}</Text>

              {m.attachment && (
                <View style={[styles.attChip, { backgroundColor: theme.bgElevated }]}>
                  <Paperclip size={14} color={theme.accentText} />
                  <Text style={[styles.attName, { color: theme.textPrimary }]}>
                    {m.attachment.filename}
                  </Text>
                  <Text style={[styles.attSize, { color: theme.textMuted }]}>
                    {m.attachment.sizeLabel}
                  </Text>
                </View>
              )}
            </View>
          )
        })}

        {/* Flattened AI Draft Ready Band */}
        {thread.aiDrafts && (
          <View style={[styles.aiDraftBand, { backgroundColor: theme.bgElevated }]}>
            <View style={styles.aiDraftTop}>
              <Sparkles size={15} color={theme.accentText} strokeWidth={2.2} />
              <Text style={[styles.aiDraftTitle, { color: theme.accentText }]}>
                AI Draft Ready
              </Text>
              <Text style={[styles.aiDraftSrc, { color: theme.textMuted }]}>· Companion AI</Text>
            </View>

            <View style={[styles.voiceRow, { borderBottomColor: theme.borderSubtle }]}>
              {VOICE_OPTIONS.map((opt) => {
                const active = voice === opt.key
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => handleSelectVoice(opt.key)}
                    style={[
                      styles.voicePill,
                      { backgroundColor: active ? theme.accentSoft : theme.bgMain }
                    ]}
                  >
                    <Text
                      style={[
                        styles.voicePillText,
                        { color: active ? theme.accentText : theme.textSecondary }
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <TextInput
              value={draftText}
              onChangeText={setDraftText}
              multiline
              style={[styles.draftInput, { color: theme.textPrimary }]}
            />

            <View style={styles.aiActions}>
              <Pressable
                onPress={handleSendAiDraft}
                style={[styles.primaryBtn, { backgroundColor: theme.accentBtn }]}
              >
                <Send size={14} color={theme.onPrimary} strokeWidth={2.3} />
                <Text style={[styles.primaryBtnText, { color: theme.onPrimary }]}>Send</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/compose',
                    params: {
                      accountId: thread.accountId,
                      to: thread.latestFrom.email,
                      toName: thread.latestFrom.name,
                      subject: `Re: ${thread.subject}`,
                      body: draftText,
                      mode: 'Reply'
                    }
                  })
                }
                style={[styles.secondaryBtn, { backgroundColor: theme.bgMain }]}
              >
                <Text style={[styles.secondaryBtnText, { color: theme.textPrimary }]}>
                  Edit in Composer
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <UndoFuseSnackbar bottomOffset={76 + insets.bottom} />

      {/* Sticky Bottom Quick Reply Bar */}
      <View
        style={[
          styles.quickReplyBar,
          {
            backgroundColor: theme.bgNavBar,
            borderTopColor: theme.borderSubtle,
            paddingBottom: Math.max(10, insets.bottom + 4)
          }
        ]}
      >
        <View
          style={[
            styles.quickInputWrap,
            { backgroundColor: theme.bgElevated, borderColor: theme.borderSubtle }
          ]}
        >
          <Reply size={16} color={theme.textMuted} />
          <TextInput
            value={quickReply}
            onChangeText={setQuickReply}
            placeholder={`Quick reply to ${thread.latestFrom.name.split(' ')[0]}…`}
            placeholderTextColor={theme.textMuted}
            returnKeyType="send"
            onSubmitEditing={handleQuickSend}
            style={[styles.quickInput, { color: theme.textPrimary }]}
          />
          {quickReply.trim().length > 0 && (
            <Pressable onPress={handleQuickSend} style={styles.quickSendBtn}>
              <Send size={16} color={theme.accentText} />
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/compose',
              params: {
                accountId: thread.accountId,
                to: thread.latestFrom.email,
                toName: thread.latestFrom.name,
                subject: `Re: ${thread.subject}`,
                mode: 'Reply All'
              }
            })
          }
          accessibilityLabel="Reply all"
          style={styles.iconBtn}
        >
          <ReplyAll size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/compose',
              params: {
                accountId: thread.accountId,
                subject: `Fwd: ${thread.subject}`,
                mode: 'Forward'
              }
            })
          }
          accessibilityLabel="Forward"
          style={styles.iconBtn}
        >
          <Forward size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 4,
    borderBottomWidth: 1
  },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32 },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6
  },
  subject: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    letterSpacing: -0.25,
    paddingTop: 6
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6
  },
  metaText: { fontSize: 12, fontWeight: '600' },
  collapsedCard: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 54
  },
  miniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  miniAvatarText: { fontSize: 11.5, fontWeight: '700' },
  collapsedSender: { fontSize: 13, fontWeight: '700' },
  collapsedSnippet: { fontSize: 12, marginTop: 1 },
  timeText: { fontSize: 12, fontVariant: ['tabular-nums'] },
  expandedMsg: { marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  msgHdr: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  msgHdrLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  msgAvatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  msgAvatarText: { fontSize: 12.5, fontWeight: '700' },
  msgSender: { fontSize: 14.5, fontWeight: '700' },
  msgSub: { fontSize: 12, marginTop: 1 },
  bodyText: { fontSize: 15, lineHeight: 23, marginTop: 12 },
  attChip: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  attName: { fontSize: 13, fontWeight: '600' },
  attSize: { fontSize: 12 },
  aiDraftBand: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14
  },
  aiDraftTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiDraftTitle: { fontSize: 13.5, fontWeight: '700' },
  aiDraftSrc: { fontSize: 12 },
  voiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1
  },
  voicePill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  voicePillText: { fontSize: 12.5, fontWeight: '600' },
  draftInput: {
    marginTop: 10,
    fontSize: 14.5,
    lineHeight: 21,
    minHeight: 72,
    textAlignVertical: 'top'
  },
  aiActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  primaryBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  primaryBtnText: { fontSize: 13.5, fontWeight: '700' },
  secondaryBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryBtnText: { fontSize: 13.5, fontWeight: '600' },
  quickReplyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    paddingLeft: 12,
    paddingRight: 4,
    borderTopWidth: 1
  },
  quickInputWrap: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  quickInput: { flex: 1, fontSize: 14 },
  quickSendBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }
})
