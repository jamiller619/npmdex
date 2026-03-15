import { createRedisClient } from '@npmdex/shared'
import cors from 'cors'
import express from 'express'

import { searchPackages } from './search.js'

const app = express()
app.use(cors())

const redis = createRedisClient()

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q as string) ?? ''
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10))
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)),
    )
    const sort = (req.query.sort as string) ?? 'relevance'

    const validSorts = ['relevance', 'downloads', 'score', 'stars', 'updated']
    if (!validSorts.includes(sort)) {
      res.status(400).json({
        error: `Invalid sort. Must be one of: ${validSorts.join(', ')}`,
      })
      return
    }

    const results = await searchPackages(redis, { q, page, limit, sort })
    res.json(results)
  } catch (err) {
    console.error('Search error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const PORT = parseInt(process.env.PORT ?? '3001', 10)

async function start() {
  await redis.connect()
  console.log('Connected to Redis.')

  app.listen(PORT, () => {
    console.log(`API server listening on port ${PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start API server:', err)
  process.exit(1)
})
