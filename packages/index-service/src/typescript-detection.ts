import type { TypescriptSupport } from '@npmdex/shared'

import type { RegistryPackageInfo } from './registry.js'

const REGISTRY_URL = 'https://registry.npmjs.org'

/**
 * Check if a package has native TypeScript support by looking at the
 * types/typings field in the latest version's package.json.
 */
function hasNativeTypes(info: RegistryPackageInfo): boolean {
  const latest = info['dist-tags']?.latest
  if (!latest || !info.versions?.[latest]) return false
  const version = info.versions[latest]
  return !!(version.types || version.typings)
}

/**
 * Check if a @types/* package exists on the npm registry.
 * Uses a HEAD request for efficiency.
 */
async function hasDefinitelyTypedPackage(
  packageName: string,
): Promise<boolean> {
  // Scoped packages like @foo/bar have DT packages named @types/foo__bar
  const dtName = packageName.startsWith('@')
    ? `@types/${packageName.slice(1).replace('/', '__')}`
    : `@types/${packageName}`

  const url = `${REGISTRY_URL}/${encodeURIComponent(dtName)}`
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Detect TypeScript support for a package.
 * Returns 'native' if the package includes its own types,
 * 'definitely-typed' if @types/* exists, or 'none'.
 */
export async function detectTypescriptSupport(
  info: RegistryPackageInfo,
): Promise<TypescriptSupport> {
  if (hasNativeTypes(info)) {
    return 'native'
  }

  if (await hasDefinitelyTypedPackage(info.name)) {
    return 'definitely-typed'
  }

  return 'none'
}
