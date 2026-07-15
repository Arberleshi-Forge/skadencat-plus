import { mkdirSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const staticWorker = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    const acceptsHtml = request.headers.get('accept')?.includes('text/html')

    if (response.status === 404 && acceptsHtml) {
      const fallbackUrl = new URL('/index.html', request.url)
      return env.ASSETS.fetch(new Request(fallbackUrl, request))
    }

    return response
  },
}
`

export default defineConfig({
  plugins: [
    {
      name: 'sales-assistant-static-worker',
      closeBundle() {
        mkdirSync('dist/server', { recursive: true })
        writeFileSync('dist/server/index.js', staticWorker)
      },
    },
  ],
})
