import React from 'react'
import {
  Archive,
  Bookmark,
  Briefcase,
  Folder as FolderLucide,
  Heart,
  Home,
  Plane,
  Receipt,
  Shield,
  Sparkles,
  Star,
  Tag
} from 'lucide-react'
import type { Folder } from '../../../shared/types'

export interface NordicFolderColor {
  id: string
  label: string
  hex: string
}

export const NORDIC_FOLDER_COLORS: readonly NordicFolderColor[] = [
  { id: 'slate', label: 'Slate', hex: '#64748B' },
  { id: 'fjord', label: 'Fjord Blue', hex: '#3B82F6' },
  { id: 'pine', label: 'Pine', hex: '#10B981' },
  { id: 'teal', label: 'Teal', hex: '#2DD4BF' },
  { id: 'amber', label: 'Amber', hex: '#E5A424' },
  { id: 'terracotta', label: 'Terracotta', hex: '#E87A48' },
  { id: 'rose', label: 'Rose', hex: '#EC5C8A' },
  { id: 'plum', label: 'Plum', hex: '#A78BFA' }
] as const

export type FolderIconId =
  | 'folder'
  | 'tag'
  | 'briefcase'
  | 'receipt'
  | 'home'
  | 'plane'
  | 'heart'
  | 'star'
  | 'bookmark'
  | 'shield'
  | 'archive'
  | 'sparkles'

export const FOLDER_ICON_OPTIONS: readonly { id: FolderIconId; label: string }[] = [
  { id: 'folder', label: 'Folder' },
  { id: 'tag', label: 'Tag' },
  { id: 'briefcase', label: 'Work' },
  { id: 'receipt', label: 'Receipts' },
  { id: 'home', label: 'Home' },
  { id: 'plane', label: 'Travel' },
  { id: 'heart', label: 'Personal' },
  { id: 'star', label: 'Starred' },
  { id: 'bookmark', label: 'Reading' },
  { id: 'shield', label: 'Security' },
  { id: 'archive', label: 'Archive' },
  { id: 'sparkles', label: 'Special' }
] as const

const ICON_COMPONENTS: Record<FolderIconId, React.ComponentType<{ size?: number; style?: React.CSSProperties; className?: string }>> = {
  folder: FolderLucide,
  tag: Tag,
  briefcase: Briefcase,
  receipt: Receipt,
  home: Home,
  plane: Plane,
  heart: Heart,
  star: Star,
  bookmark: Bookmark,
  shield: Shield,
  archive: Archive,
  sparkles: Sparkles
}

export function renderFolderIcon(
  iconId: string | null | undefined,
  isGmail: boolean,
  color?: string | null,
  size = 13
): React.ReactNode {
  const key = iconId && iconId in ICON_COMPONENTS ? (iconId as FolderIconId) : isGmail ? 'tag' : 'folder'
  const IconComp = ICON_COMPONENTS[key]
  return React.createElement(IconComp, {
    size,
    style: color ? { color } : undefined,
    className: 'shrink-0'
  })
}

export function getLeafFolderName(folder: Pick<Folder, 'name' | 'path' | 'delimiter'>): string {
  const delimiter = folder.delimiter || '/'
  const rawName = (folder.name || '').trim()
  if (rawName && !rawName.includes(delimiter)) {
    return rawName
  }
  const source = rawName || (folder.path || '').trim()
  if (!source) return 'Folder'
  const parts = source.split(delimiter).filter(Boolean)
  return parts[parts.length - 1] || source
}

export interface FolderTreeNode {
  key: string
  folder: Folder | null
  name: string
  fullPath: string
  depth: number
  children: FolderTreeNode[]
  unreadCount: number
  rolledUpUnread: number
  hasChildren: boolean
  isVirtual: boolean
}

function getFolderSegments(folder: Folder, stripLeadingInbox: boolean): { segments: string[]; fullPaths: string[] } {
  const delim = folder.delimiter || '/'
  const rawPath = (folder.path || folder.name || '').trim()
  const rawParent = (folder.parentPath || '').trim()

  let rawSegments: string[]
  if (rawParent) {
    const parentParts = rawParent.split(delim).filter(Boolean)
    const leaf = getLeafFolderName(folder)
    // If rawPath already starts with rawParent + delim, split rawPath directly
    const lowerPath = rawPath.toLowerCase()
    const lowerPrefix = `${rawParent.toLowerCase()}${delim.toLowerCase()}`
    if (lowerPath.startsWith(lowerPrefix)) {
      rawSegments = rawPath.split(delim).filter(Boolean)
    } else {
      rawSegments = [...parentParts, leaf]
    }
  } else {
    rawSegments = rawPath.split(delim).filter(Boolean)
  }

  if (rawSegments.length === 0) {
    rawSegments = [folder.name || 'Folder']
  }

  // Strip redundant IMAP INBOX prefix when building custom-folder subtrees
  if (stripLeadingInbox && rawSegments.length > 1 && rawSegments[0].toLowerCase() === 'inbox') {
    const kept = rawSegments.slice(1)
    const fullPaths = kept.map((_, idx) => [rawSegments[0], ...kept.slice(0, idx + 1)].join(delim))
    return { segments: kept, fullPaths }
  }

  const fullPaths = rawSegments.map((_, idx) => rawSegments.slice(0, idx + 1).join(delim))
  return { segments: rawSegments, fullPaths }
}

interface InternalNode {
  key: string
  folder: Folder | null
  name: string
  fullPath: string
  childrenMap: Map<string, InternalNode>
}

export function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  if (!folders.length) return []

  const hasExplicitInboxInList = folders.some((f) => (f.path || f.name || '').toLowerCase() === 'inbox')
  const stripLeadingInbox = !hasExplicitInboxInList
  const rootMap = new Map<string, InternalNode>()

  for (const folder of folders) {
    const { segments, fullPaths } = getFolderSegments(folder, stripLeadingInbox)
    let currentMap = rootMap

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const segKey = seg.toLowerCase()
      const isLeaf = i === segments.length - 1
      const pathSoFar = fullPaths[i]

      let node = currentMap.get(segKey)
      if (!node) {
        node = {
          key: isLeaf ? folder.id : `virtual:${folder.accountId}:${pathSoFar}`,
          folder: isLeaf ? folder : null,
          name: isLeaf ? getLeafFolderName(folder) : seg,
          fullPath: isLeaf ? folder.path || pathSoFar : pathSoFar,
          childrenMap: new Map()
        }
        currentMap.set(segKey, node)
      } else if (isLeaf && !node.folder) {
        // Promote previously created virtual parent to real folder node
        node.key = folder.id
        node.folder = folder
        node.name = getLeafFolderName(folder)
        node.fullPath = folder.path || pathSoFar
      }

      currentMap = node.childrenMap
    }
  }

  const finalize = (map: Map<string, InternalNode>, depth: number): FolderTreeNode[] => {
    const nodes: FolderTreeNode[] = []

    for (const internal of map.values()) {
      const children = finalize(internal.childrenMap, depth + 1)
      const ownUnread =
        internal.folder && !internal.folder.muteBadge ? Math.max(0, internal.folder.unreadCount || 0) : 0
      const childUnread = children.reduce((sum, c) => sum + c.rolledUpUnread, 0)

      nodes.push({
        key: internal.key,
        folder: internal.folder,
        name: internal.name,
        fullPath: internal.fullPath,
        depth,
        children,
        unreadCount: ownUnread,
        rolledUpUnread: ownUnread + childUnread,
        hasChildren: children.length > 0,
        isVirtual: internal.folder === null
      })
    }

    nodes.sort((a, b) => {
      const orderA = a.folder?.sortOrder ?? Number.MAX_SAFE_INTEGER
      const orderB = b.folder?.sortOrder ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

    return nodes
  }

  return finalize(rootMap, 0)
}
