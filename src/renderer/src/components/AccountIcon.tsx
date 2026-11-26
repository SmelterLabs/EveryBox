import React from 'react'
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
} from 'lucide-react'
import type { AccountIconId } from '../../../shared/types'

export const ACCOUNT_ICON_OPTIONS: { id: AccountIconId; label: string }[] = [
  { id: 'none', label: 'None (dot)' },
  { id: 'home', label: 'Home' },
  { id: 'briefcase', label: 'Work' },
  { id: 'building', label: 'Company' },
  { id: 'flame', label: 'Flame' },
  { id: 'rocket', label: 'Rocket' },
  { id: 'globe', label: 'Globe' },
  { id: 'shield', label: 'Shield' },
  { id: 'star', label: 'Star' },
  { id: 'heart', label: 'Heart' },
  { id: 'code', label: 'Code' },
  { id: 'user', label: 'Person' },
  { id: 'sparkles', label: 'Sparkles' }
]

export const AccountIcon: React.FC<{
  icon?: AccountIconId
  size?: number
  color?: string
  className?: string
}> = ({ icon, size = 12, color, className }) => {
  if (!icon || icon === 'none') return null
  const props = { size, style: color ? { color } : undefined, className, strokeWidth: 2.2 }
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
  title?: string
}> = ({ icon, color, size = 'sm', borderColor, title }) => {
  const hasIcon = Boolean(icon && icon !== 'none')
  if (!hasIcon) {
    const dim = size === 'xs' ? 'h-2 w-2' : size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5'
    return (
      <span
        className={`inline-block shrink-0 rounded-full ${borderColor ? 'border-2' : ''} ${dim}`}
        style={{ background: color, borderColor }}
        title={title}
      />
    )
  }

  const box = size === 'xs' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-[18px] w-[18px]'
  const iconPx = size === 'xs' ? 9 : size === 'md' ? 11 : 10
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white shadow-sm ${
        borderColor ? 'border-[1.5px]' : ''
      } ${box}`}
      style={{ background: color, borderColor }}
      title={title}
    >
      <AccountIcon icon={icon} size={iconPx} color="#ffffff" />
    </span>
  )
}
