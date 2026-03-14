import { createDb } from '@npmdex/shared';
import { crawl } from './crawler.js';

function parseArgs(args: string[]) {
  const options: { fullSync: boolean; maxPackages?: number } = {
    fullSync: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--full-sync') {
      options.fullSync = true;
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
  console.log(`  Mode: ${options.fullSync ? 'full sync' : 'incremental'}`);
  if (options.maxPackages) {
    console.log(`  Max packages: ${options.maxPackages}`);
  }

  const db = createDb();
  await crawl(db, options);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
