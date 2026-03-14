import { createDb, createRedisClient } from '@npmdex/shared';
import { crawl } from './crawler.js';
import { enrichGitHub } from './enrich-github.js';
import { buildSearchIndex } from './redis-indexer.js';

function parseArgs(args: string[]) {
  const options: {
    fullSync: boolean;
    enrichGithub: boolean;
    buildIndex: boolean;
    incremental: boolean;
    maxPackages?: number;
  } = {
    fullSync: false,
    enrichGithub: false,
    buildIndex: false,
    incremental: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--full-sync') {
      options.fullSync = true;
    } else if (args[i] === '--enrich-github') {
      options.enrichGithub = true;
    } else if (args[i] === '--build-index') {
      options.buildIndex = true;
    } else if (args[i] === '--incremental') {
      options.incremental = true;
    } else if (args[i] === '--max-packages' && args[i + 1]) {
      options.maxPackages = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log('npmdex index-service');
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '(set)' : '(not set)'}`);

  const db = createDb();

  if (options.buildIndex) {
    const redisHost = process.env.REDIS_HOST ?? 'localhost';
    const redisPort = process.env.REDIS_PORT ?? '6379';
    console.log(`  Mode: build search index`);
    console.log(`  Redis: ${redisHost}:${redisPort}`);
    console.log(`  Incremental: ${options.incremental}`);

    const redis = createRedisClient();
    await redis.connect();

    try {
      await buildSearchIndex(db, redis, { incremental: options.incremental });
    } finally {
      await redis.quit();
    }
  } else if (options.enrichGithub) {
    console.log(`  Mode: GitHub enrichment`);
    console.log(`  GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? '(set)' : '(not set)'}`);
    if (options.maxPackages) {
      console.log(`  Max packages: ${options.maxPackages}`);
    }
    await enrichGitHub(db, { maxPackages: options.maxPackages });
  } else {
    console.log(`  Mode: ${options.fullSync ? 'full sync' : 'incremental'}`);
    if (options.maxPackages) {
      console.log(`  Max packages: ${options.maxPackages}`);
    }
    await crawl(db, options);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
