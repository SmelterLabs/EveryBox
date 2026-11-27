import React, { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Rect } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { getThemeTokens } from '@everybox/shared'
import { useMobileStore } from '../store/useMobileStore'

const AnimatedRect = Animated.createAnimatedComponent(Rect)

interface UndoFuseSnackbarProps {
  bottomOffset?: number
}

export const UndoFuseSnackbar: React.FC<UndoFuseSnackbarProps> = ({ bottomOffset = 16 }) => {
  const themeId = useMobileStore((s) => s.themeId)
  const toast = useMobileStore((s) => s.toast)
  const triggerUndo = useMobileStore((s) => s.triggerUndo)
  const theme = getThemeTokens(themeId)

  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!toast || !toast.onUndo) return
    progress.setValue(0)
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: toast.durationMs,
      easing: Easing.linear,
      useNativeDriver: false
    })
    anim.start()
    return () => anim.stop()
  }, [toast?.id])

  if (!toast) return null

  const perimeter = 196
  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, perimeter]
  })

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom: bottomOffset }]}
    >
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.snackbar,
          {
            backgroundColor: theme.bgElevated,
            borderColor: theme.borderStrong
          }
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.message, { color: theme.textPrimary }]}
        >
          {toast.message}
        </Text>

        {toast.onUndo && (
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              triggerUndo()
            }}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            style={styles.undoHitArea}
          >
            <View style={[styles.undoBtn, { backgroundColor: theme.accentSoft }]}>
              <Svg
                width={68}
                height={32}
                viewBox="0 0 68 32"
                style={StyleSheet.absoluteFill}
              >
                <Rect
                  x={1}
                  y={1}
                  width={66}
                  height={30}
                  rx={8}
                  ry={8}
                  fill="none"
                  stroke={theme.borderStrong}
                  strokeWidth={1.5}
                  opacity={0.35}
                />
                <AnimatedRect
                  x={1}
                  y={1}
                  width={66}
                  height={30}
                  rx={8}
                  ry={8}
                  fill="none"
                  stroke={theme.accent}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray={`${perimeter} ${perimeter}`}
                  strokeDashoffset={strokeDashoffset}
                />
              </Svg>
              <Text style={[styles.undoText, { color: theme.accentText }]}>Undo</Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 50
  },
  snackbar: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    elevation: 6
  },
  message: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600'
  },
  undoHitArea: {
    minWidth: 68,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  undoBtn: {
    width: 68,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  undoText: {
    fontSize: 13,
    fontWeight: '700'
  }
})
