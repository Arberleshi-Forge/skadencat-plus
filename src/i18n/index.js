import { englishMessages } from './en.js'

export const LANGUAGE_STORAGE_KEY = 'skadencat-plus.language'
const supportedLanguages = new Set(['sq', 'en'])
let language = 'en'
let preferenceStorage

export function resolveLanguage(storedLanguage, browserLanguages = []) {
  if (supportedLanguages.has(storedLanguage)) return storedLanguage
  for (const candidate of browserLanguages) {
    if (typeof candidate !== 'string') continue
    const primary = candidate.toLowerCase().split('-')[0]
    if (supportedLanguages.has(primary)) return primary
  }
  return 'en'
}

export function initializeLanguage({ storage, browserLanguages = [] } = {}) {
  preferenceStorage = storage
  let storedLanguage
  try {
    storedLanguage = storage?.getItem(LANGUAGE_STORAGE_KEY)
  } catch {
    // A blocked preference store must not prevent access to the application.
  }
  language = resolveLanguage(storedLanguage, browserLanguages)
  return language
}

export function getLanguage() {
  return language
}

export function getLocale() {
  return language === 'sq' ? 'sq-AL' : 'en-GB'
}

export function setLanguage(nextLanguage) {
  if (!supportedLanguages.has(nextLanguage)) return false
  language = nextLanguage
  try {
    preferenceStorage?.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Switching still works for this session when preferences cannot be saved.
  }
  return true
}

export function t(message, parameters = {}) {
  const translated = language === 'en' && Object.hasOwn(englishMessages, message)
    ? englishMessages[message]
    : message
  return translated.replace(/\{(\w+)\}/g, (placeholder, key) =>
    Object.hasOwn(parameters, key) ? String(parameters[key]) : placeholder,
  )
}
