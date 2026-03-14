import {
  packages,
  packageMetadata,
  packageScores,
  type Db,
  type RedisClient,
} from '@npmdex/shared';
import { eq, gt, isNull, or } from 'drizzle-orm';

const INDEX_NAME = 'idx:packages';
const KEY_PREFIX = 'pkg:';

interface IndexablePackage {
  name: string;
  nameExact: string;
  description: string;
  latestVersion: string;
  license: string;
  homepageUrl: string;
  repositoryUrl: string;
  keywords: string;
  weeklyDownloads: number;
  githubStars: number;
  githubOpenIssues: number;
  lastCommitDate: number;
  hasTypescriptSupport: string;
  overallScore: number;
  popularityScore: number;
  maintenanceScore: number;
  qualityScore: number;
}

export async function createSearchIndex(redis: RedisClient): Promise<void> {
  try {
    await redis.ft.dropIndex(INDEX_NAME);
    console.log('Dropped existing search index.');
  } catch {
    // Index doesn't exist yet — that's fine
  }

  await redis.ft.create(
    INDEX_NAME,
    {
      '$.name': { type: 'TEXT', AS: 'name', WEIGHT: 10 },
      '$.nameExact': { type: 'TAG', AS: 'nameExact' },
      '$.description': { type: 'TEXT', AS: 'description', WEIGHT: 2 },
      '$.keywords': { type: 'TEXT', AS: 'keywords', WEIGHT: 5 },
      '$.latestVersion': { type: 'TAG', AS: 'latestVersion' },
      '$.license': { type: 'TAG', AS: 'license' },
      '$.hasTypescriptSupport': { type: 'TAG', AS: 'hasTypescriptSupport' },
      '$.weeklyDownloads': { type: 'NUMERIC', AS: 'weeklyDownloads', SORTABLE: true },
      '$.githubStars': { type: 'NUMERIC', AS: 'githubStars', SORTABLE: true },
      '$.githubOpenIssues': { type: 'NUMERIC', AS: 'githubOpenIssues', SORTABLE: true },
      '$.lastCommitDate': { type: 'NUMERIC', AS: 'lastCommitDate', SORTABLE: true },
      '$.overallScore': { type: 'NUMERIC', AS: 'overallScore', SORTABLE: true },
      '$.popularityScore': { type: 'NUMERIC', AS: 'popularityScore', SORTABLE: true },
      '$.maintenanceScore': { type: 'NUMERIC', AS: 'maintenanceScore', SORTABLE: true },
      '$.qualityScore': { type: 'NUMERIC', AS: 'qualityScore', SORTABLE: true },
    },
    {
      ON: 'JSON',
      PREFIX: KEY_PREFIX,
    },
  );

  console.log('Created RediSearch index.');
}

function toIndexable(row: {
  packages: typeof packages.$inferSelect;
  package_metadata: typeof packageMetadata.$inferSelect | null;
  package_scores: typeof packageScores.$inferSelect | null;
}): IndexablePackage {
  return {
    name: row.packages.name,
    nameExact: row.packages.name,
    description: row.packages.description ?? '',
    latestVersion: row.packages.latestVersion ?? '',
    license: row.packages.license ?? '',
    homepageUrl: row.packages.homepageUrl ?? '',
    repositoryUrl: row.packages.repositoryUrl ?? '',
    keywords: row.packages.keywords?.join(' ') ?? '',
    weeklyDownloads: row.package_metadata?.weeklyDownloads ?? 0,
    githubStars: row.package_metadata?.githubStars ?? 0,
    githubOpenIssues: row.package_metadata?.githubOpenIssues ?? 0,
    lastCommitDate: row.package_metadata?.lastCommitDate?.getTime() ?? 0,
    hasTypescriptSupport: row.package_metadata?.hasTypescriptSupport ?? 'none',
    overallScore: row.package_scores?.overallScore ?? 0,
    popularityScore: row.package_scores?.popularityScore ?? 0,
    maintenanceScore: row.package_scores?.maintenanceScore ?? 0,
    qualityScore: row.package_scores?.qualityScore ?? 0,
  };
}

const BATCH_SIZE = 500;

export interface BuildIndexOptions {
  incremental?: boolean;
}

export async function buildSearchIndex(
  db: Db,
  redis: RedisClient,
  options: BuildIndexOptions = {},
): Promise<void> {
  const startTime = Date.now();

  if (!options.incremental) {
    await createSearchIndex(redis);
  }

  const lastSyncKey = 'npmdex:last_index_sync';
  let lastSync: Date | null = null;

  if (options.incremental) {
    const stored = await redis.get(lastSyncKey);
    if (stored) {
      lastSync = new Date(stored);
      console.log(`Incremental sync from: ${lastSync.toISOString()}`);
    } else {
      console.log('No previous sync found, doing full index build.');
      await createSearchIndex(redis);
    }
  }

  let offset = 0;
  let totalIndexed = 0;

  while (true) {
    let query = db
      .select()
      .from(packages)
      .leftJoin(packageMetadata, eq(packages.name, packageMetadata.packageName))
      .leftJoin(packageScores, eq(packages.name, packageScores.packageName))
      .limit(BATCH_SIZE)
      .offset(offset);

    if (lastSync) {
      query = query.where(
        or(gt(packages.updatedAt, lastSync), isNull(packageScores.scoredAt)),
      ) as typeof query;
    }

    const rows = await query;

    if (rows.length === 0) break;

    const pipeline = redis.multi();
    for (const row of rows) {
      const doc = toIndexable(row);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pipeline.json.set(`${KEY_PREFIX}${doc.name}`, '$', doc as any);
    }
    await pipeline.exec();

    totalIndexed += rows.length;
    offset += rows.length;

    if (totalIndexed % 1000 === 0 || rows.length < BATCH_SIZE) {
      console.log(`  Indexed ${totalIndexed} packages...`);
    }
  }

  await redis.set(lastSyncKey, new Date().toISOString());

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Index build complete. ${totalIndexed} packages indexed in ${elapsed}s.`);
}
