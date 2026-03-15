import { parseArgs } from 'node:util'
import { createDb, createRedisClient } from '@npmdex/shared'
import { crawl } from './crawler.js'
import { enrichGitHub } from './enrich-github.js'
import { buildSearchIndex } from './redis-indexer.js'

async function main() {
  const { values: options } = parseArgs({
    options: {
      'full-sync': { type: 'boolean', default: false },
      'enrich-github': { type: 'boolean', default: false },
      'build-index': { type: 'boolean', default: false },
      incremental: { type: 'boolean', default: false },
      'max-packages': { type: 'string' },
    },
  })

  const fullSync = options['full-sync']!
  const enrichGithubFlag = options['enrich-github']!
  const buildIndex = options['build-index']!
  const incremental = options['incremental']!
  const maxPackages = options['max-packages']
    ? parseInt(options['max-packages'], 10)
    : undefined

  console.log('npmdex index-service')
  console.log(
    `  DATABASE_URL: ${process.env.DATABASE_URL ? '(set)' : '(not set)'}`,
  )

  const db = createDb()

  if (buildIndex) {
    const redisHost = process.env.REDIS_HOST ?? 'localhost'
    const redisPort = process.env.REDIS_PORT ?? '6379'
    console.log(`  Mode: build search index`)
    console.log(`  Redis: ${redisHost}:${redisPort}`)
    console.log(`  Incremental: ${incremental}`)

    const redis = createRedisClient()
    await redis.connect()

    try {
      await buildSearchIndex(db, redis, { incremental })
    } finally {
      await redis.quit()
    }
  } else if (enrichGithubFlag) {
    console.log(`  Mode: GitHub enrichment`)
    console.log(
      `  GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? '(set)' : '(not set)'}`,
    )
    if (maxPackages) {
      console.log(`  Max packages: ${maxPackages}`)
    }
    await enrichGitHub(db, { maxPackages })
  } else {
    console.log(`  Mode: ${fullSync ? 'full sync' : 'incremental'}`)
    if (maxPackages) {
      console.log(`  Max packages: ${maxPackages}`)
    }
    await crawl(db, { fullSync, maxPackages })
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
