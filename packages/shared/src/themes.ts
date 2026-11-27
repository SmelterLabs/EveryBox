import type { AccountIconId, ThemeId } from './types'

export interface EveryBoxThemeTokens {
  id: ThemeId
  label: string
  description: string
  isDark: boolean
  statusBarStyle: 'light' | 'dark'
  // 4-step neutral ladder + navigation bar container
  bgSidebar: string // surfaceContainerLowest (true #000000 on OLED black)
  bgList: string // surfaceContainerLow
  bgNavBar: string // surfaceContainer (Bottom NavigationBar / drawer)
  bgMain: string // surface / background
  bgElevated: string // surfaceContainerHigh (cards, sheets, snackbar)
  bgHover: string // surfaceContainerHighest (pressed / hover)
  bgSelected: string // primaryContainer
  // Borders (OLED black lifted to 0.12 / 0.18 on mobile for crisp edge legibility)
  borderSubtle: string // outlineVariant (mobile)
  borderStrong: string // outline (mobile)
  // Typography (WCAG AA verified across both surface and surfaceContainerHigh)
  textPrimary: string // onSurface (>=12.5:1 AAA)
  textSecondary: string // onSurfaceVariant (>=5.77:1 AA)
  textMuted: string // mobile-calibrated caption/muted (>=5.28:1 AA)
  textMutedDesktop: string // desktop muted value from themes.css
  // Primary & Accent
  accent: string // non-text UI indicators: icons, unread dots, focus rings
  accentBtn: string // filled primary CTA & FAB (#2563eb -> 5.17:1 AA w/ #ffffff)
  onPrimary: string // #ffffff
  onPrimaryContainer: string // text on primaryContainer
  accentSoft: string // secondaryContainer (2FA pill, active chips, AI pills)
  accentText: string // onSecondaryContainer (mobile AA >=5.53:1)
  accentTextNeutral: string // accent text on neutral surfaces
  // Semantic signals (WCAG AA verified on both main and elevated)
  danger: string // error (>=5.09:1 AA)
  dangerSoft: string // subtle destructive tint
  success: string // everyboxSuccess (>=4.55:1 AA)
  amber: string // everyboxAmber (Autopilot, stars, AI draft sparkle)
  amberSoft: string // subtle amber pill tint
  // Multi-account row wash caps (Whispered Account Tint Rule)
  accountWashPeakAlpha: number // 0.12 normal, 0.14 OLED black cap
  accountWashMidAlpha: number // 0.04 normal, 0.04 OLED black
  accountWashSelectedAlpha: number // 0.18 normal, 0.14 OLED black
  accountWashFadeStopPercent: number // 72% normal, 68% OLED black
}

export const EVERYBOX_THEMES: Record<ThemeId, EveryBoxThemeTokens> = {
  dark: {
    id: 'dark',
    label: 'Dark',
    description: 'Calm midnight-slate default',
    isDark: true,
    statusBarStyle: 'light',
    bgSidebar: '#11151d',
    bgList: '#151a24',
    bgNavBar: '#1c2330',
    bgMain: '#181e29',
    bgElevated: '#202837',
    bgHover: '#263042',
    bgSelected: '#1c2f4f',
    borderSubtle: 'rgba(210, 225, 255, 0.08)',
    borderStrong: 'rgba(210, 225, 255, 0.14)',
    textPrimary: '#eef2f9',
    textSecondary: '#9aa7bc',
    textMuted: '#8f9db6',
    textMutedDesktop: '#6b7890',
    accent: '#3b82f6',
    accentBtn: '#2563eb',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#eef2f9',
    accentSoft: 'rgba(59, 130, 246, 0.18)',
    accentText: '#7cb8ff',
    accentTextNeutral: '#60a5fa',
    danger: '#f87171',
    dangerSoft: 'rgba(248, 113, 113, 0.14)',
    success: '#2dd4bf',
    amber: '#f5b841',
    amberSoft: 'rgba(245, 184, 65, 0.18)',
    accountWashPeakAlpha: 0.12,
    accountWashMidAlpha: 0.04,
    accountWashSelectedAlpha: 0.18,
    accountWashFadeStopPercent: 72
  },
  black: {
    id: 'black',
    label: 'Black (OLED)',
    description: 'True #000000 OLED rail & list backdrop',
    isDark: true,
    statusBarStyle: 'light',
    bgSidebar: '#000000',
    bgList: '#07080a',
    bgNavBar: '#0f1218',
    bgMain: '#0b0d11',
    bgElevated: '#14171f',
    bgHover: '#1c212c',
    bgSelected: '#162642',
    borderSubtle: 'rgba(210, 225, 255, 0.12)',
    borderStrong: 'rgba(210, 225, 255, 0.18)',
    textPrimary: '#f4f7fb',
    textSecondary: '#9aa5b6',
    textMuted: '#8792a7',
    textMutedDesktop: '#687386',
    accent: '#3b82f6',
    accentBtn: '#2563eb',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#f4f7fb',
    accentSoft: 'rgba(59, 130, 246, 0.20)',
    accentText: '#7cb8ff',
    accentTextNeutral: '#60a5fa',
    danger: '#f87171',
    dangerSoft: 'rgba(248, 113, 113, 0.14)',
    success: '#2dd4bf',
    amber: '#f5b841',
    amberSoft: 'rgba(245, 184, 65, 0.18)',
    accountWashPeakAlpha: 0.14,
    accountWashMidAlpha: 0.04,
    accountWashSelectedAlpha: 0.14,
    accountWashFadeStopPercent: 68
  },
  graphite: {
    id: 'graphite',
    label: 'Graphite',
    description: 'Soft studio slate',
    isDark: true,
    statusBarStyle: 'light',
    bgSidebar: '#14181f',
    bgList: '#181d26',
    bgNavBar: '#202733',
    bgMain: '#1c222c',
    bgElevated: '#242c38',
    bgHover: '#2b3442',
    bgSelected: '#20324d',
    borderSubtle: 'rgba(210, 225, 255, 0.08)',
    borderStrong: 'rgba(210, 225, 255, 0.15)',
    textPrimary: '#eef2f8',
    textSecondary: '#9aa7ba',
    textMuted: '#93a0b5',
    textMutedDesktop: '#69768a',
    accent: '#3b82f6',
    accentBtn: '#2563eb',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#eef2f8',
    accentSoft: 'rgba(59, 130, 246, 0.18)',
    accentText: '#7cb8ff',
    accentTextNeutral: '#60a5fa',
    danger: '#f87171',
    dangerSoft: 'rgba(248, 113, 113, 0.14)',
    success: '#2dd4bf',
    amber: '#f5b841',
    amberSoft: 'rgba(245, 184, 65, 0.18)',
    accountWashPeakAlpha: 0.12,
    accountWashMidAlpha: 0.04,
    accountWashSelectedAlpha: 0.18,
    accountWashFadeStopPercent: 72
  },
  light: {
    id: 'light',
    label: 'Light',
    description: 'Crisp cool-white daylight',
    isDark: false,
    statusBarStyle: 'dark',
    bgSidebar: '#f4f6fa',
    bgList: '#fafbfd',
    bgNavBar: '#f4f6fa',
    bgMain: '#ffffff',
    bgElevated: '#f1f4f9',
    bgHover: '#e7ecf4',
    bgSelected: '#dbeafe',
    borderSubtle: 'rgba(15, 23, 42, 0.07)',
    borderStrong: 'rgba(15, 23, 42, 0.13)',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#58657a',
    textMutedDesktop: '#7c8aa0',
    accent: '#2563eb',
    accentBtn: '#2563eb',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#1d4ed8',
    accentSoft: 'rgba(37, 99, 235, 0.12)',
    accentText: '#1d4ed8',
    accentTextNeutral: '#1d4ed8',
    danger: '#c81e22',
    dangerSoft: 'rgba(200, 30, 34, 0.10)',
    success: '#0f766e',
    amber: '#d97706',
    amberSoft: 'rgba(217, 119, 6, 0.14)',
    accountWashPeakAlpha: 0.12,
    accountWashMidAlpha: 0.04,
    accountWashSelectedAlpha: 0.18,
    accountWashFadeStopPercent: 72
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    description: 'Warm stone low-glare reading',
    isDark: false,
    statusBarStyle: 'dark',
    bgSidebar: '#f0eee9',
    bgList: '#f6f5f0',
    bgNavBar: '#f0eee9',
    bgMain: '#fbfaf7',
    bgElevated: '#eceae3',
    bgHover: '#e4e1d8',
    bgSelected: '#dce8fb',
    borderSubtle: 'rgba(30, 41, 59, 0.09)',
    borderStrong: 'rgba(30, 41, 59, 0.16)',
    textPrimary: '#1c222b',
    textSecondary: '#525d6d',
    textMuted: '#566070',
    textMutedDesktop: '#828d9c',
    accent: '#2563eb',
    accentBtn: '#2563eb',
    onPrimary: '#ffffff',
    onPrimaryContainer: '#1d4ed8',
    accentSoft: 'rgba(37, 99, 235, 0.13)',
    accentText: '#1d4ed8',
    accentTextNeutral: '#1d4ed8',
    danger: '#b91c1c',
    dangerSoft: 'rgba(185, 28, 28, 0.10)',
    success: '#0f766e',
    amber: '#b45309',
    amberSoft: 'rgba(180, 83, 9, 0.14)',
    accountWashPeakAlpha: 0.12,
    accountWashMidAlpha: 0.04,
    accountWashSelectedAlpha: 0.18,
    accountWashFadeStopPercent: 72
  }
}

export const THEME_IDS: readonly ThemeId[] = ['dark', 'black', 'graphite', 'light', 'paper'] as const

export function getThemeTokens(id: ThemeId): EveryBoxThemeTokens {
  return EVERYBOX_THEMES[id] ?? EVERYBOX_THEMES.dark
}

/** Curated 10-swatch multi-account identity palette (matches desktop Sidebar.tsx & DESIGN.md). */
export const COLOR_SWATCHES: readonly string[] = [
  '#3B82F6',
  '#2DD4BF',
  '#A78BFA',
  '#34C77B',
  '#F5B841',
  '#EC5C8A',
  '#E87A48',
  '#EF4444',
  '#818CF8',
  '#94A3B8'
] as const

export interface AccountColorSwatch {
  name: string
  hex: string
}

export const ACCOUNT_COLOR_SWATCHES: readonly AccountColorSwatch[] = [
  { name: 'Cobalt', hex: '#3B82F6' },
  { name: 'Mint', hex: '#2DD4BF' },
  { name: 'Lavender', hex: '#A78BFA' },
  { name: 'Emerald', hex: '#34C77B' },
  { name: 'Amber', hex: '#F5B841' },
  { name: 'Rose', hex: '#EC5C8A' },
  { name: 'Terracotta', hex: '#E87A48' },
  { name: 'Crimson', hex: '#EF4444' },
  { name: 'Indigo', hex: '#818CF8' },
  { name: 'Slate', hex: '#94A3B8' }
] as const

export interface AccountIconOption {
  id: AccountIconId
  label: string
  lucideName: string | null
}

/** Canonical 12 Lucide symbols + dot-only option (matches desktop AccountIcon.tsx & DESIGN.md). */
export const ACCOUNT_ICON_OPTIONS: readonly AccountIconOption[] = [
  { id: 'none', label: 'None (dot)', lucideName: null },
  { id: 'home', label: 'Home', lucideName: 'Home' },
  { id: 'briefcase', label: 'Work', lucideName: 'Briefcase' },
  { id: 'building', label: 'Company', lucideName: 'Building2' },
  { id: 'flame', label: 'Flame', lucideName: 'Flame' },
  { id: 'rocket', label: 'Rocket', lucideName: 'Rocket' },
  { id: 'globe', label: 'Globe', lucideName: 'Globe' },
  { id: 'shield', label: 'Shield', lucideName: 'Shield' },
  { id: 'star', label: 'Star', lucideName: 'Star' },
  { id: 'heart', label: 'Heart', lucideName: 'Heart' },
  { id: 'code', label: 'Code', lucideName: 'Code2' },
  { id: 'user', label: 'Person', lucideName: 'User' },
  { id: 'sparkles', label: 'Sparkles', lucideName: 'Sparkles' }
] as const

/** Canonical mobile layout & gesture guardrails from DESIGN.md & ANDROID-DESIGN-SPEC.md. */
export const MOBILE_LAYOUT_TOKENS = {
  minTouchTargetDp: 48,
  touchTargetGapDp: 8,
  swipeEdgeExclusionMinDp: 28,
  swipeEdgeExclusionRecDp: 36,
  compactBreakpointDp: 600,
  expandedBreakpointDp: 840,
  bottomNavDestinations: ['mail', 'calendar', 'brief', 'search'] as const
} as const

/** Convert a `#RRGGBB` account swatch hex into an `rgba(r, g, b, alpha)` string for gradient washes. */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim()
  if (clean.length !== 6) return `rgba(59, 130, 246, ${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return `rgba(59, 130, 246, ${alpha})`
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
