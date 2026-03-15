import { sql } from 'drizzle-orm'
import {
  packages,
  packageMetadata,
  type Db,
  type NewPackage,
  type NewPackageMetadata,
  type TypescriptSupport,
} from '@npmdex/shared'
import {
  fetchChanges,
  fetchPackageInfo,
  fetchWeeklyDownloads,
  type RegistryPackageInfo,
} from './registry.js'
import { readLastSeq, writeLastSeq } from './state.js'
import { detectTypescriptSupport } from './typescript-detection.js'

const BATCH_SIZE = 250
import { availableParallelism } from 'node:os'

function extractRepoUrl(info: RegistryPackageInfo): string | null {
  if (!info.repository) return null
  if (typeof info.repository === 'string') return info.repository
  const url = info.repository.url
  if (!url) return null
  return url
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/\.git$/, '')
}

function getLatestDependencyCount(info: RegistryPackageInfo): number | null {
  const latest = info['dist-tags']?.latest
  if (!latest || !info.versions?.[latest]) return null
  const deps = info.versions[latest].dependencies
  return deps ? Object.keys(deps).length : 0
}

function toPackageRow(info: RegistryPackageInfo): NewPackage {
  return {
    name: info.name,
    description: info.description?.slice(0, 1000) ?? null,
    latestVersion: info['dist-tags']?.latest ?? null,
    license: typeof info.license === 'string' ? info.license : null,
    homepageUrl: info.homepage ?? null,
    repositoryUrl: extractRepoUrl(info),
    keywords: info.keywords ?? null,
  }
}

function toMetadataRow(
  info: RegistryPackageInfo,
  downloads: number | null,
  tsSupport: TypescriptSupport,
): NewPackageMetadata {
  return {
    packageName: info.name,
    weeklyDownloads: downloads,
    readmeLength: info.readme?.length ?? null,
    dependencyCount: getLatestDependencyCount(info),
    hasTypescriptSupport: tsSupport,
  }
}

interface FetchedPackage {
  pkgRow: NewPackage
  metaRow: NewPackageMetadata
}

async function fetchPackage(name: string): Promise<FetchedPackage | null> {
  const info = await fetchPackageInfo(name)
  if (!info) return null

  const [downloads, tsSupport] = await Promise.all([
    fetchWeeklyDownloads(name),
    detectTypescriptSupport(info),
  ])

  return {
    pkgRow: toPackageRow(info),
    metaRow: toMetadataRow(info, downloads, tsSupport),
  }
}

async function flushToDb(db: Db, rows: FetchedPackage[]): Promise<void> {
  if (rows.length === 0) return

  await db
    .insert(packages)
    .values(rows.map((r) => r.pkgRow))
    .onConflictDoUpdate({
      target: packages.name,
      set: {
        description: sql`excluded.description`,
        latestVersion: sql`excluded.latest_version`,
        license: sql`excluded.license`,
        homepageUrl: sql`excluded.homepage_url`,
        repositoryUrl: sql`excluded.repository_url`,
        keywords: sql`excluded.keywords`,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(packageMetadata)
    .values(rows.map((r) => r.metaRow))
    .onConflictDoUpdate({
      target: packageMetadata.packageName,
      set: {
        weeklyDownloads: sql`excluded.weekly_downloads`,
        readmeLength: sql`excluded.readme_length`,
        dependencyCount: sql`excluded.dependency_count`,
        hasTypescriptSupport: sql`excluded.has_typescript_support`,
      },
    })
}

export interface CrawlOptions {
  maxPackages?: number
  fullSync?: boolean
  concurrency?: number
}

export async function crawl(db: Db, options: CrawlOptions = {}): Promise<void> {
  const { maxPackages, fullSync = false, concurrency = availableParallelism() } = options

  let since: string | number = fullSync ? 0 : (readLastSeq() ?? 0)
  let processed = 0
  let errors = 0

  console.log(
    `Starting ${fullSync ? 'full' : 'incremental'} sync from seq: ${since} (concurrency: ${concurrency})`,
  )

  while (true) {
    const changes = await fetchChanges(since, BATCH_SIZE)

    if (changes.results.length === 0) {
      console.log('No more changes to process.')
      break
    }

    const names: string[] = []
    for (const change of changes.results) {
      if (maxPackages && processed + names.length >= maxPackages) break
      if (change.deleted || change.id.startsWith('_design/')) continue
      names.push(change.id)
    }

    // Process in concurrent chunks
    for (let i = 0; i < names.length; i += concurrency) {
      const chunk = names.slice(i, i + concurrency)
      const results = await Promise.allSettled(
        chunk.map((name) => fetchPackage(name)),
      )

      const rows: FetchedPackage[] = []
      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled' && result.value) {
          rows.push(result.value)
          processed++
        } else if (result.status === 'rejected') {
          errors++
          console.error(
            `  [error] ${chunk[j]}: ${result.reason instanceof Error ? result.reason.message : result.reason}`,
          )
        }
      }

      await flushToDb(db, rows)

      if (processed % 50 < concurrency && processed >= 50) {
        console.log(`  Processed ${processed} packages (errors: ${errors})`)
      }
    }

    if (maxPackages && processed >= maxPackages) {
      console.log(`Reached max packages limit: ${maxPackages}`)
    }

    since = changes.last_seq
    writeLastSeq(String(since))
    console.log(
      `Batch complete. seq=${since}, processed=${processed}, errors=${errors}`,
    )

    if (maxPackages && processed >= maxPackages) return
  }

  console.log(
    `Crawl finished. Total processed: ${processed}, errors: ${errors}`,
  )
}
