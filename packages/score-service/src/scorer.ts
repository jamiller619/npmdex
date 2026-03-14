import { eq, gt, isNull, or } from 'drizzle-orm';
import { packages, packageMetadata, packageScores } from '@npmdex/shared';
import type { Db } from '@npmdex/shared';

/**
 * Compute popularity sub-score (0-100) from downloads and stars.
 * Uses log scale since download/star counts span many orders of magnitude.
 */
export function computePopularityScore(downloads: number | null, stars: number | null): number {
  let score = 0;

  // Downloads component (0-70 points)
  if (downloads != null && downloads > 0) {
    // log10 scale: 10 downloads = 1, 1K = 3, 1M = 6, 100M = 8
    const logDownloads = Math.log10(downloads);
    // Normalize: 0-8 range → 0-70
    score += Math.min(70, (logDownloads / 8) * 70);
  }

  // Stars component (0-30 points)
  if (stars != null && stars > 0) {
    // log10 scale: 10 stars = 1, 100 = 2, 1K = 3, 100K = 5
    const logStars = Math.log10(stars);
    // Normalize: 0-5 range → 0-30
    score += Math.min(30, (logStars / 5) * 30);
  }

  return Math.round(Math.min(100, score));
}

/**
 * Compute maintenance sub-score (0-100) from commit recency and issue ratio.
 */
export function computeMaintenanceScore(
  lastCommitDate: Date | null,
  openIssues: number | null,
  stars: number | null,
): number {
  let score = 50; // Default if no data available

  // Recency component (0-70 points)
  if (lastCommitDate != null) {
    const daysSinceCommit = (Date.now() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCommit < 30) {
      score = 70;
    } else if (daysSinceCommit < 90) {
      score = 60;
    } else if (daysSinceCommit < 180) {
      score = 45;
    } else if (daysSinceCommit < 365) {
      score = 30;
    } else if (daysSinceCommit < 730) {
      score = 15;
    } else {
      score = 5;
    }
  }

  // Issue ratio component (0-30 points)
  // Lower ratio of open issues to stars = better maintained
  if (openIssues != null && stars != null && stars > 0) {
    const issueRatio = openIssues / stars;
    if (issueRatio < 0.01) {
      score += 30;
    } else if (issueRatio < 0.05) {
      score += 25;
    } else if (issueRatio < 0.1) {
      score += 20;
    } else if (issueRatio < 0.2) {
      score += 10;
    } else {
      score += 5;
    }
  } else if (openIssues != null && openIssues === 0) {
    score += 25; // No open issues is good
  }

  return Math.round(Math.min(100, score));
}

/**
 * Compute quality sub-score (0-100) from types, license, description, dependencies.
 */
export function computeQualityScore(
  hasTypes: 'native' | 'definitely-typed' | 'none',
  hasLicense: boolean,
  descriptionLength: number,
  dependencyCount: number | null,
): number {
  let score = 0;

  // TypeScript support (0-30 points)
  if (hasTypes === 'native') {
    score += 30;
  } else if (hasTypes === 'definitely-typed') {
    score += 20;
  }

  // License (0-20 points)
  if (hasLicense) {
    score += 20;
  }

  // Description quality (0-25 points)
  if (descriptionLength > 100) {
    score += 25;
  } else if (descriptionLength > 50) {
    score += 20;
  } else if (descriptionLength > 20) {
    score += 15;
  } else if (descriptionLength > 0) {
    score += 5;
  }

  // Low dependency count (0-25 points)
  if (dependencyCount != null) {
    if (dependencyCount === 0) {
      score += 25;
    } else if (dependencyCount <= 3) {
      score += 20;
    } else if (dependencyCount <= 10) {
      score += 15;
    } else if (dependencyCount <= 20) {
      score += 10;
    } else {
      score += 5;
    }
  } else {
    score += 10; // Unknown, give neutral score
  }

  return Math.round(Math.min(100, score));
}

/**
 * Compute overall score as weighted combination of sub-scores.
 */
export function computeOverallScore(
  popularity: number,
  maintenance: number,
  quality: number,
): number {
  // Weights: popularity 40%, maintenance 30%, quality 30%
  const overall = popularity * 0.4 + maintenance * 0.3 + quality * 0.3;
  return Math.round(Math.min(100, Math.max(0, overall)));
}

/**
 * Score all packages that need scoring (metadata updated since last scored).
 */
export async function scorePackages(
  db: Db,
  options: { maxPackages?: number } = {},
): Promise<number> {
  console.log('Fetching packages that need scoring...');

  // Find packages with metadata that either:
  // 1. Have never been scored (no entry in package_scores)
  // 2. Have metadata updated after the last score
  const rows = await db
    .select({
      package_name: packageMetadata.packageName,
      description: packages.description,
      license: packages.license,
      weekly_downloads: packageMetadata.weeklyDownloads,
      github_stars: packageMetadata.githubStars,
      github_open_issues: packageMetadata.githubOpenIssues,
      last_commit_date: packageMetadata.lastCommitDate,
      has_typescript_support: packageMetadata.hasTypescriptSupport,
      dependency_count: packageMetadata.dependencyCount,
      updated_at: packages.updatedAt,
      scored_at: packageScores.scoredAt,
    })
    .from(packageMetadata)
    .innerJoin(packages, eq(packages.name, packageMetadata.packageName))
    .leftJoin(packageScores, eq(packageScores.packageName, packageMetadata.packageName))
    .where(or(isNull(packageScores.scoredAt), gt(packages.updatedAt, packageScores.scoredAt)))
    .limit(options.maxPackages ?? 100000);

  console.log(`Found ${rows.length} packages to score.`);

  if (rows.length === 0) {
    return 0;
  }

  let scored = 0;
  const batchSize = 500;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.map((row) => {
      const popularity = computePopularityScore(row.weekly_downloads, row.github_stars);
      const maintenance = computeMaintenanceScore(
        row.last_commit_date,
        row.github_open_issues,
        row.github_stars,
      );
      const quality = computeQualityScore(
        row.has_typescript_support,
        row.license != null && row.license.length > 0,
        row.description?.length ?? 0,
        row.dependency_count,
      );
      const overall = computeOverallScore(popularity, maintenance, quality);

      return {
        packageName: row.package_name,
        overallScore: overall,
        popularityScore: popularity,
        maintenanceScore: maintenance,
        qualityScore: quality,
        scoredAt: new Date(),
      };
    });

    // Upsert batch
    for (const value of values) {
      await db
        .insert(packageScores)
        .values(value)
        .onConflictDoUpdate({
          target: packageScores.packageName,
          set: {
            overallScore: value.overallScore,
            popularityScore: value.popularityScore,
            maintenanceScore: value.maintenanceScore,
            qualityScore: value.qualityScore,
            scoredAt: value.scoredAt,
          },
        });
    }

    scored += batch.length;
    console.log(`  Scored ${scored}/${rows.length} packages`);
  }

  console.log(`Scoring complete. ${scored} packages scored.`);
  return scored;
}
