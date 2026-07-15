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
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(toLocalMidnight(dateString))
}

export function formatRelativeExpiration(dateString) {
  const days = daysUntil(dateString)
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  if (days > 1) return `Expires in ${days} days`
  if (days === -1) return 'Expired yesterday'
  return `Expired ${Math.abs(days)} days ago`
}
