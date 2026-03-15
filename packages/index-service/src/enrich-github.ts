import { eq, isNotNull } from 'drizzle-orm'
import { packages, packageMetadata, type Db } from '@npmdex/shared'
import {
  parseGitHubRepo,
  fetchGitHubRepoInfo,
  checkRateLimit,
} from './github.js'

const REQUEST_DELAY_MS = 100
const RATE_LIMIT_BUFFER = 100

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface EnrichGitHubOptions {
  maxPackages?: number
}

export async function enrichGitHub(
  db: Db,
  options: EnrichGitHubOptions = {},
): Promise<void> {
  const { maxPackages } = options

  // Check rate limit before starting
  try {
    const { remaining, resetAt } = await checkRateLimit()
    console.log(
      `GitHub API rate limit: ${remaining} remaining, resets at ${resetAt.toISOString()}`,
    )
    if (remaining < RATE_LIMIT_BUFFER) {
      console.error(
        `Rate limit too low (${remaining} remaining). Wait until ${resetAt.toISOString()}.`,
      )
      return
    }
  } catch (err) {
    console.warn(
      `Could not check rate limit: ${err instanceof Error ? err.message : err}. Proceeding anyway.`,
    )
  }

  // Fetch all packages with a repository URL
  const rows = await db
    .select({
      name: packages.name,
      repositoryUrl: packages.repositoryUrl,
    })
    .from(packages)
    .where(isNotNull(packages.repositoryUrl))

  console.log(`Found ${rows.length} packages with repository URLs`)

  let processed = 0
  let enriched = 0
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    if (maxPackages && processed >= maxPackages) {
      console.log(`Reached max packages limit: ${maxPackages}`)
      break
    }

    const parsed = parseGitHubRepo(row.repositoryUrl!)
    if (!parsed) {
      skipped++
      continue
    }

    try {
      const info = await fetchGitHubRepoInfo(parsed.owner, parsed.repo)

      if (!info) {
        // Repo not found or inaccessible — set null values
        await db
          .update(packageMetadata)
          .set({
            githubStars: null,
            githubOpenIssues: null,
            lastCommitDate: null,
          })
          .where(eq(packageMetadata.packageName, row.name))

        processed++
        skipped++
        continue
      }

      await db
        .update(packageMetadata)
        .set({
          githubStars: info.stargazers_count,
          githubOpenIssues: info.open_issues_count,
          lastCommitDate: new Date(info.pushed_at),
        })
        .where(eq(packageMetadata.packageName, row.name))

      enriched++
      processed++

      if (processed % 50 === 0) {
        console.log(
          `  Progress: ${processed} processed, ${enriched} enriched, ${skipped} skipped, ${errors} errors`,
        )
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('rate limit')) {
        console.error(`Rate limit hit after ${processed} packages. Stopping.`)
        break
      }
      errors++
      console.error(
        `  [error] ${row.name} (${parsed.owner}/${parsed.repo}): ${err instanceof Error ? err.message : err}`,
      )
    }

    await sleep(REQUEST_DELAY_MS)
  }

  console.log(
    `GitHub enrichment complete. Processed: ${processed}, enriched: ${enriched}, skipped: ${skipped}, errors: ${errors}`,
  )
}
