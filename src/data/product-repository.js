import { runTransaction } from './db.js'

function parseReturnHistory(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function createId() {
  return crypto.randomUUID?.() ?? `product-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const productRepository = {
  async findByBarcode(barcode) {
    const normalizedBarcode = String(barcode || '').trim()
    if (!normalizedBarcode) return null
    return runTransaction(['products'], 'readonly', async ({ products }, request) => {
      const records = await request(products.getAll())
      return records.find((product) => String(product.barcode || '').trim() === normalizedBarcode) || null
    })
  },

  async list() {
    return runTransaction(['products'], 'readonly', async ({ products }, request) => {
      const records = await request(products.getAll())
      return records.sort((first, second) => first.expirationDate.localeCompare(second.expirationDate))
    })
  },

  async save(input) {
    return runTransaction(['products'], 'readwrite', async ({ products }, request) => {
      const record = {
        id: input.id || createId(),
        name: input.name.trim(),
        barcode: input.barcode.trim(),
        marketId: input.marketId,
        quantity: Number(input.quantity),
        expirationDate: input.expirationDate,
        notes: input.notes.trim(),
        lastCheckedAt: input.lastCheckedAt || null,
        checkNote: (input.checkNote || '').trim(),
        status: input.status || 'shelf',
        returnHistory: parseReturnHistory(input.returnHistory),
        createdAt: input.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await request(products.put(record))
      return record
    })
  },

  async remove(id) {
    return runTransaction(['products'], 'readwrite', async ({ products }, request) => {
      await request(products.delete(id))
    })
  },
}
