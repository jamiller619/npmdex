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
const REQUEST_DELAY_MS = 100

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

async function processPackage(db: Db, name: string): Promise<boolean> {
  const info = await fetchPackageInfo(name)
  if (!info) {
    console.log(`  [skip] ${name} — not found`)
    return false
  }

  const [downloads, tsSupport] = await Promise.all([
    fetchWeeklyDownloads(name),
    detectTypescriptSupport(info),
  ])

  const pkgRow = toPackageRow(info)
  const metaRow = toMetadataRow(info, downloads, tsSupport)

  await db
    .insert(packages)
    .values(pkgRow)
    .onConflictDoUpdate({
      target: packages.name,
      set: {
        description: pkgRow.description,
        latestVersion: pkgRow.latestVersion,
        license: pkgRow.license,
        homepageUrl: pkgRow.homepageUrl,
        repositoryUrl: pkgRow.repositoryUrl,
        keywords: pkgRow.keywords,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(packageMetadata)
    .values(metaRow)
    .onConflictDoUpdate({
      target: packageMetadata.packageName,
      set: {
        weeklyDownloads: metaRow.weeklyDownloads,
        readmeLength: metaRow.readmeLength,
        dependencyCount: metaRow.dependencyCount,
        hasTypescriptSupport: metaRow.hasTypescriptSupport,
      },
    })

  return true
}

export interface CrawlOptions {
  maxPackages?: number
  fullSync?: boolean
}

export async function crawl(db: Db, options: CrawlOptions = {}): Promise<void> {
  const { maxPackages, fullSync = false } = options

  let since: string | number = fullSync ? 0 : (readLastSeq() ?? 0)
  let processed = 0
  let errors = 0

  console.log(
    `Starting ${fullSync ? 'full' : 'incremental'} sync from seq: ${since}`,
  )

  while (true) {
    const changes = await fetchChanges(since, BATCH_SIZE)

    if (changes.results.length === 0) {
      console.log('No more changes to process.')
      break
    }

    for (const change of changes.results) {
      if (maxPackages && processed >= maxPackages) {
        console.log(`Reached max packages limit: ${maxPackages}`)
        writeLastSeq(String(change.seq))
        return
      }

      if (change.deleted || change.id.startsWith('_design/')) {
        continue
      }

      try {
        const ok = await processPackage(db, change.id)
        if (ok) {
          processed++
          if (processed % 50 === 0) {
            console.log(`  Processed ${processed} packages (errors: ${errors})`)
          }
        }
      } catch (err) {
        errors++
        console.error(
          `  [error] ${change.id}: ${err instanceof Error ? err.message : err}`,
        )
      }

      await sleep(REQUEST_DELAY_MS)
    }

    since = changes.last_seq
    writeLastSeq(String(since))
    console.log(
      `Batch complete. seq=${since}, processed=${processed}, errors=${errors}`,
    )
  }

  console.log(
    `Crawl finished. Total processed: ${processed}, errors: ${errors}`,
  )
}
