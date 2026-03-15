import { createDb } from '@npmdex/shared'
import { scorePackages } from './scorer.js'

function parseArgs(args: string[]) {
  const options: { maxPackages?: number } = {}

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-packages' && args[i + 1]) {
      options.maxPackages = parseInt(args[i + 1], 10)
      i++
    }
  }

  return options
}

async function main() {
  const args = process.argv.slice(2)
  const options = parseArgs(args)

  console.log('npmdex score-service')
  console.log(
    `  DATABASE_URL: ${process.env.DATABASE_URL ? '(set)' : '(not set)'}`,
  )
  if (options.maxPackages) {
    console.log(`  Max packages: ${options.maxPackages}`)
  }

  const db = createDb()
  const scored = await scorePackages(db, options)

  console.log(`Done. ${scored} packages scored.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
