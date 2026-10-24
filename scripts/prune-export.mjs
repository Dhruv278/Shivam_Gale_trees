/**
 * out/ -> out/ minus the viewer pages' client-navigation payloads.
 * Runs via postbuild, so every `npm run build` (including Cloudflare's) ships
 * the pruned folder. See src/lib/prune-export.mjs for why they are safe to drop.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pruneViewPayloads } from '../src/lib/prune-export.mjs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');

const { pages, removed } = await pruneViewPayloads(outDir);
console.log(`[prune] removed ${removed} navigation payload files, kept ${pages} viewer pages`);
