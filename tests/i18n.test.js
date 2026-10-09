import test from 'node:test'
import assert from 'node:assert/strict'
import { LANGUAGE_STORAGE_KEY, getLanguage, getLocale, initializeLanguage, resolveLanguage, setLanguage, t } from '../src/i18n/index.js'
import { daysUntil, expirationGroup, formatCheckedAt, formatDate, formatRelativeExpiration } from '../src/utils/dates.js'
import { calculateDeliveredPieces, calculateStockDistribution } from '../src/utils/deliveries.js'

test('a valid saved language takes precedence over browser languages', () => {
  assert.equal(resolveLanguage('en', ['sq-AL']), 'en')
  assert.equal(resolveLanguage('sq', ['en-US']), 'sq')
})

test('browser languages select the first supported language, with English as fallback', () => {
  assert.equal(resolveLanguage(null, ['fr-FR', 'SQ-al', 'en']), 'sq')
  assert.equal(resolveLanguage('invalid', ['en-US', 'sq-AL']), 'en')
  assert.equal(resolveLanguage(null, ['de-DE', null]), 'en')
  assert.equal(resolveLanguage(null), 'en')
})

test('switching persists only the separate language preference', () => {
  const records = new Map([['inventory', 'unchanged']])
  const storage = { getItem: (key) => records.get(key), setItem: (key, value) => records.set(key, value) }
  initializeLanguage({ storage, browserLanguages: ['sq'] })
  assert.equal(getLanguage(), 'sq')
  assert.equal(setLanguage('en'), true)
  assert.equal(records.get(LANGUAGE_STORAGE_KEY), 'en')
  assert.equal(records.get('inventory'), 'unchanged')
  assert.equal(setLanguage('de'), false)
  assert.equal(getLanguage(), 'en')
  assert.equal(initializeLanguage({ storage, browserLanguages: ['sq'] }), 'en')
})

test('blocked preference storage does not break initialization or switching', () => {
  initializeLanguage({ storage: { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }, browserLanguages: ['sq'] })
  assert.equal(getLanguage(), 'sq')
  assert.equal(setLanguage('en'), true)
  assert.equal(getLanguage(), 'en')
})

test('messages switch in both directions and substitute parameters literally', () => {
  initializeLanguage({ browserLanguages: ['en'] })
  assert.equal(t('Marketet'), 'Stores')
  assert.equal(t('Kanë mbetur: {days} ditë', { days: 7 }), 'Remaining: 7 days')
  assert.equal(t('Unknown {value}', { value: '$&' }), 'Unknown $&')
  setLanguage('sq')
  assert.equal(t('Marketet'), 'Marketet')
  assert.equal(t('Kanë mbetur: {days} ditë', { days: 7 }), 'Kanë mbetur: 7 ditë')
})

test('dates and missing-check messages follow the selected language', () => {
  initializeLanguage({ browserLanguages: ['en'] })
  assert.equal(getLocale(), 'en-GB')
  assert.equal(formatDate('2026-10-09'), '9 October 2026')
  assert.equal(formatCheckedAt('2026-10-09'), '9 October 2026')
  assert.equal(formatCheckedAt(null), 'Not checked yet')
  setLanguage('sq')
  assert.equal(formatDate('2026-10-09'), '9 Tetor 2026')
  assert.equal(formatCheckedAt(null), 'Nuk është kontrolluar ende')
})

test('switching language preserves expiration groups and stock calculations', () => {
  const date = '2026-10-09'
  const stock = { deliveredPieces: 120, inputUnit: 'case', piecesPerCase: 24, shelf: 2, warehouse: 1, returned: 1, damaged: 0 }
  initializeLanguage({ browserLanguages: ['sq'] })
  const expected = { days: daysUntil(date), group: expirationGroup(date), stock: calculateStockDistribution(stock) }
  const relativeSq = formatRelativeExpiration(date)
  setLanguage('en')
  assert.deepEqual({ days: daysUntil(date), group: expirationGroup(date), stock: calculateStockDistribution(stock) }, expected)
  assert.equal(calculateDeliveredPieces({ unit: 'case', caseCount: 5, piecesPerCase: 24 }), 120)
  assert.notEqual(formatRelativeExpiration(date), relativeSq)
})
