const DATABASE_NAME = 'sales-assistant'
const DATABASE_VERSION = 1

let databasePromise

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })
}

export function openDatabase() {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.addEventListener('upgradeneeded', () => {
      const database = request.result

      if (!database.objectStoreNames.contains('markets')) {
        const markets = database.createObjectStore('markets', { keyPath: 'id' })
        markets.createIndex('name', 'name')
      }

      if (!database.objectStoreNames.contains('products')) {
        const products = database.createObjectStore('products', { keyPath: 'id' })
        products.createIndex('marketId', 'marketId')
        products.createIndex('expirationDate', 'expirationDate')
      }
    })

    request.addEventListener('success', () => {
      const database = request.result
      database.addEventListener('versionchange', () => database.close())
      resolve(database)
    })

    request.addEventListener('error', () => reject(request.error))
    request.addEventListener('blocked', () => reject(new Error('Database upgrade was blocked.')))
  })

  return databasePromise
}

export async function runTransaction(storeNames, mode, operation) {
  const database = await openDatabase()
  const transaction = database.transaction(storeNames, mode)
  const stores = Object.fromEntries(
    storeNames.map((name) => [name, transaction.objectStore(name)]),
  )

  const transactionComplete = new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve)
    transaction.addEventListener('abort', () => reject(transaction.error))
    transaction.addEventListener('error', () => reject(transaction.error))
  })

  const result = await operation(stores, requestToPromise)
  await transactionComplete
  return result
}
