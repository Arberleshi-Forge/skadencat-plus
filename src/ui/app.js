import {
  daysUntil,
  expirationGroup,
  formatDate,
  formatRelativeExpiration,
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
  { id: 'safe', label: 'Produkte në rregull', tone: 'success' },
]

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

  function filteredProducts() {
    const query = state.query.trim().toLocaleLowerCase()
    if (!query) return state.products
    return state.products.filter((product) =>
      product.name.toLocaleLowerCase().includes(query) || product.barcode.toLocaleLowerCase().includes(query),
    )
  }

  function productRow(product, { actions = false } = {}) {
    const group = expirationGroup(product.expirationDate)
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
          <p>${escapeHtml(marketName(product.marketId))}${product.barcode ? ` · ${escapeHtml(product.barcode)}` : ''}</p>
          <div class="expiry-line">
            <span class="status-dot tone-${group}"></span>
            <span>${escapeHtml(formatRelativeExpiration(product.expirationDate))}</span>
            <span>·</span>
            <span>${escapeHtml(formatDate(product.expirationDate))}</span>
          </div>
        </div>
      </article>
    `
  }

  function dashboardPage() {
    const expiringThirty = state.products.filter((product) => {
      const days = daysUntil(product.expirationDate)
      return days >= 0 && days <= 30
    }).length
    const expired = state.products.filter((product) => daysUntil(product.expirationDate) < 0).length
    const urgentProducts = state.products.filter((product) => daysUntil(product.expirationDate) <= 30).slice(0, 4)

    return `
      <section class="welcome-card">
        <div>
          <span class="eyebrow">GJENDJA E SKADENCAVE</span>
          <h2>${expired ? (expired === 1 ? '1 produkt kërkon vëmendje' : `${expired} produkte kërkojnë vëmendje`) : 'Gjithçka është në rregull'}</h2>
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
          <strong>${state.products.length}</strong>
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
    const productCount = (marketId) => state.products.filter((product) => product.marketId === marketId).length

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
              <p>${market.location ? escapeHtml(market.location) : 'Pa vendndodhje'} · ${productCount(market.id)} ${productCount(market.id) === 1 ? 'produkt' : 'produkte'}</p>
            </div>
            <button class="more-button" data-action="edit-market" data-id="${market.id}" aria-label="Modifiko ${escapeHtml(market.name)}">•••</button>
          </article>
        `).join('') : emptyState('Shto marketin e parë', 'Krijo një market para se të shtosh produkte në inventar.')}
      </section>
    `
  }

  function productsPage() {
    const products = filteredProducts()
    return `
      <div class="page-actions product-actions">
        <div class="search-field">
          <span aria-hidden="true">⌕</span>
          <input type="search" data-search placeholder="Kërko sipas emrit ose barkodit" value="${escapeHtml(state.query)}" aria-label="Kërko produktet sipas emrit ose barkodit">
          ${state.query ? '<button data-action="clear-search" aria-label="Pastro kërkimin">×</button>' : ''}
        </div>
        <button class="button button-primary" data-action="add-product"><span aria-hidden="true">+</span> Shto produkt</button>
      </div>
      <div class="result-count">${products.length} ${products.length === 1 ? 'produkt' : 'produkte'}${state.query ? (products.length === 1 ? ' u gjet' : ' u gjetën') : ''}</div>
      <section class="list-card product-list">
        ${products.length ? products.map((product) => productRow(product, { actions: true })).join('') : emptyState(
          state.query ? 'Nuk u gjet asnjë produkt' : 'Nuk ka ende produkte',
          state.query ? 'Provo një emër ose barkod tjetër.' : state.markets.length ? 'Shto produktin e parë për të filluar ndjekjen e datave të skadencës.' : 'Shto fillimisht një market, pastaj shto produktet.',
        )}
      </section>
    `
  }

  function expiringPage() {
    const products = filteredProducts()
    return `
      <div class="search-field expiring-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" data-search placeholder="Kërko sipas emrit ose barkodit" value="${escapeHtml(state.query)}" aria-label="Kërko produktet sipas emrit ose barkodit">
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
            ['dashboard', '⌂', 'Përmbledhje'],
            ['markets', '◎', 'Marketet'],
            ['products', '▣', 'Produktet'],
            ['expiring', '◷', 'Skadencat'],
          ].map(([page, icon, label]) => `
            <button class="nav-item ${state.page === page ? 'active' : ''}" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ''}>
              <span aria-hidden="true">${icon}</span>${label}
            </button>
          `).join('')}
        </nav>
      </div>
      <div id="overlay-root"></div>
      <div class="toast-region" role="status" aria-live="polite"></div>
    `
  }

  function showToast(message) {
    const region = root.querySelector('.toast-region')
    region.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`
    window.setTimeout(() => region.replaceChildren(), 2600)
  }

  function showDialog(content) {
    const overlay = root.querySelector('#overlay-root')
    overlay.innerHTML = `<div class="dialog-backdrop" data-action="close-dialog"><div class="sheet" role="dialog" aria-modal="true">${content}</div></div>`
    overlay.querySelector('input, select, textarea, button')?.focus()
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
        <label class="field"><span>Vendndodhja <em>Opsionale</em></span><input name="location" maxlength="120" value="${escapeHtml(market.location || '')}" placeholder="p.sh. Qendër"></label>
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
        <div class="sheet-handle"></div>
        <div class="sheet-heading">
          <div><span class="eyebrow">PRODUKT</span><h2>${product.id ? 'Modifiko produktin' : 'Shto një produkt të ri'}</h2></div>
          <button type="button" class="close-button" data-action="close-dialog" aria-label="Mbyll">×</button>
        </div>
        <div class="field-grid">
          <label class="field field-wide"><span>Emri i produktit</span><input name="name" required maxlength="100" value="${escapeHtml(product.name || '')}" placeholder="p.sh. Qumësht organik"></label>
          <label class="field"><span>Barkodi <em>Opsional</em></span><input name="barcode" inputmode="numeric" maxlength="64" value="${escapeHtml(product.barcode || '')}" placeholder="Skano ose shkruaj numrin"></label>
          <label class="field"><span>Marketi</span><select name="marketId" required><option value="">Zgjidh marketin</option>${state.markets.map((market) => `<option value="${market.id}" ${product.marketId === market.id ? 'selected' : ''}>${escapeHtml(market.name)}</option>`).join('')}</select></label>
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
    if (!event.target.matches('[data-search]')) return
    const cursor = event.target.selectionStart
    state.query = event.target.value
    render()
    const input = root.querySelector('[data-search]')
    input.focus()
    input.setSelectionRange(cursor, cursor)
  })

  root.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.target
    const values = Object.fromEntries(new FormData(form))
    const submitButton = form.querySelector('[type="submit"]')
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
