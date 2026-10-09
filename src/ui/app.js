import {
  Barcode,
  Boxes,
  CalendarDays,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  createIcons,
  Hourglass,
  History,
  LayoutDashboard,
  NotebookText,
  Package,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Store,
  Tag,
  Truck,
  Warehouse,
} from 'lucide'
import {
  daysUntil,
  expirationGroup,
  formatCheckedAt,
  formatDate,
} from '../utils/dates.js'
import { calculateDeliveredPieces, calculateStockDistribution } from '../utils/deliveries.js'
import { getLanguage, getLocale, setLanguage, t } from '../i18n/index.js'

const PAGE_TITLES = {
  dashboard: ['Përmbledhje', 'Gjendja e inventarit me një shikim'],
  markets: ['Marketet', 'Menaxho marketet ku shpërndahen produktet.'],
  products: ['Produktet', 'Menaxho produktet dhe datat e skadencës.'],
  deliveries: ['Dërgesat', 'Menaxho lotet, sasitë dhe kontrollet e stokut.'],
  controls: ['Kontrollet', 'Regjistro kontrollet fizike të produkteve në market.'],
  expiring: ['Skadencat', 'Qëndro në kontroll të datave të skadencës.'],
}

const GROUPS = [
  { id: 'expired', label: 'Të skaduara', tone: 'danger' },
  { id: 'seven', label: 'Brenda 7 ditëve', tone: 'warning' },
  { id: 'thirty', label: 'Brenda 30 ditëve', tone: 'attention' },
  { id: 'safe', label: 'Në rregull', tone: 'success' },
]

const PRODUCT_STATUSES = [
  { id: 'shelf', label: 'Në raft', tone: 'blue' },
  { id: 'warehouse', label: 'Në magazinë', tone: 'purple' },
  { id: 'to-return', label: "Për t'u kthyer", tone: 'orange' },
  { id: 'returned', label: 'E kthyer', tone: 'green' },
  { id: 'missing', label: 'Nuk gjendet', tone: 'grey' },
]

const LUCIDE_ICONS = {
  Barcode,
  Boxes,
  CalendarDays,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Hourglass,
  History,
  LayoutDashboard,
  NotebookText,
  Package,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Store,
  Tag,
  Truck,
  Warehouse,
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function emptyState(title, message) {
  return `
    <div class="empty-state">
      <span class="empty-mark" aria-hidden="true">+</span>
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `
}

export function createApp({ root, marketRepository, productRepository, deliveryRepository }) {
  const state = {
    page: 'dashboard',
    storageUnavailable: false,
    markets: [],
    products: [],
    deliveries: [],
    query: '',
    filters: {
      marketId: 'all',
      status: 'all',
      year: 'all',
    },
    deliveryFilters: {
      marketId: 'all',
      productId: 'all',
      year: 'all',
    },
    expandedGroups: new Set(GROUPS.map(({ id }) => id)),
  }

  async function refresh() {
    ;[state.markets, state.products, state.deliveries] = await Promise.all([
      marketRepository.list(),
      productRepository.list(),
      deliveryRepository.list(),
    ])
    render()
  }

  function marketName(marketId) {
    return state.markets.find((market) => market.id === marketId)?.name || t('Market i panjohur')
  }

  function productStatus(product) {
    return PRODUCT_STATUSES.some((status) => status.id === product.status) ? product.status : 'shelf'
  }

  function statusDetails(product) {
    return PRODUCT_STATUSES.find((status) => status.id === productStatus(product))
  }

  function activeProducts() {
    return state.products.filter((product) => productStatus(product) !== 'returned')
  }

  function searchedProducts(products = state.products) {
    const query = state.query.trim().toLocaleLowerCase()
    if (!query) return products
    return products.filter((product) =>
      product.name.toLocaleLowerCase().includes(query)
      || (product.barcode || '').toLocaleLowerCase().includes(query)
      || marketName(product.marketId).toLocaleLowerCase().includes(query),
    )
  }

  function filteredProducts() {
    return searchedProducts().filter((product) => {
      const marketMatches = state.filters.marketId === 'all' || product.marketId === state.filters.marketId
      const statusMatches = state.filters.status === 'all' || productStatus(product) === state.filters.status
      const yearMatches = state.filters.year === 'all' || product.expirationDate.startsWith(state.filters.year)
      return marketMatches && statusMatches && yearMatches
    })
  }

  function deliveryStatus(delivery) {
    return PRODUCT_STATUSES.some((status) => status.id === delivery.status) ? delivery.status : 'shelf'
  }

  function deliveryStatusDetails(delivery) {
    return PRODUCT_STATUSES.find((status) => status.id === deliveryStatus(delivery))
  }

  function activeDeliveries() {
    return state.deliveries.filter((delivery) => deliveryStatus(delivery) !== 'returned')
  }

  function filteredDeliveries() {
    return state.deliveries.filter((delivery) => {
      const filters = state.deliveryFilters
      return (filters.marketId === 'all' || delivery.marketId === filters.marketId)
        && (filters.productId === 'all' || delivery.productId === filters.productId)
        && (filters.year === 'all' || delivery.expirationDate.startsWith(filters.year))
    })
  }

  function deliveryQuantityLabel(delivery) {
    if (delivery.unit === 'case') {
      return `${delivery.caseCount} ${t('koli ×')} ${delivery.piecesPerCase} ${t('copë =')} ${delivery.deliveredPieces} ${t('copë')}`
    }
    return `${delivery.deliveredPieces} ${t('copë')}`
  }

  function deliveryDifference(delivery) {
    return Number(deliveryDistribution(delivery).difference)
  }

  function deliveryDistribution(delivery) {
    if (delivery.latestControl) return delivery.latestControl
    return {
      shelf: 0,
      warehouse: 0,
      returned: deliveryStatus(delivery) === 'returned' ? delivery.deliveredPieces : 0,
      damaged: 0,
      difference: deliveryStatus(delivery) === 'returned' ? 0 : delivery.deliveredPieces,
    }
  }

  function renderIcons(scope = root) {
    createIcons({
      icons: LUCIDE_ICONS,
      root: scope,
      attrs: { 'stroke-width': 1.8 },
    })
  }

  function remainingTone(dateString) {
    const days = daysUntil(dateString)
    if (days <= 7) return 'danger'
    if (days <= 30) return 'attention'
    return 'success'
  }

  function dateInputValue(dateString) {
    return dateString ? dateString.slice(0, 10) : ''
  }

  function isValidDateInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  }

  function isPositiveInteger(value) {
    return Number.isInteger(Number(value)) && Number(value) > 0
  }

  function isNonNegativeInteger(value) {
    return Number.isInteger(Number(value)) && Number(value) >= 0
  }

  function normalizeProductName(value) {
    return String(value || '').trim().toLocaleLowerCase('sq-AL')
  }

  function findProductByBarcode(barcode) {
    const normalizedBarcode = String(barcode || '').trim()
    if (!normalizedBarcode) return null
    return state.products.find((product) => String(product.barcode || '').trim() === normalizedBarcode) || null
  }

  function updateDeliveryProductMatch(form) {
    if (!form) return
    const barcode = form.elements.barcode.value.trim()
    const productName = form.elements.productName.value.trim()
    const existing = findProductByBarcode(barcode)
    const match = form.querySelector('[data-barcode-match]')
    match.hidden = !existing
    form.dataset.matchedProductId = existing?.id || ''
    if (!existing) {
      match.replaceChildren()
      return
    }
    const namesDiffer = productName && normalizeProductName(productName) !== normalizeProductName(existing.name)
    match.classList.toggle('barcode-warning', namesDiffer)
    match.innerHTML = namesDiffer
      ? `<strong>${t('Ky barkod ekziston si “')}${escapeHtml(existing.name)}”.</strong><span>${t('Përdor produktin ekzistues ose korrigjo emrin.')}</span><button type="button" data-action="use-existing-product" data-id="${existing.id}">${t('Përdor')} ${escapeHtml(existing.name)}</button>`
      : `<strong>${t('Produkti ekzistues do të përdoret.')}</strong><span>${escapeHtml(existing.name)}</span>`
  }

  function updateDeliveryCalculation(form) {
    if (!form) return
    const isCase = form.elements.unit.value === 'case'
    form.querySelector('[data-piece-quantity]').hidden = isCase
    form.querySelector('[data-case-count]').hidden = !isCase
    form.querySelector('[data-pieces-per-case]').hidden = !isCase
    form.elements.quantity.required = !isCase
    form.elements.caseCount.required = isCase
    form.elements.piecesPerCase.required = isCase
    const preview = form.querySelector('[data-delivery-calculation]')
    preview.hidden = !isCase
    if (!isCase) return
    const cases = Number(form.elements.caseCount.value) || 0
    const pieces = Number(form.elements.piecesPerCase.value) || 0
    preview.textContent = cases && pieces ? `${cases} ${t('koli ×')} ${pieces} ${t('copë =')} ${cases * pieces} ${t('copë')}` : t('Plotëso numrin e kolive dhe copët për koli.')
  }

  function updateControlCalculation(form, delivery) {
    if (!form || !delivery) return null
    const inputUnit = form.elements.inputUnit.value
    const rawAllocated = ['shelf', 'warehouse', 'returned', 'damaged']
      .reduce((total, field) => total + (Number(form.elements[field].value) || 0), 0)
    const values = calculateStockDistribution({
      deliveredPieces: delivery.deliveredPieces,
      inputUnit,
      piecesPerCase: delivery.piecesPerCase,
      shelf: Number(form.elements.shelf.value) || 0,
      warehouse: Number(form.elements.warehouse.value) || 0,
      returned: Number(form.elements.returned.value) || 0,
      damaged: Number(form.elements.damaged.value) || 0,
    })
    const { difference } = values
    const preview = form.querySelector('[data-control-calculation]')
    preview.classList.toggle('calculation-negative', difference < 0)
    preview.innerHTML = `${inputUnit === 'case' ? `${rawAllocated} ${t('koli ×')} ${delivery.piecesPerCase} ${t('copë =')} ${rawAllocated * delivery.piecesPerCase} ${t('copë të shpërndara.')}<br>` : ''}<strong>${t('Diferenca për verifikim:')} ${difference} ${t('copë')}</strong>`
    return { ...values, difference }
  }

  function productRow(product, { actions = false } = {}) {
    const group = expirationGroup(product.expirationDate)
    const quantity = Number.isFinite(Number(product.quantity)) ? Number(product.quantity) : 0
    const remainingDays = daysUntil(product.expirationDate)
    const hasBeenChecked = Boolean(product.lastCheckedAt)
    const status = statusDetails(product)
    const canReturn = status.id !== 'returned' && quantity > 0
    const checkButtonLabel = hasBeenChecked ? t('Përditëso kontrollin') : t('E kontrollova')
    return `
      <article class="product-row">
        <div class="product-avatar tone-${group}" aria-hidden="true">${escapeHtml(product.name.charAt(0).toUpperCase())}</div>
        <div class="product-info">
          <div class="product-name-line">
            <h3>${escapeHtml(product.name)}</h3>
            ${actions ? `
              <button class="more-button" data-action="edit-product" data-id="${product.id}" aria-label="${t('Modifiko')} ${escapeHtml(product.name)}">•••</button>
            ` : ''}
          </div>
          <div class="product-meta-grid">
            <div><span class="product-meta-label"><i data-lucide="store" class="product-field-icon"></i>${t('Marketi')}</span><strong>${escapeHtml(marketName(product.marketId))}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="barcode" class="product-field-icon"></i>${t('Barkodi')}</span><strong>${product.barcode ? escapeHtml(product.barcode) : t('Nuk është vendosur')}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="package" class="product-field-icon"></i>${t('Sasia')}</span><strong>${quantity} ${t('copë')}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="tag" class="product-field-icon"></i>${t('Statusi')}</span><strong><span class="status-pill status-${status.tone}">${t(status.label)}</span></strong></div>
            <div><span class="product-meta-label"><i data-lucide="calendar-days" class="product-field-icon"></i>${t('Skadon')}</span><strong>${escapeHtml(formatDate(product.expirationDate))}</strong></div>
            <div class="remaining remaining-${remainingTone(product.expirationDate)}"><span class="product-meta-label"><i data-lucide="hourglass" class="product-field-icon"></i>${remainingDays >= 0 ? t('Kanë mbetur') : t('Skaduar prej')}</span><strong>${Math.abs(remainingDays)} ${remainingDays >= 0 ? t('ditë') : t('ditësh')}</strong></div>
            <div class="checked-meta"><span class="product-meta-label"><i data-lucide="circle-check" class="product-field-icon"></i>${t('Kontrolluar më')}</span><strong>${escapeHtml(formatCheckedAt(product.lastCheckedAt))}</strong></div>
            ${product.checkNote ? `<div class="control-note-meta"><span class="product-meta-label"><i data-lucide="clipboard-check" class="product-field-icon"></i>${t('Shënimi i kontrollit')}</span><strong>${escapeHtml(product.checkNote)}</strong></div>` : ''}
            <div class="notes-meta"><span class="product-meta-label"><i data-lucide="notebook-text" class="product-field-icon"></i>${t('Shënime')}</span><strong>${product.notes ? escapeHtml(product.notes) : '—'}</strong></div>
          </div>
          <div class="product-card-actions">
            <span class="card-actions-label">${t('Veprimet')}</span>
            <div>
              <button class="checked-button ${hasBeenChecked ? 'checked-button-refresh' : ''}" data-action="check-product" data-id="${product.id}" aria-label="${hasBeenChecked ? t('Përditëso kontrollin për') : t('Shëno si të kontrolluar')} ${escapeHtml(product.name)}"><i data-lucide="circle-check"></i>${checkButtonLabel}</button>
              ${canReturn ? `<button class="return-button" data-action="return-product" data-id="${product.id}"><i data-lucide="rotate-ccw"></i>${t('Kthe produktin')}</button>` : ''}
            </div>
          </div>
        </div>
      </article>
    `
  }

  function dashboardPage() {
    const active = activeProducts()
    const activeDeliveryRecords = activeDeliveries()
    const expiringThirty = active.filter((product) => {
      const days = daysUntil(product.expirationDate)
      return days >= 0 && days <= 30
    }).length
    const expired = active.filter((product) => daysUntil(product.expirationDate) < 0).length
    const urgentProducts = active.filter((product) => daysUntil(product.expirationDate) <= 30).slice(0, 4)
    const shelfPieces = state.deliveries.reduce((total, delivery) => total + Number(deliveryDistribution(delivery).shelf), 0)
    const warehousePieces = state.deliveries.reduce((total, delivery) => total + Number(deliveryDistribution(delivery).warehouse), 0)
    const verificationDifference = activeDeliveryRecords.reduce((total, delivery) => total + deliveryDifference(delivery), 0)
    const toReturn = state.deliveries.filter((delivery) => deliveryStatus(delivery) === 'to-return').length
    const returned = state.deliveries.filter((delivery) => deliveryStatus(delivery) === 'returned').length

    return `
      <section class="welcome-card">
        <div>
          <span class="eyebrow">${t('GJENDJA E SKADENCAVE')}</span>
          <h2>${t('Përmbledhja e sotme')}</h2>
          <p>${expired ? t('Kontrollo produktet e skaduara dhe mbaji raftet të përditësuara.') : t('Nuk ka produkte të skaduara.')}</p>
        </div>
        <button class="button button-light" data-page="expiring">${t('Shiko produktet')}</button>
      </section>

      <section class="stats-grid" aria-label="${t('Përmbledhja e inventarit')}">
        <button class="stat-card" data-page="markets">
          <span class="stat-icon stat-blue" aria-hidden="true">M</span>
          <strong>${state.markets.length}</strong>
          <span>${t('Marketet')}</span>
        </button>
        <button class="stat-card" data-page="products">
          <span class="stat-icon stat-purple" aria-hidden="true">P</span>
          <strong>${active.length}</strong>
          <span>${t('Produktet')}</span>
        </button>
        <button class="stat-card" data-page="expiring">
          <span class="stat-icon stat-orange" aria-hidden="true">30</span>
          <strong>${expiringThirty}</strong>
          <span>${t('Brenda 30 ditëve')}</span>
        </button>
        <button class="stat-card" data-page="expiring">
          <span class="stat-icon stat-red" aria-hidden="true">!</span>
          <strong>${expired}</strong>
          <span>${t('Produkte të skaduara')}</span>
        </button>
      </section>

      <section class="section-block delivery-summary">
        <div class="section-heading">
          <div><span class="eyebrow">${t('DËRGESAT')}</span><h2>${t('Gjendja e dërgesave')}</h2></div>
          <button class="text-button" data-page="deliveries">${t('Hap dërgesat')}</button>
        </div>
        <div class="stats-grid delivery-stats-grid">
          ${[
            ['DA', activeDeliveryRecords.length, t('Dërgesat aktive'), 'stat-blue'],
            ['TD', state.deliveries.length, t('Totali i dërgesave'), 'stat-purple'],
            ['R', `${shelfPieces}`, t('Në raft (copë)'), 'stat-blue'],
            ['M', `${warehousePieces}`, t('Në magazinë (copë)'), 'stat-purple'],
            ['K', toReturn, t('Për t\'u kthyer'), 'stat-orange'],
            ['KT', returned, t('Produkte të kthyera'), 'stat-red'],
            ['D', `${verificationDifference}`, t('Diferenca për verifikim'), verificationDifference ? 'stat-orange' : 'stat-blue'],
          ].map(([icon, value, label, tone]) => `<button class="stat-card" data-page="deliveries"><span class="stat-icon ${tone}" aria-hidden="true">${icon}</span><strong>${value}</strong><span>${label}</span></button>`).join('')}
        </div>
      </section>

      <section class="section-block">
        <div class="section-heading">
          <div>
            <span class="eyebrow">${t('KËRKOJNË VËMENDJE')}</span>
            <h2>${t('Skadencat e afërta')}</h2>
          </div>
          <button class="text-button" data-page="expiring">${t('Shiko të gjitha')}</button>
        </div>
        <div class="list-card">
          ${urgentProducts.length ? urgentProducts.map((product) => productRow(product)).join('') : emptyState(t('Nuk ka produkte urgjente.'), t('Produktet që afrojnë skadencën do të shfaqen këtu.'))}
        </div>
      </section>
    `
  }

  function marketsPage() {
    const productCount = (marketId) => activeProducts().filter((product) => product.marketId === marketId).length

    return `
      <div class="page-actions">
        <p>${state.markets.length} ${state.markets.length === 1 ? t('market i ruajtur') : t('markete të ruajtura')} ${t('në këtë pajisje')}</p>
        <button class="button button-primary" data-action="add-market"><span aria-hidden="true">+</span> ${t('Shto market')}</button>
      </div>
      <section class="list-card market-list">
        ${state.markets.length ? state.markets.map((market) => `
          <article class="market-row">
            <div class="market-avatar" aria-hidden="true">${escapeHtml(market.name.charAt(0).toUpperCase())}</div>
            <div class="market-info">
              <h3>${escapeHtml(market.name)}</h3>
              <p><span class="market-address">${t('Adresa:')} ${market.location ? escapeHtml(market.location) : t('Nuk është shtuar')}</span> · ${productCount(market.id)} ${productCount(market.id) === 1 ? t('produkt') : t('produkte')}</p>
            </div>
            <button class="more-button" data-action="edit-market" data-id="${market.id}" aria-label="${t('Modifiko')} ${escapeHtml(market.name)}">•••</button>
          </article>
        `).join('') : emptyState(t('Shto marketin e parë'), t('Krijo një market para se të shtosh produkte në inventar.'))}
      </section>
    `
  }

  function productsPage() {
    const products = filteredProducts()
    const years = [...new Set(state.products.map((product) => product.expirationDate.slice(0, 4)))].sort((first, second) => second.localeCompare(first))
    return `
      <div class="page-actions product-actions">
        <div class="search-field">
          <i data-lucide="search" aria-hidden="true"></i>
          <input type="search" data-search placeholder="${t('Kërko emrin, barkodin ose marketin')}" value="${escapeHtml(state.query)}" aria-label="${t('Kërko produktet sipas emrit, barkodit ose marketit')}">
          ${state.query ? ("<button data-action=\"clear-search\" aria-label=\"" + t('Pastro kërkimin') + "\">×</button>") : ''}
        </div>
        <button class="button button-primary" data-action="add-product"><i data-lucide="plus" aria-hidden="true"></i> ${t('Shto produkt')}</button>
      </div>
      <div class="filter-bar" aria-label="${t('Filtrat e produkteve')}">
        <label><span>${t('Marketi')}</span><select data-filter="marketId"><option value="all">${t('Të gjitha')}</option>${state.markets.map((market) => `<option value="${market.id}" ${state.filters.marketId === market.id ? 'selected' : ''}>${escapeHtml(market.name)}</option>`).join('')}</select></label>
        <label><span>${t('Statusi')}</span><select data-filter="status"><option value="all">${t('Të gjitha')}</option>${PRODUCT_STATUSES.map((status) => `<option value="${status.id}" ${state.filters.status === status.id ? 'selected' : ''}>${t(status.label)}</option>`).join('')}</select></label>
        <label><span>${t('Viti')}</span><select data-filter="year"><option value="all">${t('Të gjitha')}</option>${years.map((year) => `<option value="${year}" ${state.filters.year === year ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
      </div>
      <div class="result-count">${products.length} ${products.length === 1 ? t('produkt') : t('produkte')}${state.query ? (products.length === 1 ? t(' u gjet') : t(' u gjetën')) : ''}</div>
      <section class="list-card product-list">
        ${products.length ? products.map((product) => productRow(product, { actions: true })).join('') : emptyState(
          state.query ? t('Nuk u gjet asnjë produkt') : t('Nuk ka ende produkte'),
          state.query ? t('Provo një emër, barkod ose market tjetër.') : state.markets.length ? t('Shto produktin e parë për të filluar ndjekjen e datave të skadencës.') : t('Shto fillimisht një market, pastaj shto produktet.'),
        )}
      </section>
    `
  }

  function deliveryRow(delivery) {
    const latest = delivery.latestControl
    const status = deliveryStatusDetails(delivery)
    const remainingDays = daysUntil(delivery.expirationDate)
    return `
      <article class="product-row delivery-row">
        <div class="product-avatar tone-${expirationGroup(delivery.expirationDate)}" aria-hidden="true">${escapeHtml(delivery.productName.charAt(0).toUpperCase())}</div>
        <div class="product-info">
          <div class="product-name-line">
            <div><h3>${escapeHtml(delivery.productName)}</h3>${delivery.lotNumber ? `<p class="delivery-lot">${t('Loti')} ${escapeHtml(delivery.lotNumber)}</p>` : ''}</div>
            <span class="status-pill status-${status.tone}">${t(status.label)}</span>
          </div>
          <div class="product-meta-grid">
            <div><span class="product-meta-label"><i data-lucide="store" class="product-field-icon"></i>${t('Marketi')}</span><strong>${escapeHtml(delivery.marketName)}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="barcode" class="product-field-icon"></i>${t('Barkodi')}</span><strong>${delivery.barcode ? escapeHtml(delivery.barcode) : t('Nuk është vendosur')}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="truck" class="product-field-icon"></i>${t('Data e dërgesës')}</span><strong>${escapeHtml(formatDate(delivery.deliveryDate))}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="boxes" class="product-field-icon"></i>${t('Sasia e dërguar')}</span><strong>${escapeHtml(deliveryQuantityLabel(delivery))}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="calendar-days" class="product-field-icon"></i>${t('Skadon')}</span><strong>${escapeHtml(formatDate(delivery.expirationDate))}</strong></div>
            <div class="remaining remaining-${remainingTone(delivery.expirationDate)}"><span class="product-meta-label"><i data-lucide="hourglass" class="product-field-icon"></i>${remainingDays >= 0 ? t('Kanë mbetur') : t('Skaduar prej')}</span><strong>${Math.abs(remainingDays)} ${remainingDays >= 0 ? t('ditë') : t('ditësh')}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="scale" class="product-field-icon"></i>${t('Diferenca për verifikim')}</span><strong class="${deliveryDifference(delivery) ? 'difference-warning' : 'difference-clear'}">${deliveryDifference(delivery)} ${t('copë')}</strong></div>
            ${latest ? `
              <div><span class="product-meta-label"><i data-lucide="clipboard-check" class="product-field-icon"></i>${t('Kontrolli i fundit')}</span><strong>${escapeHtml(formatDate(latest.controlDate))}</strong></div>
              <div class="delivery-distribution"><span class="product-meta-label"><i data-lucide="warehouse" class="product-field-icon"></i>${t('Shpërndarja e fundit')}</span><strong>${t('Në raft')} ${latest.shelf} ${t('· Në magazinë')} ${latest.warehouse} ${t('· Për t\'u kthyer')} ${Number(latest.toReturn || 0)} ${t('· Të kthyer')} ${latest.returned}${latest.damaged ? ` ${t('· Të dëmtuar')} ${latest.damaged}` : ''}</strong></div>
              ${latest.notes ? `<div class="control-note-meta"><span class="product-meta-label"><i data-lucide="notebook-text" class="product-field-icon"></i>${t('Shënimi i kontrollit')}</span><strong>${escapeHtml(latest.notes)}</strong></div>` : ''}
            ` : `<div><span class="product-meta-label"><i data-lucide="clipboard-check" class="product-field-icon"></i>${t('Kontrolli i fundit')}</span><strong>${t('Nuk është kontrolluar ende')}</strong></div>`}
            <div class="notes-meta"><span class="product-meta-label"><i data-lucide="notebook-text" class="product-field-icon"></i>${t('Shënime')}</span><strong>${delivery.notes ? escapeHtml(delivery.notes) : '—'}</strong></div>
          </div>
          <div class="product-card-actions">
            <span class="card-actions-label">${t('Veprimet')}</span>
            <div>
              <button class="checked-button" data-action="check-delivery" data-id="${delivery.id}"><i data-lucide="clipboard-check"></i>${t('Regjistro kontrollin')}</button>
              <button class="checked-button checked-button-refresh" data-action="status-delivery" data-id="${delivery.id}"><i data-lucide="tag"></i>${t('Ndrysho statusin')}</button>
              ${delivery.controls.length ? `<button class="history-button" data-action="delivery-history" data-id="${delivery.id}"><i data-lucide="history"></i>${t('Historiku (')}${delivery.controls.length})</button>` : ''}
            </div>
          </div>
        </div>
      </article>
    `
  }

  function deliveriesPage() {
    const deliveries = filteredDeliveries()
    const years = [...new Set(state.deliveries.map((delivery) => delivery.expirationDate.slice(0, 4)))].sort()
    const products = [...new Map([
      ...state.products.map((product) => [product.id, { id: product.id, name: product.name }]),
      ...state.deliveries.map((delivery) => [delivery.productId, { id: delivery.productId, name: delivery.productName }]),
    ]).values()].sort((first, second) => first.name.localeCompare(second.name, 'sq'))

    return `
      <div class="page-actions">
        <p>${state.deliveries.length} ${state.deliveries.length === 1 ? t('dërgesë e regjistruar') : t('dërgesa të regjistruara')}</p>
        <button class="button button-primary" data-action="add-delivery"><i data-lucide="plus" aria-hidden="true"></i>${t('Shto dërgesë')}</button>
      </div>
      <div class="filter-bar delivery-filter-bar" aria-label="${t('Filtrat e dërgesave')}">
        <label><span>${t('Marketi')}</span><select data-delivery-filter="marketId"><option value="all">${t('Të gjitha')}</option>${state.markets.map((market) => `<option value="${market.id}" ${state.deliveryFilters.marketId === market.id ? 'selected' : ''}>${escapeHtml(market.name)}</option>`).join('')}</select></label>
        <label><span>${t('Produkti')}</span><select data-delivery-filter="productId"><option value="all">${t('Të gjitha')}</option>${products.map((product) => `<option value="${product.id}" ${state.deliveryFilters.productId === product.id ? 'selected' : ''}>${escapeHtml(product.name)}</option>`).join('')}</select></label>
        <label><span>${t('Viti i skadencës')}</span><select data-delivery-filter="year"><option value="all">${t('Të gjitha')}</option>${years.map((year) => `<option value="${year}" ${state.deliveryFilters.year === year ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
      </div>
      <div class="result-count">${deliveries.length} ${deliveries.length === 1 ? t('dërgesë') : t('dërgesa')}</div>
      <section class="list-card delivery-list">
        ${deliveries.length ? deliveries.map(deliveryRow).join('') : emptyState(t('Nuk ka ende dërgesa'), state.products.length ? t('Shto dërgesën e parë si një lot të ri historik.') : t('Shto fillimisht një produkt dhe pastaj regjistro dërgesën.'))}
      </section>
    `
  }

  function controlRecords() {
    return state.deliveries
      .flatMap((delivery) => delivery.controls.map((control) => ({ delivery, control })))
      .sort((first, second) => second.control.controlDate.localeCompare(first.control.controlDate) || second.control.createdAt.localeCompare(first.control.createdAt))
  }

  function controlRow({ delivery, control }) {
    return `
      <article class="product-row control-row">
        <div class="product-avatar tone-${expirationGroup(delivery.expirationDate)}" aria-hidden="true">${escapeHtml(delivery.productName.charAt(0).toUpperCase())}</div>
        <div class="product-info">
          <div class="product-name-line"><h3>${escapeHtml(delivery.productName)}</h3></div>
          <div class="product-meta-grid">
            <div><span class="product-meta-label"><i data-lucide="store" class="product-field-icon"></i>${t('Marketi')}</span><strong>${escapeHtml(delivery.marketName)}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="calendar-days" class="product-field-icon"></i>${t('Data e kontrollit')}</span><strong>${escapeHtml(formatDate(control.controlDate))}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="barcode" class="product-field-icon"></i>${t('Barkodi')}</span><strong>${delivery.barcode ? escapeHtml(delivery.barcode) : t('Nuk është vendosur')}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="truck" class="product-field-icon"></i>${t('Dërgesa ose loti')}</span><strong>${delivery.lotNumber ? `${t('Loti')} ${escapeHtml(delivery.lotNumber)}` : escapeHtml(formatDate(delivery.deliveryDate))}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="calendar-days" class="product-field-icon"></i>${t('Data e skadencës')}</span><strong>${escapeHtml(formatDate(delivery.expirationDate))}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="package" class="product-field-icon"></i>${t('Sasia në raft')}</span><strong>${control.shelf} ${t('copë')}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="warehouse" class="product-field-icon"></i>${t('Sasia në magazinë')}</span><strong>${control.warehouse} ${t('copë')}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="rotate-ccw" class="product-field-icon"></i>${t('Sasia për t\'u kthyer')}</span><strong>${Number(control.toReturn || 0)} ${t('copë')}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="circle-check" class="product-field-icon"></i>${t('Sasia e kthyer')}</span><strong>${control.returned} ${t('copë')}</strong></div>
            <div class="notes-meta"><span class="product-meta-label"><i data-lucide="notebook-text" class="product-field-icon"></i>${t('Shënim')}</span><strong>${control.notes ? escapeHtml(control.notes) : '—'}</strong></div>
          </div>
        </div>
      </article>
    `
  }

  function controlsPage() {
    const controls = controlRecords()
    return `
      <div class="page-actions">
        <p>${controls.length} ${controls.length === 1 ? t('kontroll i regjistruar') : t('kontrolle të regjistruara')}</p>
        <button class="button button-primary" data-action="add-control"><i data-lucide="plus" aria-hidden="true"></i>${t('Shto kontroll')}</button>
      </div>
      <section class="list-card control-list">
        ${controls.length ? controls.map(controlRow).join('') : emptyState(t('Nuk ka ende kontrolle'), state.deliveries.length ? t('Regjistro kontrollin e parë fizik për një dërgesë.') : t('Shto fillimisht një dërgesë dhe pastaj regjistro kontrollin.'))}
      </section>
    `
  }

  function expiringPage() {
    const products = [...searchedProducts(activeProducts())].sort((first, second) => daysUntil(first.expirationDate) - daysUntil(second.expirationDate))
    return `
      <div class="search-field expiring-search">
        <i data-lucide="search" aria-hidden="true"></i>
        <input type="search" data-search placeholder="${t('Kërko emrin, barkodin ose marketin')}" value="${escapeHtml(state.query)}" aria-label="${t('Kërko produktet sipas emrit, barkodit ose marketit')}">
        ${state.query ? ("<button data-action=\"clear-search\" aria-label=\"" + t('Pastro kërkimin') + "\">×</button>") : ''}
      </div>
      <div class="group-stack">
        ${GROUPS.map((group) => {
          const groupProducts = products.filter((product) => expirationGroup(product.expirationDate) === group.id)
          const expanded = state.expandedGroups.has(group.id)
          return `
            <section class="expiry-group">
              <button class="group-heading" data-action="toggle-group" data-group="${group.id}" aria-expanded="${expanded}">
                <span class="group-title"><span class="status-dot tone-${group.id}"></span>${t(group.label)}</span>
                <span class="group-meta">${groupProducts.length}<span class="chevron ${expanded ? 'expanded' : ''}">⌄</span></span>
              </button>
              ${expanded ? `<div class="list-card compact-list">${groupProducts.length ? groupProducts.map((product) => productRow(product)).join('') : ("<p class=\"group-empty\">" + t('Nuk ka produkte në këtë grup') + "</p>")}</div>` : ''}
            </section>
          `
        }).join('')}
      </div>
    `
  }

  function pageContent() {
    if (state.page === 'markets') return marketsPage()
    if (state.page === 'products') return productsPage()
    if (state.page === 'deliveries') return deliveriesPage()
    if (state.page === 'controls') return controlsPage()
    if (state.page === 'expiring') return expiringPage()
    return dashboardPage()
  }

  function render() {
    const [title, subtitle] = PAGE_TITLES[state.page]
    document.documentElement.lang = getLanguage()
    const description = document.querySelector('meta[name="description"]')
    if (description) description.content = t('Aplikacion privat për menaxhimin e dërgesave, loteve, stokut dhe datave të skadencës, edhe pa internet.')
    root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand-mark" aria-hidden="true">S+</div>
          <div class="title-wrap">
            <h1>${t(title)}</h1>
            <p>${t(subtitle)}</p>
          </div>
          <div class="local-badge"><span></span> ${t('Vetëm në këtë pajisje')}</div>
          <div class="language-switch" role="group" aria-label="${t('Zgjidh gjuhën')}">
            <button type="button" data-language="sq" lang="sq" aria-label="Shqip" aria-pressed="${getLanguage() === 'sq'}">SQ</button>
            <button type="button" data-language="en" lang="en" aria-label="English" aria-pressed="${getLanguage() === 'en'}">EN</button>
          </div>
        </header>
        <main class="main-content">${state.storageUnavailable
          ? emptyState(t('Ruajtja lokale nuk është e disponueshme'), t('Lejo ruajtjen e të dhënave lokale në shfletues dhe pastaj ringarko aplikacionin.'))
          : pageContent()}</main>
        <nav class="bottom-nav" aria-label="${t('Navigimi kryesor')}">
          ${[
            ['dashboard', 'layout-dashboard', t('Përmbledhje')],
            ['markets', 'store', t('Marketet')],
            ['products', 'package', t('Produktet')],
            ['deliveries', 'truck', t('Dërgesat')],
            ['controls', 'clipboard-check', t('Kontrollet')],
            ['expiring', 'clock-3', t('Skadencat')],
          ].map(([page, icon, label]) => `
            <button class="nav-item ${state.page === page ? 'active' : ''}" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ''}>
              <i data-lucide="${icon}" aria-hidden="true"></i>${label}
            </button>
          `).join('')}
        </nav>
      </div>
      <div id="overlay-root"></div>
      <div class="toast-region" role="status" aria-live="polite"></div>
    `
    renderIcons()
  }

  function showToast(message) {
    const region = root.querySelector('.toast-region')
    region.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`
    window.setTimeout(() => region.replaceChildren(), 2600)
  }

  function showDialog(content) {
    const overlay = root.querySelector('#overlay-root')
    // Keep unsaved form values intact until the dialog is saved or closed.
    root.querySelectorAll('[data-language]').forEach((button) => { button.disabled = true })
    overlay.innerHTML = `<div class="dialog-backdrop" data-action="close-dialog"><div class="sheet" role="dialog" aria-modal="true">${content}</div></div>`
    renderIcons(overlay)
    overlay.querySelector('input:not([type="hidden"]), select, textarea, button')?.focus()
  }

  function closeDialog() {
    root.querySelector('#overlay-root')?.replaceChildren()
    root.querySelectorAll('[data-language]').forEach((button) => { button.disabled = false })
  }

  function marketDialog(market = {}) {
    showDialog(`
      <form data-form="market" class="form-sheet">
        <input type="hidden" name="id" value="${market.id || ''}">
        <input type="hidden" name="createdAt" value="${market.createdAt || ''}">
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">${t('MARKET')}</span><h2>${market.id ? t('Modifiko marketin') : t('Shto një market të ri')}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="${t('Mbyll')}">×</button>
        </div>
        <label class="field"><span>${t('Emri i marketit')}</span><input name="name" required maxlength="80" autocomplete="organization" value="${escapeHtml(market.name || '')}" placeholder="${t('p.sh. Marketi Alba')}"></label>
        <label class="field"><span>${t('Adresa')}</span><input name="location" required maxlength="120" value="${escapeHtml(market.location || '')}" placeholder="${t('p.sh. Rruga e Durrësit, Tiranë')}"></label>
        <div class="form-actions">
          ${market.id ? ("<button type=\"button\" class=\"button button-danger-text\" data-action=\"delete-market\">" + t('Fshi') + "</button>") : '<span></span>'}
          <button type="submit" class="button button-primary">${market.id ? t('Ruaj ndryshimet') : t('Shto market')}</button>
        </div>
      </form>
    `)
  }

  function productDialog(product = {}) {
    if (!state.markets.length) {
      state.page = 'markets'
      render()
      showToast(t('Shto një market para se të shtosh produkte.'))
      return
    }

    showDialog(`
      <form data-form="product" class="form-sheet">
        <input type="hidden" name="id" value="${product.id || ''}">
        <input type="hidden" name="createdAt" value="${product.createdAt || ''}">
        <input type="hidden" name="lastCheckedAt" value="${product.lastCheckedAt || ''}">
        <input type="hidden" name="checkNote" value="${escapeHtml(product.checkNote || '')}">
        <input type="hidden" name="returnHistory" value="${escapeHtml(JSON.stringify(product.returnHistory || []))}">
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">${t('PRODUKT')}</span><h2>${product.id ? t('Modifiko produktin') : t('Shto një produkt të ri')}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="${t('Mbyll')}">×</button>
        </div>
        <div class="field-grid">
          <label class="field field-wide"><span>${t('Emri i produktit')}</span><input name="name" required maxlength="100" value="${escapeHtml(product.name || '')}" placeholder="${t('p.sh. Qumësht organik')}"></label>
          <label class="field"><span>${t('Barkodi')} <em>${t('Opsional')}</em></span><input name="barcode" inputmode="numeric" maxlength="64" value="${escapeHtml(product.barcode || '')}" placeholder="${t('Skano ose shkruaj numrin')}"></label>
          <label class="field"><span>${t('Marketi')}</span><select name="marketId" required><option value="">${t('Zgjidh marketin')}</option>${state.markets.map((market) => `<option value="${market.id}" ${product.marketId === market.id ? 'selected' : ''}>${escapeHtml(market.name)}</option>`).join('')}</select></label>
          <label class="field"><span>${t('Sasia')}</span><input name="quantity" type="number" inputmode="numeric" required min="0" step="1" value="${escapeHtml(product.quantity ?? 0)}" placeholder="${t('p.sh. 12')}"></label>
          <label class="field"><span>${t('Statusi')}</span><select name="status" required>${PRODUCT_STATUSES.map((status) => `<option value="${status.id}" ${productStatus(product) === status.id ? 'selected' : ''}>${t(status.label)}</option>`).join('')}</select></label>
          <label class="field"><span>${t('Data e skadencës')}</span><input name="expirationDate" type="date" required value="${product.expirationDate || ''}"></label>
          <label class="field field-wide"><span>${t('Shënime')} <em>${t('Opsionale')}</em></span><textarea name="notes" maxlength="500" rows="3" placeholder="${t('Shto hollësi për ruajtjen ose një kujtesë')}">${escapeHtml(product.notes || '')}</textarea></label>
        </div>
        <div class="form-actions">
          ${product.id ? ("<button type=\"button\" class=\"button button-danger-text\" data-action=\"delete-product\">" + t('Fshi') + "</button>") : '<span></span>'}
          <button type="submit" class="button button-primary">${product.id ? t('Ruaj ndryshimet') : t('Ruaj produktin')}</button>
        </div>
      </form>
    `)
  }

  function deliveryDialog() {
    if (!state.markets.length) {
      showToast(t('Shto fillimisht një market.'))
      return
    }

    showDialog(`
      <form data-form="delivery" class="form-sheet delivery-form" novalidate>
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">${t('DËRGESË E RE')}</span><h2>${t('Regjistro dërgesën')}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="${t('Mbyll')}">×</button>
        </div>
        <p class="form-intro">${t('Çdo ruajtje krijon një lot të ri historik dhe nuk ndryshon dërgesat e mëparshme.')}</p>
        <div class="field-grid">
          <label class="field"><span>${t('Marketi')}</span><select name="marketId" required><option value="">${t('Zgjidh marketin')}</option>${state.markets.map((market) => `<option value="${market.id}">${escapeHtml(market.name)}</option>`).join('')}</select></label>
          <label class="field"><span>${t('Produkti')}</span><input name="productName" required maxlength="100" data-delivery-product-name placeholder="${t('p.sh. Qumësht organik')}"></label>
          <label class="field"><span>${t('Barkodi')}</span><input name="barcode" required maxlength="64" inputmode="numeric" data-delivery-barcode placeholder="${t('Numri i barkodit')}"></label>
          <div class="barcode-match field-wide" data-barcode-match hidden></div>
          <label class="field"><span>${t('Numri i lotit')} <em>${t('Opsional')}</em></span><input name="lotNumber" maxlength="80" placeholder="${t('p.sh. LOT-2026-08')}"></label>
          <label class="field"><span>${t('Data e dërgesës')}</span><input name="deliveryDate" type="date" required></label>
          <label class="field"><span>${t('Data e skadencës')}</span><input name="expirationDate" type="date" required></label>
          <label class="field"><span>${t('Njësia')}</span><select name="unit" required data-delivery-unit><option value="piece">${t('Copë')}</option><option value="case">${t('Koli')}</option></select></label>
          <label class="field" data-piece-quantity><span>${t('Sasia')}</span><input name="quantity" type="number" min="1" step="1" inputmode="numeric" value="1"></label>
          <label class="field" data-case-count hidden><span>${t('Sa koli?')}</span><input name="caseCount" type="number" min="1" step="1" inputmode="numeric" placeholder="${t('p.sh. 5')}"></label>
          <label class="field" data-pieces-per-case hidden><span>${t('Sa copë ka 1 koli?')}</span><input name="piecesPerCase" type="number" min="1" step="1" inputmode="numeric" placeholder="${t('p.sh. 24')}"></label>
          <div class="calculation-preview field-wide" data-delivery-calculation hidden></div>
          <label class="field field-wide"><span>${t('Shënime')} <em>${t('Opsionale')}</em></span><textarea name="notes" maxlength="500" rows="3" placeholder="${t('Shto hollësi për këtë dërgesë')}"></textarea></label>
        </div>
        <small class="field-error form-error" data-delivery-error aria-live="polite"></small>
        <div class="form-actions check-form-actions">
          <button type="button" class="button button-secondary" data-action="close-dialog">${t('Anulo')}</button>
          <button type="submit" class="button button-primary">${t('Ruaj dërgesën')}</button>
        </div>
      </form>
    `)
  }

  function deliveryCheckDialog(delivery) {
    const allowsCases = delivery.unit === 'case'
    showDialog(`
      <form data-form="delivery-check" class="form-sheet delivery-check-form" novalidate>
        <input type="hidden" name="deliveryId" value="${delivery.id}">
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">${t('KONTROLL STOKU')}</span><h2>${t('Regjistro kontrollin')}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="${t('Mbyll')}">×</button>
        </div>
        <div class="return-availability">${t('Sasia e dërguar:')} <strong>${escapeHtml(deliveryQuantityLabel(delivery))}</strong></div>
        <label class="field"><span>${t('Data e kontrollit')}</span><input name="controlDate" type="date" required><small class="field-error" data-delivery-check-date-error aria-live="polite"></small></label>
        ${allowsCases ? `<label class="field"><span>${t('Njësia e kontrollit')}</span><select name="inputUnit" data-control-unit><option value="piece">${t('Copë')}</option><option value="case">${t('Koli (')}${delivery.piecesPerCase} ${t('copë)')}</option></select></label>` : '<input type="hidden" name="inputUnit" value="piece">'}
        <p class="form-intro">${t('Si është shpërndarë aktualisht stoku?')}</p>
        <div class="field-grid distribution-fields">
          <label class="field"><span>${t('Në raft')}</span><input name="shelf" type="number" min="0" step="1" inputmode="numeric" value="0"></label>
          <label class="field"><span>${t('Në magazinë')}</span><input name="warehouse" type="number" min="0" step="1" inputmode="numeric" value="0"></label>
          <label class="field"><span>${t('Të kthyer')}</span><input name="returned" type="number" min="0" step="1" inputmode="numeric" value="0"></label>
          <label class="field"><span>${t('Të dëmtuar')}</span><input name="damaged" type="number" min="0" step="1" inputmode="numeric" value="0"></label>
          <div class="calculation-preview field-wide" data-control-calculation></div>
          <label class="field field-wide"><span>${t('Shënime')} <em>${t('Opsionale')}</em></span><textarea name="notes" maxlength="500" rows="3" placeholder="${t('Shto një shënim për kontrollin')}"></textarea></label>
        </div>
        <small class="field-error form-error" data-delivery-check-error aria-live="polite"></small>
        <div class="form-actions check-form-actions">
          <button type="button" class="button button-secondary" data-action="close-dialog">${t('Anulo')}</button>
          <button type="submit" class="button button-primary">${t('Ruaj kontrollin')}</button>
        </div>
      </form>
    `)
    updateControlCalculation(root.querySelector('[data-form="delivery-check"]'), delivery)
  }

  function deliveryStatusDialog(delivery) {
    showDialog(`
      <form data-form="delivery-status" class="form-sheet">
        <input type="hidden" name="deliveryId" value="${delivery.id}">
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">${t('STATUSI')}</span><h2>${t('Ndrysho statusin')}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="${t('Mbyll')}">×</button>
        </div>
        <label class="field"><span>${t('Statusi')}</span><select name="status" required>${PRODUCT_STATUSES.map((status) => `<option value="${status.id}" ${deliveryStatus(delivery) === status.id ? 'selected' : ''}>${t(status.label)}</option>`).join('')}</select></label>
        <div class="form-actions check-form-actions"><button type="button" class="button button-secondary" data-action="close-dialog">${t('Anulo')}</button><button type="submit" class="button button-primary">${t('Ruaj statusin')}</button></div>
      </form>
    `)
  }

  function deliveryHistoryDialog(delivery) {
    showDialog(`
      <div class="form-sheet history-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-heading"><div><span class="eyebrow">${t('HISTORIKU')}</span><h2>${escapeHtml(delivery.productName)}</h2></div><button type="button" class="close-button" data-action="close-dialog" aria-label="${t('Mbyll')}">×</button></div>
        <div class="history-list">
          ${delivery.controls.map((control) => `<article><div><strong>${escapeHtml(formatDate(control.controlDate))}</strong><span>${t('Diferenca:')} ${control.difference} ${t('copë')}</span></div><p>${t('Në raft')} ${control.shelf} ${t('· Në magazinë')} ${control.warehouse} ${t('· Për t\'u kthyer')} ${Number(control.toReturn || 0)} ${t('· Të kthyer')} ${control.returned}${control.damaged ? ` ${t('· Të dëmtuar')} ${control.damaged}` : ''}</p>${control.notes ? `<small>${escapeHtml(control.notes)}</small>` : ''}</article>`).join('')}
        </div>
      </div>
    `)
  }

  function resetControlBatchDetails(form) {
    form.querySelector('[data-selected-delivery-details]').hidden = true
    form.querySelectorAll('[data-control-entry]').forEach((field) => { field.disabled = true })
    form.querySelector('[data-market-control-calculation]').textContent = t('Zgjidh dërgesën për të llogaritur sasitë.')
  }

  function updateControlProductOptions(form) {
    const deliveries = state.deliveries.filter((delivery) => delivery.marketId === form.elements.marketId.value)
    const products = [...new Map(deliveries.map((delivery) => [delivery.productId, delivery.productName])).entries()]
      .sort((first, second) => first[1].localeCompare(second[1], getLocale()))
    form.elements.productId.innerHTML = `<option value="">${t('Zgjidh produktin')}</option>${products.map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('')}`
    form.elements.productId.disabled = !products.length
    form.elements.deliveryId.innerHTML = ("<option value=\"\">" + t('Zgjidh dërgesën ose lotin') + "</option>")
    form.elements.deliveryId.disabled = true
    resetControlBatchDetails(form)
  }

  function updateControlBatchOptions(form) {
    const deliveries = state.deliveries.filter((delivery) => delivery.marketId === form.elements.marketId.value && delivery.productId === form.elements.productId.value)
    form.elements.deliveryId.innerHTML = `<option value="">${t('Zgjidh dërgesën ose lotin')}</option>${deliveries.map((delivery) => `<option value="${delivery.id}">${delivery.lotNumber ? `${t('Loti')} ${escapeHtml(delivery.lotNumber)} · ` : ''}${escapeHtml(formatDate(delivery.deliveryDate))} ${t('· skadon')} ${escapeHtml(formatDate(delivery.expirationDate))}</option>`).join('')}`
    form.elements.deliveryId.disabled = !deliveries.length
    resetControlBatchDetails(form)
  }

  function selectedControlDelivery(form) {
    return state.deliveries.find((delivery) => delivery.id === form.elements.deliveryId.value) || null
  }

  function updateSelectedDeliveryDetails(form) {
    const delivery = selectedControlDelivery(form)
    const details = form.querySelector('[data-selected-delivery-details]')
    if (!delivery) {
      resetControlBatchDetails(form)
      return
    }
    details.hidden = false
    details.innerHTML = `
      <div><span>${t('Barkodi')}</span><strong>${delivery.barcode ? escapeHtml(delivery.barcode) : t('Nuk është vendosur')}</strong></div>
      <div><span>${t('Data e dërgesës')}</span><strong>${escapeHtml(formatDate(delivery.deliveryDate))}</strong></div>
      <div><span>${t('Data e skadencës')}</span><strong>${escapeHtml(formatDate(delivery.expirationDate))}</strong></div>
      <div><span>${t('Sasia e dërguar')}</span><strong>${escapeHtml(deliveryQuantityLabel(delivery))}</strong></div>
    `
    form.querySelectorAll('[data-control-entry]').forEach((field) => { field.disabled = false })
    updateMarketControlCalculation(form, delivery)
  }

  function updateMarketControlCalculation(form, delivery = selectedControlDelivery(form)) {
    if (!form || !delivery) return null
    const calculation = calculateStockDistribution({
      deliveredPieces: delivery.deliveredPieces,
      inputUnit: 'piece',
      piecesPerCase: delivery.piecesPerCase,
      shelf: Number(form.elements.shelf.value) || 0,
      warehouse: Number(form.elements.warehouse.value) || 0,
      toReturn: Number(form.elements.toReturn.value) || 0,
      returned: Number(form.elements.returned.value) || 0,
      damaged: 0,
    })
    const preview = form.querySelector('[data-market-control-calculation]')
    preview.classList.toggle('calculation-negative', calculation.difference < 0)
    preview.innerHTML = `<strong>${t('Diferenca për verifikim:')} ${calculation.difference} ${t('copë')}</strong>`
    return calculation
  }

  function controlDialog() {
    if (!state.deliveries.length) {
      showToast(t('Shto fillimisht një dërgesë.'))
      return
    }
    const marketIds = new Set(state.deliveries.map((delivery) => delivery.marketId))
    const markets = state.markets.filter((market) => marketIds.has(market.id))
    showDialog(`
      <form data-form="market-control" class="form-sheet market-control-form" novalidate>
        <div class="sheet-handle"></div>
        <div class="sheet-heading"><div><span class="eyebrow">${t('KONTROLL FIZIK')}</span><h2>${t('Regjistro kontrollin')}</h2></div><button type="button" class="close-button" data-action="close-dialog" aria-label="${t('Mbyll')}">×</button></div>
        <p class="form-intro">${t('Zgjidh marketin, produktin dhe dërgesën që po kontrollon.')}</p>
        <div class="field-grid">
          <label class="field"><span>${t('Marketi')}</span><select name="marketId" required data-control-market><option value="">${t('Zgjidh marketin')}</option>${markets.map((market) => `<option value="${market.id}">${escapeHtml(market.name)}</option>`).join('')}</select></label>
          <label class="field"><span>${t('Produkti')}</span><select name="productId" required data-control-product disabled><option value="">${t('Zgjidh produktin')}</option></select></label>
          <label class="field field-wide"><span>${t('Dërgesa ose loti')}</span><select name="deliveryId" required data-control-batch disabled><option value="">${t('Zgjidh dërgesën ose lotin')}</option></select></label>
          <div class="selected-delivery-details field-wide" data-selected-delivery-details hidden></div>
          <label class="field"><span>${t('Data e kontrollit')}</span><input name="controlDate" type="date" required></label>
          <label class="field"><span>${t('Sasia në raft')}</span><input name="shelf" type="number" min="0" step="1" inputmode="numeric" value="0" data-control-entry disabled></label>
          <label class="field"><span>${t('Sasia në magazinë')}</span><input name="warehouse" type="number" min="0" step="1" inputmode="numeric" value="0" data-control-entry disabled></label>
          <label class="field"><span>${t('Sasia për t\'u kthyer')}</span><input name="toReturn" type="number" min="0" step="1" inputmode="numeric" value="0" data-control-entry disabled></label>
          <label class="field"><span>${t('Sasia e kthyer')}</span><input name="returned" type="number" min="0" step="1" inputmode="numeric" value="0" data-control-entry disabled></label>
          <div class="calculation-preview field-wide" data-market-control-calculation>${t('Zgjidh dërgesën për të llogaritur sasitë.')}</div>
          <label class="field field-wide"><span>${t('Shënim')} <em>${t('Opsional')}</em></span><textarea name="notes" maxlength="500" rows="3" data-control-entry disabled placeholder="${t('Shto një shënim për kontrollin')}"></textarea></label>
        </div>
        <small class="field-error form-error" data-market-control-error aria-live="polite"></small>
        <div class="form-actions check-form-actions"><button type="button" class="button button-secondary" data-action="close-dialog">${t('Anulo')}</button><button type="submit" class="button button-primary">${t('Ruaj kontrollin')}</button></div>
      </form>
    `)
  }

  function checkDialog(product) {
    showDialog(`
      <form data-form="check" class="form-sheet check-form" novalidate>
        <input type="hidden" name="productId" value="${product.id}">
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">${t('KONTROLLI')}</span><h2>${t('Regjistro kontrollin')}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="${t('Mbyll')}">×</button>
        </div>
        <label class="field control-date-field">
          <span>${t('Data e kontrollit')}</span>
          <input name="controlDate" type="date" required value="${dateInputValue(product.lastCheckedAt)}" aria-describedby="control-date-error">
          <small class="field-error" id="control-date-error" data-control-date-error aria-live="polite"></small>
        </label>
        <label class="field">
          <span>${t('Shënim për kontrollin')} <em>${t('Opsional')}</em></span>
          <textarea name="checkNote" maxlength="500" rows="3" placeholder="${t('Shto një shënim për këtë kontroll')}">${escapeHtml(product.checkNote || '')}</textarea>
        </label>
        <div class="form-actions check-form-actions">
          <button type="button" class="button button-secondary" data-action="close-dialog">${t('Anulo')}</button>
          <button type="submit" class="button button-primary">${t('Ruaj kontrollin')}</button>
        </div>
      </form>
    `)
  }

  function returnDialog(product) {
    const quantity = Number(product.quantity) || 0
    showDialog(`
      <form data-form="return" class="form-sheet return-form" novalidate>
        <input type="hidden" name="productId" value="${product.id}">
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">${t('KTHIMI')}</span><h2>${t('Regjistro kthimin')}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="${t('Mbyll')}">×</button>
        </div>
        <div class="return-availability">${t('Sasia në dispozicion:')} <strong>${quantity} ${t('copë')}</strong></div>
        <label class="field return-date-field">
          <span>${t('Data e kthimit')}</span>
          <input name="returnDate" type="date" required aria-describedby="return-date-error">
          <small class="field-error" id="return-date-error" data-return-date-error aria-live="polite"></small>
        </label>
        <label class="field return-quantity-field">
          <span>${t('Sasia e kthyer')}</span>
          <input name="returnQuantity" type="number" inputmode="numeric" required min="1" max="${quantity}" step="1" placeholder="${t('p.sh. 2')}" aria-describedby="return-quantity-error">
          <small class="field-error" id="return-quantity-error" data-return-quantity-error aria-live="polite"></small>
        </label>
        <label class="field">
          <span>${t('Shënim')} <em>${t('Opsional')}</em></span>
          <textarea name="returnNote" maxlength="500" rows="3" placeholder="${t('Shto një shënim për kthimin')}"></textarea>
        </label>
        <div class="form-actions check-form-actions">
          <button type="button" class="button button-secondary" data-action="close-dialog">${t('Anulo')}</button>
          <button type="submit" class="button button-primary">${t('Ruaj kthimin')}</button>
        </div>
      </form>
    `)
  }

  function confirmDelete({ title, message, confirmLabel, onConfirm }) {
    showDialog(`
      <div class="confirm-sheet">
        <div class="danger-mark" aria-hidden="true">!</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="button button-secondary" data-action="close-dialog">${t('Anulo')}</button>
          <button class="button button-danger" data-action="confirm-delete">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `)
    root.querySelector('[data-action="confirm-delete"]').addEventListener('click', onConfirm, { once: true })
  }

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('button, [data-action]')
    if (!target) return

    if (target.dataset.language) {
      if (root.querySelector('#overlay-root .sheet') || target.disabled) return
      const nextLanguage = target.dataset.language
      if (getLanguage() !== nextLanguage && setLanguage(nextLanguage)) {
        render()
        root.querySelector(`[data-language="${nextLanguage}"]`)?.focus()
      }
      return
    }

    if (target.dataset.page) {
      state.page = target.dataset.page
      state.query = ''
      render()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const action = target.dataset.action
    if (action === 'close-dialog' && (target === event.target || target.closest('.sheet'))) closeDialog()
    if (action === 'add-market') marketDialog()
    if (action === 'edit-market') marketDialog(state.markets.find((market) => market.id === target.dataset.id))
    if (action === 'add-product') productDialog()
    if (action === 'edit-product') productDialog(state.products.find((product) => product.id === target.dataset.id))
    if (action === 'add-delivery') deliveryDialog()
    if (action === 'add-control') controlDialog()
    if (action === 'use-existing-product') {
      const form = target.closest('[data-form="delivery"]')
      const product = state.products.find((item) => item.id === target.dataset.id)
      if (form && product) {
        form.elements.productName.value = product.name
        updateDeliveryProductMatch(form)
      }
    }
    if (action === 'check-delivery') {
      const delivery = state.deliveries.find((item) => item.id === target.dataset.id)
      if (delivery) deliveryCheckDialog(delivery)
    }
    if (action === 'status-delivery') {
      const delivery = state.deliveries.find((item) => item.id === target.dataset.id)
      if (delivery) deliveryStatusDialog(delivery)
    }
    if (action === 'delivery-history') {
      const delivery = state.deliveries.find((item) => item.id === target.dataset.id)
      if (delivery) deliveryHistoryDialog(delivery)
    }
    if (action === 'clear-search') {
      state.query = ''
      render()
    }
    if (action === 'toggle-group') {
      state.expandedGroups.has(target.dataset.group)
        ? state.expandedGroups.delete(target.dataset.group)
        : state.expandedGroups.add(target.dataset.group)
      render()
    }
    if (action === 'check-product') {
      const product = state.products.find((item) => item.id === target.dataset.id)
      if (!product) return
      checkDialog(product)
    }
    if (action === 'return-product') {
      const product = state.products.find((item) => item.id === target.dataset.id)
      if (!product || productStatus(product) === 'returned' || Number(product.quantity) <= 0) return
      returnDialog(product)
    }
    if (action === 'delete-market') {
      const form = target.closest('form')
      const market = state.markets.find((item) => item.id === form.elements.id.value)
      const linkedCount = state.products.filter((product) => product.marketId === market.id).length
      confirmDelete({
        title: `${t('Të fshihet')} ${market.name}?`,
        message: linkedCount ? `${t('Do të fshihen përgjithmonë edhe')} ${linkedCount} ${linkedCount === 1 ? t('produkt i lidhur') : t('produkte të lidhura')} ${t('nga kjo pajisje.')}` : t('Ky market do të fshihet përgjithmonë nga kjo pajisje.'),
        confirmLabel: t('Fshi marketin'),
        onConfirm: async () => {
          await marketRepository.remove(market.id)
          closeDialog()
          await refresh()
          showToast(t('Marketi u fshi.'))
        },
      })
    }
    if (action === 'delete-product') {
      const form = target.closest('form')
      const product = state.products.find((item) => item.id === form.elements.id.value)
      confirmDelete({
        title: `${t('Të fshihet')} ${product.name}?`,
        message: t('Ky produkt do të fshihet përgjithmonë nga kjo pajisje.'),
        confirmLabel: t('Fshi produktin'),
        onConfirm: async () => {
          await productRepository.remove(product.id)
          closeDialog()
          await refresh()
          showToast(t('Produkti u fshi.'))
        },
      })
    }
  })

  root.addEventListener('input', (event) => {
    const marketControlForm = event.target.closest('[data-form="market-control"]')
    if (marketControlForm && event.target.matches('[name="shelf"], [name="warehouse"], [name="toReturn"], [name="returned"]')) {
      marketControlForm.querySelector('[data-market-control-error]').replaceChildren()
      updateMarketControlCalculation(marketControlForm)
      return
    }
    const deliveryForm = event.target.closest('[data-form="delivery"]')
    if (deliveryForm && event.target.matches('[data-delivery-barcode], [data-delivery-product-name]')) {
      deliveryForm.querySelector('[data-delivery-error]').replaceChildren()
      updateDeliveryProductMatch(deliveryForm)
      return
    }
    if (deliveryForm && event.target.matches('[name="caseCount"], [name="piecesPerCase"], [name="quantity"]')) {
      deliveryForm.querySelector('[data-delivery-error]').replaceChildren()
      updateDeliveryCalculation(deliveryForm)
      return
    }
    const deliveryCheckForm = event.target.closest('[data-form="delivery-check"]')
    if (deliveryCheckForm && event.target.matches('[name="shelf"], [name="warehouse"], [name="returned"], [name="damaged"]')) {
      const delivery = state.deliveries.find((item) => item.id === deliveryCheckForm.elements.deliveryId.value)
      deliveryCheckForm.querySelector('[data-delivery-check-error]').replaceChildren()
      updateControlCalculation(deliveryCheckForm, delivery)
      return
    }
    if (event.target.matches('[name="controlDate"]')) {
      event.target.removeAttribute('aria-invalid')
      const form = event.target.closest('form')
      form?.querySelector('[data-control-date-error]')?.replaceChildren()
      form?.querySelector('[data-delivery-check-date-error]')?.replaceChildren()
      return
    }
    if (event.target.matches('[name="returnDate"]')) {
      event.target.removeAttribute('aria-invalid')
      event.target.closest('form')?.querySelector('[data-return-date-error]')?.replaceChildren()
      return
    }
    if (event.target.matches('[name="returnQuantity"]')) {
      event.target.removeAttribute('aria-invalid')
      event.target.closest('form')?.querySelector('[data-return-quantity-error]')?.replaceChildren()
      return
    }
    if (!event.target.matches('[data-search]')) return
    const cursor = event.target.selectionStart
    state.query = event.target.value
    render()
    const input = root.querySelector('[data-search]')
    input.focus()
    input.setSelectionRange(cursor, cursor)
  })

  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-control-market]')) {
      updateControlProductOptions(event.target.closest('form'))
      return
    }
    if (event.target.matches('[data-control-product]')) {
      updateControlBatchOptions(event.target.closest('form'))
      return
    }
    if (event.target.matches('[data-control-batch]')) {
      updateSelectedDeliveryDetails(event.target.closest('form'))
      return
    }
    if (event.target.matches('[data-filter]')) {
      state.filters[event.target.dataset.filter] = event.target.value
      render()
      return
    }
    if (event.target.matches('[data-delivery-filter]')) {
      state.deliveryFilters[event.target.dataset.deliveryFilter] = event.target.value
      render()
      return
    }
    if (event.target.matches('[data-delivery-unit]')) {
      updateDeliveryCalculation(event.target.closest('form'))
      return
    }
    if (event.target.matches('[data-control-unit]')) {
      const form = event.target.closest('form')
      const delivery = state.deliveries.find((item) => item.id === form.elements.deliveryId.value)
      updateControlCalculation(form, delivery)
    }
  })

  root.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.target
    const values = Object.fromEntries(new FormData(form))
    const submitButton = form.querySelector('[type="submit"]')

    if (form.dataset.form === 'market-control') {
      const delivery = state.deliveries.find((item) => item.id === values.deliveryId)
      const error = form.querySelector('[data-market-control-error]')
      const quantityFields = ['shelf', 'warehouse', 'toReturn', 'returned']
      const selectionIsValid = delivery
        && delivery.marketId === values.marketId
        && delivery.productId === values.productId

      if (!selectionIsValid || !isValidDateInput(values.controlDate)) {
        error.textContent = t('Zgjidh marketin, produktin, dërgesën dhe datën e kontrollit.')
        return
      }
      if (quantityFields.some((field) => !isNonNegativeInteger(values[field]))) {
        error.textContent = t('Vendos sasi të plota dhe jo negative.')
        return
      }
      const calculation = updateMarketControlCalculation(form, delivery)
      if (calculation.difference < 0) {
        error.textContent = t('Shuma e sasive nuk mund të kalojë sasinë e dërguar.')
        return
      }

      submitButton.disabled = true
      try {
        await deliveryRepository.addCheck({
          deliveryId: delivery.id,
          marketId: delivery.marketId,
          productId: delivery.productId,
          controlDate: values.controlDate,
          inputUnit: 'piece',
          ...calculation,
          notes: values.notes,
        })
        if (calculation.returned === Number(delivery.deliveredPieces) && calculation.shelf === 0 && calculation.warehouse === 0 && calculation.toReturn === 0) {
          await deliveryRepository.setStatus(delivery.id, 'returned')
        }
        closeDialog()
        await refresh()
        showToast(t('Kontrolli u ruajt në historik.'))
      } catch {
        submitButton.disabled = false
        showToast(t('Kontrolli nuk u ruajt dot. Provo përsëri.'))
      }
      return
    }

    if (form.dataset.form === 'delivery') {
      const market = state.markets.find((item) => item.id === values.marketId)
      const isCase = values.unit === 'case'
      const quantityIsValid = isCase
        ? isPositiveInteger(values.caseCount) && isPositiveInteger(values.piecesPerCase)
        : isPositiveInteger(values.quantity)
      const error = form.querySelector('[data-delivery-error]')

      const productName = values.productName.trim()
      const barcode = values.barcode.trim()
      const existingProduct = findProductByBarcode(barcode)

      if (!market || !productName || !barcode || !isValidDateInput(values.deliveryDate) || !isValidDateInput(values.expirationDate) || !quantityIsValid) {
        error.textContent = t('Plotëso të gjitha fushat e detyrueshme me vlera të vlefshme.')
        return
      }
      if (existingProduct && normalizeProductName(existingProduct.name) !== normalizeProductName(productName)) {
        updateDeliveryProductMatch(form)
        error.textContent = t('Barkodi është i lidhur me një emër tjetër produkti.')
        return
      }

      submitButton.disabled = true
      try {
        const deliveredPieces = calculateDeliveredPieces(values)
        const persistedProduct = await productRepository.findByBarcode(barcode)
        if (persistedProduct && normalizeProductName(persistedProduct.name) !== normalizeProductName(productName)) {
          state.products = await productRepository.list()
          submitButton.disabled = false
          updateDeliveryProductMatch(form)
          error.textContent = t('Barkodi është i lidhur me një emër tjetër produkti.')
          return
        }
        const product = persistedProduct || await productRepository.save({
          name: productName,
          barcode,
          marketId: market.id,
          quantity: deliveredPieces,
          expirationDate: values.expirationDate,
          notes: '',
          status: 'shelf',
          lastCheckedAt: null,
          checkNote: '',
          returnHistory: [],
        })
        await deliveryRepository.add({
          ...values,
          productId: product.id,
          marketName: market.name,
          productName: product.name,
          barcode: product.barcode,
          status: 'shelf',
        })
        closeDialog()
        await refresh()
        showToast(t('Dërgesa u ruajt si lot i ri.'))
      } catch {
        submitButton.disabled = false
        showToast(t('Dërgesa nuk u ruajt dot. Provo përsëri.'))
      }
      return
    }

    if (form.dataset.form === 'delivery-check') {
      const delivery = state.deliveries.find((item) => item.id === values.deliveryId)
      const dateError = form.querySelector('[data-delivery-check-date-error]')
      const error = form.querySelector('[data-delivery-check-error]')
      const quantityFields = ['shelf', 'warehouse', 'returned', 'damaged']
      if (!isValidDateInput(values.controlDate)) {
        dateError.textContent = t('Zgjidh datën e kontrollit.')
        form.elements.controlDate.focus()
        return
      }
      if (!delivery || quantityFields.some((field) => !isNonNegativeInteger(values[field]))) {
        error.textContent = t('Vendos sasi të plota dhe jo negative.')
        return
      }
      const calculation = updateControlCalculation(form, delivery)
      if (calculation.difference < 0) {
        error.textContent = t('Shuma e stokut nuk mund të kalojë sasinë e dërguar.')
        return
      }

      submitButton.disabled = true
      try {
        await deliveryRepository.addCheck({
          deliveryId: delivery.id,
          controlDate: values.controlDate,
          inputUnit: values.inputUnit,
          ...calculation,
          notes: values.notes,
        })
        if (calculation.returned === Number(delivery.deliveredPieces) && calculation.shelf === 0 && calculation.warehouse === 0 && calculation.damaged === 0) {
          await deliveryRepository.setStatus(delivery.id, 'returned')
        }
        closeDialog()
        await refresh()
        showToast(t('Kontrolli u shtua në historik.'))
      } catch {
        submitButton.disabled = false
        showToast(t('Kontrolli nuk u ruajt dot. Provo përsëri.'))
      }
      return
    }

    if (form.dataset.form === 'delivery-status') {
      if (!PRODUCT_STATUSES.some((status) => status.id === values.status)) return
      submitButton.disabled = true
      try {
        await deliveryRepository.setStatus(values.deliveryId, values.status)
        closeDialog()
        await refresh()
        showToast(t('Statusi u përditësua.'))
      } catch {
        submitButton.disabled = false
        showToast(t('Statusi nuk u ruajt dot. Provo përsëri.'))
      }
      return
    }

    if (form.dataset.form === 'check') {
      const dateInput = form.elements.controlDate
      if (!isValidDateInput(values.controlDate)) {
        dateInput.setAttribute('aria-invalid', 'true')
        form.querySelector('[data-control-date-error]').textContent = t('Zgjidh datën e kontrollit.')
        dateInput.focus()
        return
      }

      const product = state.products.find((item) => item.id === values.productId)
      if (!product) {
        showToast(t('Produkti nuk u gjet.'))
        return
      }

      submitButton.disabled = true
      try {
        await productRepository.save({
          ...product,
          quantity: product.quantity ?? 0,
          lastCheckedAt: values.controlDate,
          checkNote: values.checkNote,
        })
        closeDialog()
        await refresh()
        showToast(product.lastCheckedAt ? t('Kontrolli u përditësua.') : t('Kontrolli u ruajt.'))
      } catch {
        submitButton.disabled = false
        showToast(t('Kontrolli nuk u ruajt dot. Provo përsëri.'))
      }
      return
    }

    if (form.dataset.form === 'return') {
      const dateInput = form.elements.returnDate
      const quantityInput = form.elements.returnQuantity
      const returnedQuantity = Number(values.returnQuantity)
      const product = state.products.find((item) => item.id === values.productId)
      let firstInvalidInput = null

      if (!isValidDateInput(values.returnDate)) {
        dateInput.setAttribute('aria-invalid', 'true')
        form.querySelector('[data-return-date-error]').textContent = t('Zgjidh datën e kthimit.')
        firstInvalidInput = dateInput
      }

      if (!Number.isInteger(returnedQuantity) || returnedQuantity <= 0) {
        quantityInput.setAttribute('aria-invalid', 'true')
        form.querySelector('[data-return-quantity-error]').textContent = t('Vendos një sasi të vlefshme.')
        firstInvalidInput ||= quantityInput
      } else if (product && returnedQuantity > Number(product.quantity)) {
        quantityInput.setAttribute('aria-invalid', 'true')
        form.querySelector('[data-return-quantity-error]').textContent = t('Sasia e kthyer nuk mund të kalojë sasinë në dispozicion.')
        firstInvalidInput ||= quantityInput
      }

      if (firstInvalidInput) {
        firstInvalidInput.focus()
        return
      }

      if (!product) {
        showToast(t('Produkti nuk u gjet.'))
        return
      }

      const remainingQuantity = Number(product.quantity) - returnedQuantity
      const returnEntry = {
        id: crypto.randomUUID?.() || `return-${Date.now()}`,
        date: values.returnDate,
        quantity: returnedQuantity,
        note: values.returnNote.trim(),
        recordedAt: new Date().toISOString(),
      }

      submitButton.disabled = true
      try {
        await productRepository.save({
          ...product,
          quantity: remainingQuantity,
          status: remainingQuantity === 0 ? 'returned' : productStatus(product),
          returnHistory: [...(Array.isArray(product.returnHistory) ? product.returnHistory : []), returnEntry],
        })
        closeDialog()
        await refresh()
        showToast(remainingQuantity === 0 ? t('Produkti u kthye plotësisht.') : t('Kthimi u ruajt dhe sasia u përditësua.'))
      } catch {
        submitButton.disabled = false
        showToast(t('Kthimi nuk u ruajt dot. Provo përsëri.'))
      }
      return
    }

    submitButton.disabled = true

    try {
      if (form.dataset.form === 'market') {
        await marketRepository.save(values)
        closeDialog()
        await refresh()
        showToast(values.id ? t('Marketi u përditësua.') : t('Marketi u shtua.'))
      }
      if (form.dataset.form === 'product') {
        await productRepository.save(values)
        closeDialog()
        await refresh()
        showToast(values.id ? t('Produkti u përditësua.') : t('Produkti u ruajt.'))
      }
    } catch {
      submitButton.disabled = false
      showToast(t('Nuk u ruajt dot. Provo përsëri.'))
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDialog()
  })

  return {
    async start() {
      render()
      try {
        await refresh()
      } catch {
        state.storageUnavailable = true
        render()
      }
    },
  }
}
