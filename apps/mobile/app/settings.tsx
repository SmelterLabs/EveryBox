import React, { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeft,
  Check,
  Cpu,
  Mail,
  Palette,
  ShieldCheck
} from 'lucide-react-native'
import {
  EVERYBOX_THEMES,
  getThemeTokens,
  MAIL_PROVIDER_PRESETS,
  THEME_IDS,
  type AccountRowStyle,
  type ThemeId
} from '@everybox/shared'
import { getNativeBridgeStatus } from '../modules/everybox-mail-native/src'
import { useMobileStore } from '../src/store/useMobileStore'
import { AccountBadge } from '../src/components/AccountBadge'

const ROW_STYLES: { id: AccountRowStyle; label: string; desc: string }[] = [
  { id: 'gradient', label: 'Gradient', desc: 'Soft left wash + 3dp pill' },
  { id: 'bar', label: 'Bar', desc: '3dp vertical pill only' },
  { id: 'dot', label: 'Dot', desc: 'Badge on avatar only' }
]

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const themeId = useMobileStore((s) => s.themeId)
  const rowStyle = useMobileStore((s) => s.rowStyle)
  const accounts = useMobileStore((s) => s.accounts)
  const setThemeId = useMobileStore((s) => s.setThemeId)
  const setRowStyle = useMobileStore((s) => s.setRowStyle)
  const showToast = useMobileStore((s) => s.showToast)

  const theme = getThemeTokens(themeId)
  const bridgeStatus = useMemo(() => getNativeBridgeStatus(), [])

  const featuredPresets = useMemo(
    () =>
      MAIL_PROVIDER_PRESETS.filter((p) =>
        ['gmail-imap', 'microsoft-365', 'fastmail', 'icloud', 'custom-imap'].includes(p.id)
      ),
    []
  )

  return (
    <View style={[styles.container, { backgroundColor: theme.bgMain }]}>
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
          accessibilityLabel="Back"
          style={styles.iconBtn}
        >
          <ArrowLeft size={22} color={theme.textPrimary} strokeWidth={2.1} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Accounts &amp; Settings</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}>
        {/* 5-Theme Live Switcher */}
        <View style={styles.section}>
          <View style={styles.sectionHdr}>
            <Palette size={16} color={theme.accentText} />
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Theme</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.themeRow}>
            {THEME_IDS.map((id: ThemeId) => {
              const t = EVERYBOX_THEMES[id]
              const active = id === themeId
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    setThemeId(id)
                  }}
                  style={[
                    styles.themeCard,
                    {
                      backgroundColor: t.bgMain,
                      borderColor: active ? theme.accent : theme.borderStrong,
                      borderWidth: active ? 2 : 1
                    }
                  ]}
                >
                  <View style={styles.themeSwatches}>
                    <View style={[styles.swatchDot, { backgroundColor: t.bgSidebar }]} />
                    <View style={[styles.swatchDot, { backgroundColor: t.bgElevated }]} />
                    <View style={[styles.swatchDot, { backgroundColor: t.accentBtn }]} />
                  </View>
                  <Text style={[styles.themeName, { color: t.textPrimary }]}>{t.label}</Text>
                  {active && (
                    <View style={[styles.checkBadge, { backgroundColor: theme.accentBtn }]}>
                      <Check size={11} color="#ffffff" strokeWidth={3} />
                    </View>
                  )}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        {/* Account Row Style Switcher */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 8 }]}>
            Account Row Style
          </Text>
          <View style={styles.rowStyleGroup}>
            {ROW_STYLES.map((opt) => {
              const active = rowStyle === opt.id
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    void Haptics.selectionAsync()
                    setRowStyle(opt.id)
                  }}
                  style={[
                    styles.rowStyleCard,
                    {
                      backgroundColor: active ? theme.bgSelected : theme.bgElevated,
                      borderColor: active ? theme.accent : theme.borderSubtle
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.rowStyleTitle,
                      { color: active ? theme.accentText : theme.textPrimary }
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={[styles.rowStyleDesc, { color: theme.textMuted }]}>{opt.desc}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {/* Connected Accounts */}
        <View style={styles.section}>
          <View style={styles.sectionHdr}>
            <Mail size={16} color={theme.accentText} />
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
              Connected Accounts ({accounts.length})
            </Text>
          </View>
          {accounts.map((acc) => (
            <View
              key={acc.id}
              style={[
                styles.accountRow,
                { backgroundColor: theme.bgElevated, borderColor: theme.borderSubtle }
              ]}
            >
              <AccountBadge icon={acc.icon} color={acc.color} size="md" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.accName, { color: theme.textPrimary }]}>{acc.name}</Text>
                <Text style={[styles.accEmail, { color: theme.textMuted }]}>{acc.email}</Text>
              </View>
              <View style={[styles.providerTag, { backgroundColor: theme.bgMain }]}>
                <Text style={[styles.providerText, { color: theme.textSecondary }]}>
                  {acc.provider.toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Supported Account Providers (from @everybox/shared) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 8 }]}>
            Add Account Presets
          </Text>
          {featuredPresets.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => {
                void Haptics.selectionAsync()
                showToast(`${preset.name} ready in Phase 1 sync engine`, undefined, 2400)
              }}
              style={[
                styles.presetRow,
                { backgroundColor: theme.bgElevated, borderColor: theme.borderSubtle }
              ]}
            >
              <Text style={[styles.presetName, { color: theme.textPrimary }]}>{preset.name}</Text>
              <Text style={[styles.presetHint, { color: theme.textMuted }]}>
                {preset.setupHint}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Native Kotlin Bridge Status Readout */}
        <View style={styles.section}>
          <View style={styles.sectionHdr}>
            <Cpu size={16} color={theme.success} />
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
              Native Android Mail Bridge
            </Text>
          </View>
          <View
            style={[
              styles.bridgeCard,
              { backgroundColor: theme.bgElevated, borderColor: theme.borderStrong }
            ]}
          >
            <View style={styles.bridgeRow}>
              <ShieldCheck
                size={18}
                color={bridgeStatus.ready ? theme.success : theme.amber}
                strokeWidth={2.2}
              />
              <Text style={[styles.bridgeStatus, { color: theme.textPrimary }]}>
                {bridgeStatus.engine} · {bridgeStatus.ready ? 'Connected' : 'Fallback'}
              </Text>
            </View>
            <Text style={[styles.bridgeDetail, { color: theme.textSecondary }]}>
              Platform: {bridgeStatus.platform} · Android SDK API {bridgeStatus.sdkInt}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderBottomWidth: 1
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: { fontSize: 19, fontWeight: '700' },
  scroll: { padding: 16, gap: 22 },
  section: { gap: 8 },
  sectionHdr: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 14.5, fontWeight: '700' },
  themeRow: { gap: 10, paddingVertical: 2 },
  themeCard: {
    width: 112,
    padding: 12,
    borderRadius: 14,
    justifyContent: 'space-between',
    gap: 10
  },
  themeSwatches: { flexDirection: 'row', gap: 6 },
  swatchDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)'
  },
  themeName: { fontSize: 13, fontWeight: '700' },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rowStyleGroup: { flexDirection: 'row', gap: 8 },
  rowStyleCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1
  },
  rowStyleTitle: { fontSize: 13.5, fontWeight: '700' },
  rowStyleDesc: { fontSize: 11.5, marginTop: 3 },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1
  },
  accName: { fontSize: 14.5, fontWeight: '700' },
  accEmail: { fontSize: 12.5, marginTop: 1 },
  providerTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  providerText: { fontSize: 11, fontWeight: '700' },
  presetRow: { padding: 12, borderRadius: 12, borderWidth: 1 },
  presetName: { fontSize: 14, fontWeight: '700' },
  presetHint: { fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  bridgeCard: { padding: 14, borderRadius: 12, borderWidth: 1, gap: 6 },
  bridgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bridgeStatus: { fontSize: 14, fontWeight: '700' },
  bridgeDetail: { fontSize: 12.5, fontVariant: ['tabular-nums'] }
})
