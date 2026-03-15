import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  pgEnum,
} from 'drizzle-orm/pg-core'

export const typescriptSupportEnum = pgEnum('typescript_support', [
  'native',
  'definitely-typed',
  'none',
])

export const packages = pgTable('packages', {
  name: text('name').primaryKey(),
  description: text('description'),
  latestVersion: text('latest_version'),
  license: text('license'),
  homepageUrl: text('homepage_url'),
  repositoryUrl: text('repository_url'),
  keywords: text('keywords').array(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const packageMetadata = pgTable('package_metadata', {
  packageName: text('package_name')
    .primaryKey()
    .references(() => packages.name),
  weeklyDownloads: integer('weekly_downloads'),
  githubStars: integer('github_stars'),
  githubOpenIssues: integer('github_open_issues'),
  lastCommitDate: timestamp('last_commit_date', { withTimezone: true }),
  hasTypescriptSupport: typescriptSupportEnum('has_typescript_support')
    .notNull()
    .default('none'),
  readmeLength: integer('readme_length'),
  dependencyCount: integer('dependency_count'),
})

export const packageScores = pgTable('package_scores', {
  packageName: text('package_name')
    .primaryKey()
    .references(() => packages.name),
  overallScore: real('overall_score').notNull(),
  popularityScore: real('popularity_score').notNull(),
  maintenanceScore: real('maintenance_score').notNull(),
  qualityScore: real('quality_score').notNull(),
  scoredAt: timestamp('scored_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
