import './style.css'
import { createApp } from './ui/app.js'
import { marketRepository } from './data/market-repository.js'
import { productRepository } from './data/product-repository.js'

const app = createApp({
  root: document.querySelector('#app'),
  marketRepository,
  productRepository,
})

app.start()

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // The app remains fully usable when service workers are unavailable.
    })
  })
}
