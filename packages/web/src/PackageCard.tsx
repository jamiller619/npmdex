import type { PackageResult } from './types'

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function tsBadge(support: string): React.ReactNode {
  if (support === 'native')
    return <span className="badge badge-ts-native">TS</span>
  if (support === 'definitely-typed')
    return <span className="badge badge-ts-dt">DT</span>
  return null
}

export function PackageCard({ pkg }: { pkg: PackageResult }) {
  return (
    <div className="package-card">
      <div className="package-header">
        <a
          href={`https://www.npmjs.com/package/${pkg.name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="package-name"
        >
          {pkg.name}
        </a>
        <span className="package-version">v{pkg.latestVersion}</span>
        {tsBadge(pkg.hasTypescriptSupport)}
        <span className="package-score" title="Quality score">
          {Math.round(pkg.overallScore)}
        </span>
      </div>

      {pkg.description && (
        <p className="package-description">{pkg.description}</p>
      )}

      <div className="package-meta">
        <span title="Weekly downloads">
          ↓ {formatDownloads(pkg.weeklyDownloads)}
        </span>
        {pkg.githubStars > 0 && (
          <span title="GitHub stars">★ {formatDownloads(pkg.githubStars)}</span>
        )}
        <span title="Last commit">{formatDate(pkg.lastCommitDate)}</span>
        {pkg.license && <span title="License">{pkg.license}</span>}
        {pkg.repositoryUrl && (
          <a
            href={pkg.repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="repo-link"
            title="Repository"
          >
            Repo
          </a>
        )}
      </div>

      {pkg.keywords.length > 0 && (
        <div className="package-keywords">
          {pkg.keywords.slice(0, 8).map((kw) => (
            <span key={kw} className="keyword">
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
