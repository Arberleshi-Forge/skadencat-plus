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
  const parts = new Intl.DateTimeFormat('sq-AL', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).formatToParts(toLocalMidnight(dateString))

  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  const month = part('month')
  const capitalizedMonth = month ? `${month.charAt(0).toLocaleUpperCase('sq-AL')}${month.slice(1)}` : ''
  return `${part('day')} ${capitalizedMonth} ${part('year')}`
}

export function formatRelativeExpiration(dateString) {
  const days = daysUntil(dateString)
  if (days >= 0) return `Kanë mbetur: ${days} ditë`
  return `Të skaduara prej ${Math.abs(days)} ditësh`
}

export function formatCheckedAt(dateString) {
  if (!dateString) return 'Nuk është kontrolluar ende'

  const parts = new Intl.DateTimeFormat('sq-AL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(dateString))

  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  const month = part('month')
  const capitalizedMonth = month ? `${month.charAt(0).toLocaleUpperCase('sq-AL')}${month.slice(1)}` : ''
  return `${part('day')} ${capitalizedMonth} ${part('year')} • ${part('hour')}:${part('minute')}`
}
