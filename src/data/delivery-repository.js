import { runTransaction } from './db.js'
import { calculateDeliveredPieces } from '../utils/deliveries.js'

function createId(prefix) {
  return crypto.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cleanText(value) {
  return String(value || '').trim()
}

function groupByDelivery(records) {
  return records.reduce((groups, record) => {
    const group = groups.get(record.deliveryId) || []
    group.push(record)
    groups.set(record.deliveryId, group)
    return groups
  }, new Map())
}

export const deliveryRepository = {
  async list() {
    return runTransaction(
      ['deliveries', 'deliveryChecks', 'deliveryStatuses'],
      'readonly',
      async ({ deliveries, deliveryChecks, deliveryStatuses }, request) => {
        const [deliveryRecords, checkRecords, statusRecords] = await Promise.all([
          request(deliveries.getAll()),
          request(deliveryChecks.getAll()),
          request(deliveryStatuses.getAll()),
        ])

        const checksByDelivery = groupByDelivery(checkRecords)
        const statusesByDelivery = groupByDelivery(statusRecords)

        return deliveryRecords
          .map((delivery) => {
            const controls = (checksByDelivery.get(delivery.id) || [])
              .sort((first, second) => second.controlDate.localeCompare(first.controlDate) || second.createdAt.localeCompare(first.createdAt))
            const statusHistory = (statusesByDelivery.get(delivery.id) || [])
              .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
            return {
              ...delivery,
              controls,
              statusHistory,
              status: statusHistory[0]?.status || delivery.status || 'shelf',
              latestControl: controls[0] || null,
            }
          })
          .sort((first, second) => second.deliveryDate.localeCompare(first.deliveryDate) || second.createdAt.localeCompare(first.createdAt))
      },
    )
  },

  async add(input) {
    return runTransaction(['deliveries', 'deliveryStatuses'], 'readwrite', async ({ deliveries, deliveryStatuses }, request) => {
      const id = createId('delivery')
      const createdAt = new Date().toISOString()
      const unit = input.unit === 'case' ? 'case' : 'piece'
      const caseCount = unit === 'case' ? Number(input.caseCount) : null
      const piecesPerCase = unit === 'case' ? Number(input.piecesPerCase) : null
      const deliveredPieces = calculateDeliveredPieces({
        unit,
        quantity: input.quantity,
        caseCount,
        piecesPerCase,
      })
      const record = {
        id,
        marketId: input.marketId,
        marketName: cleanText(input.marketName),
        productId: input.productId,
        productName: cleanText(input.productName),
        barcode: cleanText(input.barcode),
        lotNumber: cleanText(input.lotNumber),
        deliveryDate: input.deliveryDate,
        expirationDate: input.expirationDate,
        unit,
        quantity: unit === 'piece' ? deliveredPieces : null,
        caseCount,
        piecesPerCase,
        deliveredPieces,
        notes: cleanText(input.notes),
        status: input.status || 'shelf',
        createdAt,
      }
      const statusRecord = {
        id: createId('delivery-status'),
        deliveryId: id,
        status: record.status,
        createdAt,
      }
      await Promise.all([request(deliveries.add(record)), request(deliveryStatuses.add(statusRecord))])
      return record
    })
  },

  async addCheck(input) {
    return runTransaction(['deliveryChecks'], 'readwrite', async ({ deliveryChecks }, request) => {
      const record = {
        id: createId('delivery-check'),
        deliveryId: input.deliveryId,
        marketId: input.marketId || null,
        productId: input.productId || null,
        controlDate: input.controlDate,
        inputUnit: input.inputUnit === 'case' ? 'case' : 'piece',
        shelf: Number(input.shelf),
        warehouse: Number(input.warehouse),
        toReturn: Number(input.toReturn || 0),
        returned: Number(input.returned),
        damaged: Number(input.damaged),
        difference: Number(input.difference),
        notes: cleanText(input.notes),
        createdAt: new Date().toISOString(),
      }
      await request(deliveryChecks.add(record))
      return record
    })
  },

  async setStatus(deliveryId, status) {
    return runTransaction(['deliveryStatuses'], 'readwrite', async ({ deliveryStatuses }, request) => {
      const record = {
        id: createId('delivery-status'),
        deliveryId,
        status,
        createdAt: new Date().toISOString(),
      }
      await request(deliveryStatuses.add(record))
      return record
    })
  },
}
