import React, { useState } from 'react'
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { Archive, Copy, Paperclip, Reply, Sparkles, Trash2 } from 'lucide-react-native'
import {
  getThemeTokens,
  hexToRgba,
  MOBILE_LAYOUT_TOKENS,
  type AccountRowStyle,
  type ThemeId
} from '@everybox/shared'
import type { MobileThreadItem } from '../data/demoData'
import { AccountBadge } from './AccountBadge'

const SWIPE_THRESHOLD = 92
const EDGE_EXCLUSION_DP = MOBILE_LAYOUT_TOKENS.swipeEdgeExclusionRecDp // 36dp

interface SwipeableThreadRowProps {
  thread: MobileThreadItem
  themeId: ThemeId
  rowStyle: AccountRowStyle
  showAccountTint: boolean
  onPress: (thread: MobileThreadItem) => void
  onArchive: (threadId: string) => void
  onTrash: (threadId: string) => void
}

export const SwipeableThreadRow: React.FC<SwipeableThreadRowProps> = ({
  thread,
  themeId,
  rowStyle,
  showAccountTint,
  onPress,
  onArchive,
  onTrash
}) => {
  const theme = getThemeTokens(themeId)
  const [copiedCode, setCopiedCode] = useState(false)

  const translateX = useSharedValue(0)
  const allowSwipe = useSharedValue(false)
  const didHaptic = useSharedValue(false)
  const screenWidth = Dimensions.get('window').width

  const triggerThresholdHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }

  const handleArchive = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    onArchive(thread.id)
  }

  const handleTrash = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    onTrash(thread.id)
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-12, 12])
    .onBegin((e) => {
      // Strictly ignore touches inside outer 36dp edges so Android Predictive Back always wins
      const insideSafeZone =
        e.absoluteX >= EDGE_EXCLUSION_DP && e.absoluteX <= screenWidth - EDGE_EXCLUSION_DP
      allowSwipe.value = insideSafeZone
      didHaptic.value = false
    })
    .onUpdate((e) => {
      if (!allowSwipe.value) return
      const clamped = Math.max(-140, Math.min(140, e.translationX))
      translateX.value = clamped
      if (Math.abs(clamped) >= SWIPE_THRESHOLD && !didHaptic.value) {
        didHaptic.value = true
        runOnJS(triggerThresholdHaptic)()
      } else if (Math.abs(clamped) < SWIPE_THRESHOLD && didHaptic.value) {
        didHaptic.value = false
      }
    })
    .onEnd(() => {
      if (!allowSwipe.value) {
        translateX.value = withSpring(0)
        return
      }
      if (translateX.value >= SWIPE_THRESHOLD) {
        translateX.value = withSpring(0)
        runOnJS(handleArchive)()
      } else if (translateX.value <= -SWIPE_THRESHOLD) {
        translateX.value = withSpring(0)
        runOnJS(handleTrash)()
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 260 })
      }
    })

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }]
  }))

  const rightActionStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 8 ? Math.min(1, translateX.value / SWIPE_THRESHOLD) : 0
  }))

  const leftActionStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -8 ? Math.min(1, Math.abs(translateX.value) / SWIPE_THRESHOLD) : 0
  }))

  const effectiveStyle: AccountRowStyle = showAccountTint ? rowStyle : 'dot'
  const showBar = showAccountTint && (effectiveStyle === 'gradient' || effectiveStyle === 'bar')
  const showGradient = showAccountTint && effectiveStyle === 'gradient'

  const handleCopyCode = async () => {
    if (!thread.signInCode) return
    await Clipboard.setStringAsync(thread.signInCode.replace(/\s+/g, ''))
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 1800)
  }

  return (
    <View style={styles.outerWrap}>
      {/* Swipe Right -> Archive backdrop */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.swipeBackdrop,
          styles.swipeLeftBackdrop,
          { backgroundColor: theme.isDark ? 'rgba(45, 212, 191, 0.22)' : 'rgba(15, 118, 110, 0.16)' },
          rightActionStyle
        ]}
      >
        <Archive size={20} color={theme.success} strokeWidth={2.2} />
        <Text style={[styles.swipeLabel, { color: theme.success }]}>Archive</Text>
      </Animated.View>

      {/* Swipe Left -> Delete backdrop */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.swipeBackdrop,
          styles.swipeRightBackdrop,
          { backgroundColor: theme.dangerSoft },
          leftActionStyle
        ]}
      >
        <Text style={[styles.swipeLabel, { color: theme.danger }]}>Trash</Text>
        <Trash2 size={20} color={theme.danger} strokeWidth={2.2} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.rowContainer, rowAnimatedStyle]}>
          <Pressable
            onPress={() => onPress(thread)}
            android_ripple={{ color: theme.bgHover }}
            style={[
              styles.row,
              {
                backgroundColor: theme.bgList
              }
            ]}
          >
            {showGradient && (
              <LinearGradient
                pointerEvents="none"
                colors={[
                  hexToRgba(thread.accountColor, theme.accountWashPeakAlpha),
                  hexToRgba(thread.accountColor, theme.accountWashMidAlpha),
                  'transparent'
                ]}
                locations={[0, 0.38, theme.accountWashFadeStopPercent / 100]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            )}

            {showBar && (
              <View
                pointerEvents="none"
                style={[styles.leftAccPill, { backgroundColor: thread.accountColor }]}
              />
            )}

            {/* Unread dot */}
            <View style={styles.unreadSlot}>
              {!thread.isRead && (
                <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />
              )}
            </View>

            {/* Sender Avatar + Account Colored Symbol Badge */}
            <View style={styles.avatarWrap}>
              <View style={[styles.avatar, { backgroundColor: theme.bgElevated }]}>
                <Text style={[styles.avatarText, { color: theme.textSecondary }]}>
                  {thread.initials}
                </Text>
              </View>
              {showAccountTint && (
                <View style={styles.avatarBadgePos}>
                  <AccountBadge
                    icon={thread.accountIcon}
                    color={thread.accountColor}
                    size="xs"
                    borderColor={theme.bgList}
                  />
                </View>
              )}
            </View>

            {/* Content */}
            <View style={styles.content}>
              <View style={styles.line1}>
                <View style={styles.senderCluster}>
                  {thread.isReplied && (
                    <Reply
                      size={13}
                      color={theme.accentText}
                      strokeWidth={2.4}
                      style={{ marginRight: 2 }}
                    />
                  )}
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.senderName,
                      {
                        color: theme.textPrimary,
                        fontWeight: !thread.isRead ? '700' : '500'
                      }
                    ]}
                  >
                    {thread.latestFrom.name}
                  </Text>
                  {thread.messageCount > 1 && (
                    <Text style={[styles.msgCount, { color: theme.textMuted }]}>
                      {thread.messageCount}
                    </Text>
                  )}
                </View>

                <View style={styles.metaCluster}>
                  {Boolean(thread.aiDrafts) && (
                    <View style={[styles.aiSparkPill, { backgroundColor: theme.amberSoft }]}>
                      <Sparkles size={11} color={theme.amber} strokeWidth={2.2} />
                    </View>
                  )}
                  {thread.hasAttachments && (
                    <Paperclip size={12} color={theme.textMuted} strokeWidth={2.1} />
                  )}
                  <Text style={[styles.timeText, { color: theme.textMuted }]}>
                    {thread.timeLabel}
                  </Text>
                </View>
              </View>

              <Text
                numberOfLines={1}
                style={[
                  styles.subject,
                  {
                    color: !thread.isRead ? theme.textPrimary : theme.textSecondary,
                    fontWeight: !thread.isRead ? '600' : '400'
                  }
                ]}
              >
                {thread.subject}
              </Text>

              <Text numberOfLines={1} style={[styles.snippet, { color: theme.textMuted }]}>
                {thread.snippet}
              </Text>

              {thread.signInCode && (
                <Pressable
                  onPress={() => void handleCopyCode()}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy sign-in code ${thread.signInCode}`}
                  style={[
                    styles.codePill,
                    {
                      backgroundColor: copiedCode
                        ? theme.isDark
                          ? 'rgba(45, 212, 191, 0.20)'
                          : 'rgba(15, 118, 110, 0.14)'
                        : theme.accentSoft,
                      borderColor: copiedCode ? theme.success : theme.accent
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.codePillText,
                      { color: copiedCode ? theme.success : theme.accentText }
                    ]}
                  >
                    {copiedCode ? `Copied ${thread.signInCode}` : thread.signInCode}
                  </Text>
                  <Copy
                    size={12}
                    color={copiedCode ? theme.success : theme.accentText}
                    strokeWidth={2.3}
                  />
                </Pressable>
              )}
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  outerWrap: {
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 12,
    overflow: 'hidden'
  },
  swipeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8
  },
  swipeLeftBackdrop: {
    justifyContent: 'flex-start'
  },
  swipeRightBackdrop: {
    justifyContent: 'flex-end'
  },
  swipeLabel: {
    fontSize: 13,
    fontWeight: '700'
  },
  rowContainer: {
    borderRadius: 12,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    paddingLeft: 12,
    paddingRight: 12,
    gap: 10,
    minHeight: 76
  },
  leftAccPill: {
    position: 'absolute',
    left: 3,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 999
  },
  unreadSlot: {
    width: 8,
    paddingTop: 15,
    alignItems: 'center'
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 999
  },
  avatarWrap: {
    width: 40,
    height: 40,
    marginTop: 1
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700'
  },
  avatarBadgePos: {
    position: 'absolute',
    right: -2,
    bottom: -2
  },
  content: {
    flex: 1,
    minWidth: 0
  },
  line1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  senderCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0
  },
  senderName: {
    fontSize: 14.5,
    flexShrink: 1
  },
  msgCount: {
    fontSize: 12,
    fontVariant: ['tabular-nums']
  },
  metaCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  aiSparkPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums']
  },
  subject: {
    fontSize: 13.5,
    marginTop: 2
  },
  snippet: {
    fontSize: 12.5,
    marginTop: 2
  },
  codePill: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1
  },
  codePillText: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.6
  }
})
