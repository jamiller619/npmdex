const REGISTRY_URL = 'https://registry.npmjs.org'
const REPLICATE_URL = 'https://replicate.npmjs.com'
const DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point/last-week'

export interface RegistryPackageInfo {
  name: string
  description?: string
  'dist-tags'?: { latest?: string }
  license?: string
  homepage?: string
  repository?: { type?: string; url?: string } | string
  keywords?: string[]
  readme?: string
  versions?: Record<
    string,
    { dependencies?: Record<string, string>; types?: string; typings?: string }
  >
}

export interface ChangesResponse {
  last_seq: string | number
  results: Array<{
    seq: string | number
    id: string
    deleted?: boolean
  }>
}

export interface DownloadsResponse {
  package: string
  downloads: number
}

export async function fetchChanges(
  since: string | number = 0,
  limit: number = 250,
): Promise<ChangesResponse> {
  const url = `${REPLICATE_URL}/_changes?since=${encodeURIComponent(String(since))}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch changes: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ChangesResponse
}

export async function fetchPackageInfo(
  name: string,
): Promise<RegistryPackageInfo | null> {
  const url = `${REGISTRY_URL}/${encodeURIComponent(name)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(
      `Failed to fetch package ${name}: ${res.status} ${res.statusText}`,
    )
  }
  return (await res.json()) as RegistryPackageInfo
}

export async function fetchWeeklyDownloads(
  name: string,
): Promise<number | null> {
  const url = `${DOWNLOADS_URL}/${encodeURIComponent(name)}`
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) return null
  const data = (await res.json()) as DownloadsResponse
  return data.downloads ?? null
}
