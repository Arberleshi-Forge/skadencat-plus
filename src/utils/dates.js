const DAY_IN_MILLISECONDS = 86_400_000

function toLocalMidnight(dateLike) {
  if (typeof dateLike === 'string') {
    const [year, month, day] = dateLike.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const date = new Date(dateLike)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function daysUntil(dateString) {
  return Math.round((toLocalMidnight(dateString) - toLocalMidnight(new Date())) / DAY_IN_MILLISECONDS)
}

export function expirationGroup(dateString) {
  const days = daysUntil(dateString)
  if (days < 0) return 'expired'
  if (days <= 7) return 'seven'
  if (days <= 30) return 'thirty'
  return 'safe'
}

export function formatDate(dateString) {
  return new Intl.DateTimeFormat('sq-AL', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(toLocalMidnight(dateString))
}

export function formatRelativeExpiration(dateString) {
  const days = daysUntil(dateString)
  if (days === 0) return 'Skadon sot'
  if (days === 1) return 'Skadon nesër'
  if (days > 1) return `Skadon pas ${days} ditësh`
  if (days === -1) return 'Ka skaduar dje'
  return `Ka skaduar para ${Math.abs(days)} ditësh`
}
