import type { RedisClient } from '@npmdex/shared';

const INDEX_NAME = 'idx:packages';

interface SearchParams {
  q: string;
  page: number;
  limit: number;
  sort: string;
}

interface PackageResult {
  name: string;
  description: string;
  latestVersion: string;
  weeklyDownloads: number;
  githubStars: number;
  lastCommitDate: string | null;
  hasTypescriptSupport: string;
  overallScore: number;
  keywords: string[];
  license: string;
  homepageUrl: string;
  repositoryUrl: string;
}

interface SearchResponse {
  results: PackageResult[];
  total: number;
  page: number;
  limit: number;
}

const SORT_MAP: Record<string, { field: string; order: 'ASC' | 'DESC' }> = {
  downloads: { field: 'weeklyDownloads', order: 'DESC' },
  score: { field: 'overallScore', order: 'DESC' },
  stars: { field: 'githubStars', order: 'DESC' },
  updated: { field: 'lastCommitDate', order: 'DESC' },
};

function escapeRedisearch(q: string): string {
  return q.replace(/[\\@!{}()|<>\-~[\]"':;.,/^$*=&#?`+%]/g, '\\$&');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDocument(doc: any): PackageResult {
  const lastCommitTs = Number(doc.lastCommitDate ?? 0);
  return {
    name: String(doc.name ?? ''),
    description: String(doc.description ?? ''),
    latestVersion: String(doc.latestVersion ?? ''),
    weeklyDownloads: Number(doc.weeklyDownloads ?? 0),
    githubStars: Number(doc.githubStars ?? 0),
    lastCommitDate: lastCommitTs > 0 ? new Date(lastCommitTs).toISOString() : null,
    hasTypescriptSupport: String(doc.hasTypescriptSupport ?? 'none'),
    overallScore: Number(doc.overallScore ?? 0),
    keywords: doc.keywords ? String(doc.keywords).split(' ').filter(Boolean) : [],
    license: String(doc.license ?? ''),
    homepageUrl: String(doc.homepageUrl ?? ''),
    repositoryUrl: String(doc.repositoryUrl ?? ''),
  };
}

type FtSearchResult = {
  total: number;
  documents: Array<{ id: string; value: Record<string, unknown> }>;
};

function computeRelevanceScore(pkg: PackageResult, queryLower: string): number {
  const nameLower = pkg.name.toLowerCase();

  // Exact name match gets highest priority
  if (nameLower === queryLower) return 100000;

  let score = 0;

  // Name starts with query (e.g., "express" matches "express-validator")
  if (nameLower.startsWith(queryLower)) {
    score += 5000;
    // Shorter names rank higher (closer to exact match)
    score += Math.max(0, 500 - (nameLower.length - queryLower.length) * 10);
  }
  // Name contains query as a segment (e.g., "body-parser" for "parser")
  else if (
    nameLower.includes(`-${queryLower}`) ||
    nameLower.includes(`${queryLower}-`) ||
    nameLower.includes(queryLower)
  ) {
    score += 1000;
  }

  // Factor in quality score (0-100 → 0-200 contribution)
  score += pkg.overallScore * 2;

  // Factor in popularity as a tiebreaker (log scale)
  score += Math.min(100, Math.log10(Math.max(1, pkg.weeklyDownloads)) * 10);

  return score;
}

async function searchRelevance(redis: RedisClient, params: SearchParams): Promise<SearchResponse> {
  const { q, page, limit } = params;
  const queryLower = q.trim().toLowerCase();
  const escaped = escapeRedisearch(q.trim());

  if (!escaped) {
    return { results: [], total: 0, page, limit };
  }

  // Escape the tag value (TAG fields use different escaping)
  const tagEscaped = queryLower.replace(/[\\{}()|<>\-~[\]"':;.,/^$*=&#?`+%!@]/g, '\\$&');

  // Fetch candidates: exact name match + text search
  // We fetch extra candidates to allow quality-based re-ranking
  const candidateSize = Math.max(limit * 3, 50);

  const [exactResult, textResult] = await Promise.all([
    redis.ft.search(INDEX_NAME, `@nameExact:{${tagEscaped}}`, {
      LIMIT: { from: 0, size: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as Promise<FtSearchResult>,
    redis.ft.search(INDEX_NAME, escaped, {
      LIMIT: { from: 0, size: candidateSize },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as Promise<FtSearchResult>,
  ]);

  // Collect all unique candidates
  const seen = new Set<string>();
  const candidates: PackageResult[] = [];

  // Add exact match first
  for (const doc of exactResult.documents) {
    const pkg = parseDocument(doc.value);
    if (!seen.has(pkg.name)) {
      seen.add(pkg.name);
      candidates.push(pkg);
    }
  }

  // Add text search results
  for (const doc of textResult.documents) {
    const pkg = parseDocument(doc.value);
    if (!seen.has(pkg.name)) {
      seen.add(pkg.name);
      candidates.push(pkg);
    }
  }

  // Score and sort candidates
  const scored = candidates.map((pkg) => ({
    pkg,
    score: computeRelevanceScore(pkg, queryLower),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Paginate
  const offset = (page - 1) * limit;
  const paged = scored.slice(offset, offset + limit).map((s) => s.pkg);

  // Use text search total as approximate total (may be slightly off due to re-ranking)
  const total = textResult.total;

  return { results: paged, total, page, limit };
}

export async function searchPackages(
  redis: RedisClient,
  params: SearchParams,
): Promise<SearchResponse> {
  const { q, page, limit, sort } = params;

  if (!q.trim()) {
    return { results: [], total: 0, page, limit };
  }

  // Use custom relevance ranking for relevance sort
  if (sort === 'relevance') {
    return searchRelevance(redis, params);
  }

  // For non-relevance sorts, use RediSearch SORTBY directly
  const offset = (page - 1) * limit;
  const escaped = escapeRedisearch(q.trim());

  const sortConfig = SORT_MAP[sort];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchOptions: any = {
    LIMIT: { from: offset, size: limit },
  };

  if (sortConfig) {
    searchOptions.SORTBY = { BY: sortConfig.field, DIRECTION: sortConfig.order };
  }

  const results = (await redis.ft.search(INDEX_NAME, escaped, searchOptions)) as FtSearchResult;

  const packages: PackageResult[] = results.documents.map(
    (doc: { id: string; value: Record<string, unknown> }) => parseDocument(doc.value),
  );

  return {
    results: packages,
    total: results.total,
    page,
    limit,
  };
}
