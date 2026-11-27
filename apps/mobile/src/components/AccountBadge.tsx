import React from 'react'
import { View } from 'react-native'
import {
  Briefcase,
  Building2,
  Code2,
  Flame,
  Globe,
  Heart,
  Home,
  Rocket,
  Shield,
  Sparkles,
  Star,
  User
} from 'lucide-react-native'
import type { AccountIconId } from '@everybox/shared'

const DARK_INK_SWATCHES = new Set(['#2DD4BF', '#34C77B', '#F5B841', '#94A3B8'])

export function getBadgeIconColor(hex: string): string {
  return DARK_INK_SWATCHES.has(hex.toUpperCase()) ? '#0b1220' : '#ffffff'
}

export const AccountIconGlyph: React.FC<{
  icon?: AccountIconId
  size?: number
  color: string
}> = ({ icon, size = 10, color }) => {
  if (!icon || icon === 'none') return null
  const props = { size, color, strokeWidth: 2.4 }
  switch (icon) {
    case 'home':
      return <Home {...props} />
    case 'briefcase':
      return <Briefcase {...props} />
    case 'building':
      return <Building2 {...props} />
    case 'flame':
      return <Flame {...props} />
    case 'rocket':
      return <Rocket {...props} />
    case 'globe':
      return <Globe {...props} />
    case 'shield':
      return <Shield {...props} />
    case 'star':
      return <Star {...props} />
    case 'heart':
      return <Heart {...props} />
    case 'code':
      return <Code2 {...props} />
    case 'user':
      return <User {...props} />
    case 'sparkles':
      return <Sparkles {...props} />
    default:
      return null
  }
}

export const AccountBadge: React.FC<{
  icon?: AccountIconId
  color: string
  size?: 'xs' | 'sm' | 'md'
  borderColor?: string
}> = ({ icon, color, size = 'sm', borderColor }) => {
  const hasIcon = Boolean(icon && icon !== 'none')
  if (!hasIcon) {
    const dim = size === 'xs' ? 8 : size === 'md' ? 12 : 10
    return (
      <View
        style={{
          width: dim,
          height: dim,
          borderRadius: 999,
          backgroundColor: color,
          borderWidth: borderColor ? 1.5 : 0,
          borderColor
        }}
      />
    )
  }

  const box = size === 'xs' ? 16 : size === 'md' ? 22 : 18
  const iconPx = size === 'xs' ? 9 : size === 'md' ? 12 : 10
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: 999,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: borderColor ? 1.5 : 0,
        borderColor
      }}
    >
      <AccountIconGlyph icon={icon} size={iconPx} color={getBadgeIconColor(color)} />
    </View>
  )
}
