import { runTransaction } from './db.js'

function createId() {
  return crypto.randomUUID?.() ?? `market-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const marketRepository = {
  async list() {
    return runTransaction(['markets'], 'readonly', async ({ markets }, request) => {
      const records = await request(markets.getAll())
      return records.sort((first, second) => first.name.localeCompare(second.name))
    })
  },

  async save(input) {
    return runTransaction(['markets'], 'readwrite', async ({ markets }, request) => {
      const record = {
        id: input.id || createId(),
        name: input.name.trim(),
        location: input.location.trim(),
        createdAt: input.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await request(markets.put(record))
      return record
    })
  },

  async remove(id) {
    return runTransaction(
      ['markets', 'products'],
      'readwrite',
      async ({ markets, products }, request) => {
        const productIndex = products.index('marketId')
        const linkedProducts = await request(productIndex.getAll(id))
        linkedProducts.forEach((product) => products.delete(product.id))
        await request(markets.delete(id))
        return linkedProducts.length
      },
    )
  },
}
