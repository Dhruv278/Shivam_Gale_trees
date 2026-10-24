import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Every file under `dir`, as paths relative to it with forward slashes. */
async function listFiles(dir, prefix = '') {
  const files = [];
  for (const dirent of await readdir(dir, { withFileTypes: true })) {
    const rel = `${prefix}${dirent.name}`;
    if (dirent.isDirectory()) files.push(...(await listFiles(join(dir, dirent.name), `${rel}/`)));
    else files.push(rel);
  }
  return files;
}

/**
 * Deletes the client-navigation payloads `next build` writes beside every viewer
 * page: `view/<slug>.txt` plus a `view/<slug>/` folder of segment `.txt` files,
 * four files per tree.
 *
 * Next.js only fetches these when the client router navigates between routes, and
 * nothing does that to a viewer page: a QR scan and the portal's Open link are both
 * full page loads, which get their payload inline in the HTML. Without them the
 * site is under a fifth of Cloudflare Pages' 20,000-file Free plan limit instead of
 * over half.
 *
 * Validates the whole of out/view/ before deleting anything. Any file it does not
 * recognise means the export layout changed, and it throws rather than guess.
 *
 * @param {string} outDir the `out/` folder of a static export
 * @returns {Promise<{pages: number, removed: number}>}
 */
export async function pruneViewPayloads(outDir) {
  const viewDir = join(outDir, 'view');
  const dirents = await readdir(viewDir, { withFileTypes: true });
  const pages = new Set(
    dirents.filter((d) => d.isFile() && d.name.endsWith('.html')).map((d) => d.name.slice(0, -'.html'.length)),
  );

  const doomed = [];
  let removed = 0;
  for (const dirent of dirents) {
    const rel = `view/${dirent.name}`;
    if (dirent.isFile() && dirent.name.endsWith('.html')) continue;

    const slug = dirent.isFile() ? dirent.name.replace(/\.txt$/, '') : dirent.name;
    if (dirent.isFile() && !dirent.name.endsWith('.txt')) {
      throw new Error(`[prune] unexpected file ${rel} - export layout changed, nothing deleted`);
    }
    if (!pages.has(slug)) {
      throw new Error(`[prune] ${rel} has no matching view/${slug}.html - nothing deleted`);
    }

    if (dirent.isDirectory()) {
      const files = await listFiles(join(viewDir, dirent.name));
      const stranger = files.find((f) => !f.endsWith('.txt'));
      if (stranger) {
        throw new Error(`[prune] unexpected file ${rel}/${stranger} - export layout changed, nothing deleted`);
      }
      removed += files.length;
    } else {
      removed += 1;
    }
    doomed.push(join(viewDir, dirent.name));
  }

  for (const path of doomed) await rm(path, { recursive: true });
  return { pages: pages.size, removed };
}
