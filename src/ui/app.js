import {
  Barcode,
  CalendarDays,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  createIcons,
  Hourglass,
  LayoutDashboard,
  NotebookText,
  Package,
  Plus,
  RotateCcw,
  Search,
  Store,
  Tag,
} from 'lucide'
import {
  daysUntil,
  expirationGroup,
  formatCheckedAt,
  formatDate,
} from '../utils/dates.js'

const PAGE_TITLES = {
  dashboard: ['Përmbledhje', 'Gjendja e inventarit me një shikim'],
  markets: ['Marketet', 'Menaxho marketet ku shpërndahen produktet.'],
  products: ['Produktet', 'Menaxho produktet dhe datat e skadencës.'],
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
  { id: 'missing', label: 'Nuk gjendet më', tone: 'grey' },
]

const LUCIDE_ICONS = {
  Barcode,
  CalendarDays,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Hourglass,
  LayoutDashboard,
  NotebookText,
  Package,
  Plus,
  RotateCcw,
  Search,
  Store,
  Tag,
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

export function createApp({ root, marketRepository, productRepository }) {
  const state = {
    page: 'dashboard',
    markets: [],
    products: [],
    query: '',
    filters: {
      marketId: 'all',
      status: 'all',
      year: 'all',
    },
    expandedGroups: new Set(GROUPS.map(({ id }) => id)),
  }

  async function refresh() {
    ;[state.markets, state.products] = await Promise.all([
      marketRepository.list(),
      productRepository.list(),
    ])
    render()
  }

  function marketName(marketId) {
    return state.markets.find((market) => market.id === marketId)?.name || 'Market i panjohur'
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

  function productRow(product, { actions = false } = {}) {
    const group = expirationGroup(product.expirationDate)
    const quantity = Number.isFinite(Number(product.quantity)) ? Number(product.quantity) : 0
    const remainingDays = daysUntil(product.expirationDate)
    const hasBeenChecked = Boolean(product.lastCheckedAt)
    const status = statusDetails(product)
    const canReturn = status.id !== 'returned' && quantity > 0
    const checkButtonLabel = hasBeenChecked ? 'Përditëso kontrollin' : 'E kontrollova'
    return `
      <article class="product-row">
        <div class="product-avatar tone-${group}" aria-hidden="true">${escapeHtml(product.name.charAt(0).toUpperCase())}</div>
        <div class="product-info">
          <div class="product-name-line">
            <h3>${escapeHtml(product.name)}</h3>
            ${actions ? `
              <button class="more-button" data-action="edit-product" data-id="${product.id}" aria-label="Modifiko ${escapeHtml(product.name)}">•••</button>
            ` : ''}
          </div>
          <div class="product-meta-grid">
            <div><span class="product-meta-label"><i data-lucide="store" class="product-field-icon"></i>Marketi</span><strong>${escapeHtml(marketName(product.marketId))}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="barcode" class="product-field-icon"></i>Barkodi</span><strong>${product.barcode ? escapeHtml(product.barcode) : 'Nuk është vendosur'}</strong></div>
            <div><span class="product-meta-label"><i data-lucide="package" class="product-field-icon"></i>Sasia</span><strong>${quantity} copë</strong></div>
            <div><span class="product-meta-label"><i data-lucide="tag" class="product-field-icon"></i>Statusi</span><strong><span class="status-pill status-${status.tone}">${status.label}</span></strong></div>
            <div><span class="product-meta-label"><i data-lucide="calendar-days" class="product-field-icon"></i>Skadon</span><strong>${escapeHtml(formatDate(product.expirationDate))}</strong></div>
            <div class="remaining remaining-${remainingTone(product.expirationDate)}"><span class="product-meta-label"><i data-lucide="hourglass" class="product-field-icon"></i>${remainingDays >= 0 ? 'Kanë mbetur' : 'Skaduar prej'}</span><strong>${Math.abs(remainingDays)} ${remainingDays >= 0 ? 'ditë' : 'ditësh'}</strong></div>
            <div class="checked-meta"><span class="product-meta-label"><i data-lucide="circle-check" class="product-field-icon"></i>Kontrolluar më</span><strong>${escapeHtml(formatCheckedAt(product.lastCheckedAt))}</strong></div>
            ${product.checkNote ? `<div class="control-note-meta"><span class="product-meta-label"><i data-lucide="clipboard-check" class="product-field-icon"></i>Shënimi i kontrollit</span><strong>${escapeHtml(product.checkNote)}</strong></div>` : ''}
            <div class="notes-meta"><span class="product-meta-label"><i data-lucide="notebook-text" class="product-field-icon"></i>Shënime</span><strong>${product.notes ? escapeHtml(product.notes) : '—'}</strong></div>
          </div>
          <div class="product-card-actions">
            <span class="card-actions-label">Veprimet</span>
            <div>
              <button class="checked-button ${hasBeenChecked ? 'checked-button-refresh' : ''}" data-action="check-product" data-id="${product.id}" aria-label="${hasBeenChecked ? 'Përditëso kontrollin për' : 'Shëno si të kontrolluar'} ${escapeHtml(product.name)}"><i data-lucide="circle-check"></i>${checkButtonLabel}</button>
              ${canReturn ? `<button class="return-button" data-action="return-product" data-id="${product.id}"><i data-lucide="rotate-ccw"></i>Kthe produktin</button>` : ''}
            </div>
          </div>
        </div>
      </article>
    `
  }

  function dashboardPage() {
    const active = activeProducts()
    const expiringThirty = active.filter((product) => {
      const days = daysUntil(product.expirationDate)
      return days >= 0 && days <= 30
    }).length
    const expired = active.filter((product) => daysUntil(product.expirationDate) < 0).length
    const urgentProducts = active.filter((product) => daysUntil(product.expirationDate) <= 30).slice(0, 4)

    return `
      <section class="welcome-card">
        <div>
          <span class="eyebrow">GJENDJA E SKADENCAVE</span>
          <h2>Përmbledhja e sotme</h2>
          <p>${expired ? 'Kontrollo produktet e skaduara dhe mbaji raftet të përditësuara.' : 'Nuk ka produkte të skaduara.'}</p>
        </div>
        <button class="button button-light" data-page="expiring">Shiko produktet</button>
      </section>

      <section class="stats-grid" aria-label="Përmbledhja e inventarit">
        <button class="stat-card" data-page="markets">
          <span class="stat-icon stat-blue" aria-hidden="true">M</span>
          <strong>${state.markets.length}</strong>
          <span>Marketet</span>
        </button>
        <button class="stat-card" data-page="products">
          <span class="stat-icon stat-purple" aria-hidden="true">P</span>
          <strong>${active.length}</strong>
          <span>Produktet</span>
        </button>
        <button class="stat-card" data-page="expiring">
          <span class="stat-icon stat-orange" aria-hidden="true">30</span>
          <strong>${expiringThirty}</strong>
          <span>Brenda 30 ditëve</span>
        </button>
        <button class="stat-card" data-page="expiring">
          <span class="stat-icon stat-red" aria-hidden="true">!</span>
          <strong>${expired}</strong>
          <span>Produkte të skaduara</span>
        </button>
      </section>

      <section class="section-block">
        <div class="section-heading">
          <div>
            <span class="eyebrow">KËRKOJNË VËMENDJE</span>
            <h2>Skadencat e afërta</h2>
          </div>
          <button class="text-button" data-page="expiring">Shiko të gjitha</button>
        </div>
        <div class="list-card">
          ${urgentProducts.length ? urgentProducts.map((product) => productRow(product)).join('') : emptyState('Nuk ka produkte urgjente.', 'Produktet që afrojnë skadencën do të shfaqen këtu.')}
        </div>
      </section>
    `
  }

  function marketsPage() {
    const productCount = (marketId) => activeProducts().filter((product) => product.marketId === marketId).length

    return `
      <div class="page-actions">
        <p>${state.markets.length} ${state.markets.length === 1 ? 'market i ruajtur' : 'markete të ruajtura'} në këtë pajisje</p>
        <button class="button button-primary" data-action="add-market"><span aria-hidden="true">+</span> Shto market</button>
      </div>
      <section class="list-card market-list">
        ${state.markets.length ? state.markets.map((market) => `
          <article class="market-row">
            <div class="market-avatar" aria-hidden="true">${escapeHtml(market.name.charAt(0).toUpperCase())}</div>
            <div class="market-info">
              <h3>${escapeHtml(market.name)}</h3>
              <p><span class="market-address">Adresa: ${market.location ? escapeHtml(market.location) : 'Nuk është shtuar'}</span> · ${productCount(market.id)} ${productCount(market.id) === 1 ? 'produkt' : 'produkte'}</p>
            </div>
            <button class="more-button" data-action="edit-market" data-id="${market.id}" aria-label="Modifiko ${escapeHtml(market.name)}">•••</button>
          </article>
        `).join('') : emptyState('Shto marketin e parë', 'Krijo një market para se të shtosh produkte në inventar.')}
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
          <input type="search" data-search placeholder="Kërko emrin, barkodin ose marketin" value="${escapeHtml(state.query)}" aria-label="Kërko produktet sipas emrit, barkodit ose marketit">
          ${state.query ? '<button data-action="clear-search" aria-label="Pastro kërkimin">×</button>' : ''}
        </div>
        <button class="button button-primary" data-action="add-product"><i data-lucide="plus" aria-hidden="true"></i> Shto produkt</button>
      </div>
      <div class="filter-bar" aria-label="Filtrat e produkteve">
        <label><span>Marketi</span><select data-filter="marketId"><option value="all">Të gjitha</option>${state.markets.map((market) => `<option value="${market.id}" ${state.filters.marketId === market.id ? 'selected' : ''}>${escapeHtml(market.name)}</option>`).join('')}</select></label>
        <label><span>Statusi</span><select data-filter="status"><option value="all">Të gjitha</option>${PRODUCT_STATUSES.map((status) => `<option value="${status.id}" ${state.filters.status === status.id ? 'selected' : ''}>${status.label}</option>`).join('')}</select></label>
        <label><span>Viti</span><select data-filter="year"><option value="all">Të gjitha</option>${years.map((year) => `<option value="${year}" ${state.filters.year === year ? 'selected' : ''}>${year}</option>`).join('')}</select></label>
      </div>
      <div class="result-count">${products.length} ${products.length === 1 ? 'produkt' : 'produkte'}${state.query ? (products.length === 1 ? ' u gjet' : ' u gjetën') : ''}</div>
      <section class="list-card product-list">
        ${products.length ? products.map((product) => productRow(product, { actions: true })).join('') : emptyState(
          state.query ? 'Nuk u gjet asnjë produkt' : 'Nuk ka ende produkte',
          state.query ? 'Provo një emër, barkod ose market tjetër.' : state.markets.length ? 'Shto produktin e parë për të filluar ndjekjen e datave të skadencës.' : 'Shto fillimisht një market, pastaj shto produktet.',
        )}
      </section>
    `
  }

  function expiringPage() {
    const products = [...searchedProducts(activeProducts())].sort((first, second) => daysUntil(first.expirationDate) - daysUntil(second.expirationDate))
    return `
      <div class="search-field expiring-search">
        <i data-lucide="search" aria-hidden="true"></i>
        <input type="search" data-search placeholder="Kërko emrin, barkodin ose marketin" value="${escapeHtml(state.query)}" aria-label="Kërko produktet sipas emrit, barkodit ose marketit">
        ${state.query ? '<button data-action="clear-search" aria-label="Pastro kërkimin">×</button>' : ''}
      </div>
      <div class="group-stack">
        ${GROUPS.map((group) => {
          const groupProducts = products.filter((product) => expirationGroup(product.expirationDate) === group.id)
          const expanded = state.expandedGroups.has(group.id)
          return `
            <section class="expiry-group">
              <button class="group-heading" data-action="toggle-group" data-group="${group.id}" aria-expanded="${expanded}">
                <span class="group-title"><span class="status-dot tone-${group.id}"></span>${group.label}</span>
                <span class="group-meta">${groupProducts.length}<span class="chevron ${expanded ? 'expanded' : ''}">⌄</span></span>
              </button>
              ${expanded ? `<div class="list-card compact-list">${groupProducts.length ? groupProducts.map((product) => productRow(product)).join('') : '<p class="group-empty">Nuk ka produkte në këtë grup</p>'}</div>` : ''}
            </section>
          `
        }).join('')}
      </div>
    `
  }

  function pageContent() {
    if (state.page === 'markets') return marketsPage()
    if (state.page === 'products') return productsPage()
    if (state.page === 'expiring') return expiringPage()
    return dashboardPage()
  }

  function render() {
    const [title, subtitle] = PAGE_TITLES[state.page]
    root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand-mark" aria-hidden="true">S+</div>
          <div class="title-wrap">
            <h1>${title}</h1>
            <p>${subtitle}</p>
          </div>
          <div class="local-badge"><span></span> Vetëm në këtë pajisje</div>
        </header>
        <main class="main-content">${pageContent()}</main>
        <nav class="bottom-nav" aria-label="Navigimi kryesor">
          ${[
            ['dashboard', 'layout-dashboard', 'Përmbledhje'],
            ['markets', 'store', 'Marketet'],
            ['products', 'package', 'Produktet'],
            ['expiring', 'clock-3', 'Skadencat'],
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
    overlay.innerHTML = `<div class="dialog-backdrop" data-action="close-dialog"><div class="sheet" role="dialog" aria-modal="true">${content}</div></div>`
    renderIcons(overlay)
    overlay.querySelector('input:not([type="hidden"]), select, textarea, button')?.focus()
  }

  function closeDialog() {
    root.querySelector('#overlay-root')?.replaceChildren()
  }

  function marketDialog(market = {}) {
    showDialog(`
      <form data-form="market" class="form-sheet">
        <input type="hidden" name="id" value="${market.id || ''}">
        <input type="hidden" name="createdAt" value="${market.createdAt || ''}">
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">MARKET</span><h2>${market.id ? 'Modifiko marketin' : 'Shto një market të ri'}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="Mbyll">×</button>
        </div>
        <label class="field"><span>Emri i marketit</span><input name="name" required maxlength="80" autocomplete="organization" value="${escapeHtml(market.name || '')}" placeholder="p.sh. Marketi Alba"></label>
        <label class="field"><span>Adresa</span><input name="location" required maxlength="120" value="${escapeHtml(market.location || '')}" placeholder="p.sh. Rruga e Durrësit, Tiranë"></label>
        <div class="form-actions">
          ${market.id ? '<button type="button" class="button button-danger-text" data-action="delete-market">Fshi</button>' : '<span></span>'}
          <button type="submit" class="button button-primary">${market.id ? 'Ruaj ndryshimet' : 'Shto market'}</button>
        </div>
      </form>
    `)
  }

  function productDialog(product = {}) {
    if (!state.markets.length) {
      state.page = 'markets'
      render()
      showToast('Shto një market para se të shtosh produkte.')
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
          <div><span class="eyebrow">PRODUKT</span><h2>${product.id ? 'Modifiko produktin' : 'Shto një produkt të ri'}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="Mbyll">×</button>
        </div>
        <div class="field-grid">
          <label class="field field-wide"><span>Emri i produktit</span><input name="name" required maxlength="100" value="${escapeHtml(product.name || '')}" placeholder="p.sh. Qumësht organik"></label>
          <label class="field"><span>Barkodi <em>Opsional</em></span><input name="barcode" inputmode="numeric" maxlength="64" value="${escapeHtml(product.barcode || '')}" placeholder="Skano ose shkruaj numrin"></label>
          <label class="field"><span>Marketi</span><select name="marketId" required><option value="">Zgjidh marketin</option>${state.markets.map((market) => `<option value="${market.id}" ${product.marketId === market.id ? 'selected' : ''}>${escapeHtml(market.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Sasia</span><input name="quantity" type="number" inputmode="numeric" required min="0" step="1" value="${escapeHtml(product.quantity ?? 0)}" placeholder="p.sh. 12"></label>
          <label class="field"><span>Statusi</span><select name="status" required>${PRODUCT_STATUSES.map((status) => `<option value="${status.id}" ${productStatus(product) === status.id ? 'selected' : ''}>${status.label}</option>`).join('')}</select></label>
          <label class="field"><span>Data e skadencës</span><input name="expirationDate" type="date" required value="${product.expirationDate || ''}"></label>
          <label class="field field-wide"><span>Shënime <em>Opsionale</em></span><textarea name="notes" maxlength="500" rows="3" placeholder="Shto hollësi për ruajtjen ose një kujtesë">${escapeHtml(product.notes || '')}</textarea></label>
        </div>
        <div class="form-actions">
          ${product.id ? '<button type="button" class="button button-danger-text" data-action="delete-product">Fshi</button>' : '<span></span>'}
          <button type="submit" class="button button-primary">${product.id ? 'Ruaj ndryshimet' : 'Ruaj produktin'}</button>
        </div>
      </form>
    `)
  }

  function checkDialog(product) {
    showDialog(`
      <form data-form="check" class="form-sheet check-form" novalidate>
        <input type="hidden" name="productId" value="${product.id}">
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">KONTROLLI</span><h2>Regjistro kontrollin</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="Mbyll">×</button>
        </div>
        <label class="field control-date-field">
          <span>Data e kontrollit</span>
          <input name="controlDate" type="date" required value="${dateInputValue(product.lastCheckedAt)}" aria-describedby="control-date-error">
          <small class="field-error" id="control-date-error" data-control-date-error aria-live="polite"></small>
        </label>
        <label class="field">
          <span>Shënim për kontrollin <em>Opsional</em></span>
          <textarea name="checkNote" maxlength="500" rows="3" placeholder="Shto një shënim për këtë kontroll">${escapeHtml(product.checkNote || '')}</textarea>
        </label>
        <div class="form-actions check-form-actions">
          <button type="button" class="button button-secondary" data-action="close-dialog">Anulo</button>
          <button type="submit" class="button button-primary">Ruaj kontrollin</button>
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
          <div><span class="eyebrow">KTHIMI</span><h2>Regjistro kthimin</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="Mbyll">×</button>
        </div>
        <div class="return-availability">Sasia në dispozicion: <strong>${quantity} copë</strong></div>
        <label class="field return-date-field">
          <span>Data e kthimit</span>
          <input name="returnDate" type="date" required aria-describedby="return-date-error">
          <small class="field-error" id="return-date-error" data-return-date-error aria-live="polite"></small>
        </label>
        <label class="field return-quantity-field">
          <span>Sasia e kthyer</span>
          <input name="returnQuantity" type="number" inputmode="numeric" required min="1" max="${quantity}" step="1" placeholder="p.sh. 2" aria-describedby="return-quantity-error">
          <small class="field-error" id="return-quantity-error" data-return-quantity-error aria-live="polite"></small>
        </label>
        <label class="field">
          <span>Shënim <em>Opsional</em></span>
          <textarea name="returnNote" maxlength="500" rows="3" placeholder="Shto një shënim për kthimin"></textarea>
        </label>
        <div class="form-actions check-form-actions">
          <button type="button" class="button button-secondary" data-action="close-dialog">Anulo</button>
          <button type="submit" class="button button-primary">Ruaj kthimin</button>
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
          <button class="button button-secondary" data-action="close-dialog">Anulo</button>
          <button class="button button-danger" data-action="confirm-delete">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `)
    root.querySelector('[data-action="confirm-delete"]').addEventListener('click', onConfirm, { once: true })
  }

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('button, [data-action]')
    if (!target) return

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
        title: `Të fshihet ${market.name}?`,
        message: linkedCount ? `Do të fshihen përgjithmonë edhe ${linkedCount} ${linkedCount === 1 ? 'produkt i lidhur' : 'produkte të lidhura'} nga kjo pajisje.` : 'Ky market do të fshihet përgjithmonë nga kjo pajisje.',
        confirmLabel: 'Fshi marketin',
        onConfirm: async () => {
          await marketRepository.remove(market.id)
          closeDialog()
          await refresh()
          showToast('Marketi u fshi.')
        },
      })
    }
    if (action === 'delete-product') {
      const form = target.closest('form')
      const product = state.products.find((item) => item.id === form.elements.id.value)
      confirmDelete({
        title: `Të fshihet ${product.name}?`,
        message: 'Ky produkt do të fshihet përgjithmonë nga kjo pajisje.',
        confirmLabel: 'Fshi produktin',
        onConfirm: async () => {
          await productRepository.remove(product.id)
          closeDialog()
          await refresh()
          showToast('Produkti u fshi.')
        },
      })
    }
  })

  root.addEventListener('input', (event) => {
    if (event.target.matches('[name="controlDate"]')) {
      event.target.removeAttribute('aria-invalid')
      event.target.closest('form')?.querySelector('[data-control-date-error]')?.replaceChildren()
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
    if (!event.target.matches('[data-filter]')) return
    state.filters[event.target.dataset.filter] = event.target.value
    render()
  })

  root.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.target
    const values = Object.fromEntries(new FormData(form))
    const submitButton = form.querySelector('[type="submit"]')

    if (form.dataset.form === 'check') {
      const dateInput = form.elements.controlDate
      if (!isValidDateInput(values.controlDate)) {
        dateInput.setAttribute('aria-invalid', 'true')
        form.querySelector('[data-control-date-error]').textContent = 'Zgjidh datën e kontrollit.'
        dateInput.focus()
        return
      }

      const product = state.products.find((item) => item.id === values.productId)
      if (!product) {
        showToast('Produkti nuk u gjet.')
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
        showToast(product.lastCheckedAt ? 'Kontrolli u përditësua.' : 'Kontrolli u ruajt.')
      } catch {
        submitButton.disabled = false
        showToast('Kontrolli nuk u ruajt dot. Provo përsëri.')
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
        form.querySelector('[data-return-date-error]').textContent = 'Zgjidh datën e kthimit.'
        firstInvalidInput = dateInput
      }

      if (!Number.isInteger(returnedQuantity) || returnedQuantity <= 0) {
        quantityInput.setAttribute('aria-invalid', 'true')
        form.querySelector('[data-return-quantity-error]').textContent = 'Vendos një sasi të vlefshme.'
        firstInvalidInput ||= quantityInput
      } else if (product && returnedQuantity > Number(product.quantity)) {
        quantityInput.setAttribute('aria-invalid', 'true')
        form.querySelector('[data-return-quantity-error]').textContent = 'Sasia e kthyer nuk mund të kalojë sasinë në dispozicion.'
        firstInvalidInput ||= quantityInput
      }

      if (firstInvalidInput) {
        firstInvalidInput.focus()
        return
      }

      if (!product) {
        showToast('Produkti nuk u gjet.')
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
        showToast(remainingQuantity === 0 ? 'Produkti u kthye plotësisht.' : 'Kthimi u ruajt dhe sasia u përditësua.')
      } catch {
        submitButton.disabled = false
        showToast('Kthimi nuk u ruajt dot. Provo përsëri.')
      }
      return
    }

    submitButton.disabled = true

    try {
      if (form.dataset.form === 'market') {
        await marketRepository.save(values)
        closeDialog()
        await refresh()
        showToast(values.id ? 'Marketi u përditësua.' : 'Marketi u shtua.')
      }
      if (form.dataset.form === 'product') {
        await productRepository.save(values)
        closeDialog()
        await refresh()
        showToast(values.id ? 'Produkti u përditësua.' : 'Produkti u ruajt.')
      }
    } catch {
      submitButton.disabled = false
      showToast('Nuk u ruajt dot. Provo përsëri.')
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
        root.querySelector('.main-content').innerHTML = emptyState('Ruajtja lokale nuk është e disponueshme', 'Lejo ruajtjen e të dhënave lokale në shfletues dhe pastaj ringarko aplikacionin.')
      }
    },
  }
}
