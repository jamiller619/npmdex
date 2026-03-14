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

function buildQuery(q: string): string {
  if (!q.trim()) return '*';

  // Escape RediSearch special characters
  const escaped = q.replace(/[\\@!{}()|<>\-~[\]"':;.,/^$*=&#?`+%]/g, '\\$&');
  return escaped;
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

export async function searchPackages(
  redis: RedisClient,
  params: SearchParams,
): Promise<SearchResponse> {
  const { q, page, limit, sort } = params;
  const offset = (page - 1) * limit;
  const query = buildQuery(q);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchOptions: any = {
    LIMIT: { from: offset, size: limit },
  };

  if (sort !== 'relevance' && SORT_MAP[sort]) {
    const { field, order } = SORT_MAP[sort];
    searchOptions.SORTBY = { BY: field, DIRECTION: order };
  }

  const results = (await redis.ft.search(INDEX_NAME, query, searchOptions)) as {
    total: number;
    documents: Array<{ id: string; value: Record<string, unknown> }>;
  };

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
