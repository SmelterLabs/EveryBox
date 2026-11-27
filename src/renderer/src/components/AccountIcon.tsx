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
import type { AccountIconId, BuiltinAccountIconId } from '../../../shared/types'

export const ACCOUNT_ICON_OPTIONS: { id: BuiltinAccountIconId; label: string }[] = [
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

export function isCustomAccountIcon(icon?: AccountIconId | null): icon is `data:image/${string}` {
  return Boolean(icon && typeof icon === 'string' && icon.startsWith('data:image/'))
}

/**
 * Resize an uploaded image file (PNG, JPG, WebP, SVG, ICO, GIF) into a crisp
 * square PNG data URL suitable for storing in accounts.icon.
 */
export async function resizeImageFileToIconDataUrl(
  file: File,
  maxSize = 96
): Promise<`data:image/${string}`> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })

  if (!rawDataUrl.startsWith('data:image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, SVG, WebP, or ICO)')
  }

  return new Promise<`data:image/${string}`>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = maxSize
        canvas.height = maxSize
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(rawDataUrl as `data:image/${string}`)
          return
        }
        const iw = img.naturalWidth || maxSize
        const ih = img.naturalHeight || maxSize
        const scale = Math.min(maxSize / iw, maxSize / ih)
        const dw = Math.max(1, Math.round(iw * scale))
        const dh = Math.max(1, Math.round(ih * scale))
        const dx = Math.floor((maxSize - dw) / 2)
        const dy = Math.floor((maxSize - dh) / 2)
        ctx.clearRect(0, 0, maxSize, maxSize)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, dx, dy, dw, dh)
        const out = canvas.toDataURL('image/png')
        resolve(out as `data:image/${string}`)
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Could not decode image file'))
    img.src = rawDataUrl
  })
}

export const AccountIcon: React.FC<{
  icon?: AccountIconId
  size?: number
  color?: string
  className?: string
}> = ({ icon, size = 12, color, className }) => {
  if (!icon || icon === 'none') return null
  if (isCustomAccountIcon(icon)) {
    return (
      <img
        src={icon}
        alt=""
        draggable={false}
        className={`shrink-0 rounded-sm object-contain ${className || ''}`}
        style={{ width: size, height: size }}
      />
    )
  }
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
  if (isCustomAccountIcon(icon)) {
    const box = size === 'xs' ? 'h-4 w-4' : size === 'md' ? 'h-6 w-6' : 'h-[18px] w-[18px]'
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border shadow-sm ${box}`}
        style={{
          background: 'var(--bg-main)',
          borderColor: borderColor || color
        }}
        title={title}
      >
        <img
          src={icon}
          alt=""
          draggable={false}
          className="h-full w-full object-contain p-[1px]"
        />
      </span>
    )
  }

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
