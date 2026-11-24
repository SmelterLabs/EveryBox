export const isMac =
  typeof navigator !== 'undefined' &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)

export const modKeyPrefix = isMac ? '⌘' : 'Ctrl+'
