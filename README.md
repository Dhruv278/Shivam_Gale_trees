# Image QR Manager

Generates a QR code for every image in `public/images/`, downloads them all as one ZIP with each
QR named after its source image, and serves a bare full-screen viewer that a scanned code opens.

No backend, no database, no API tokens.

## Operator workflow

1. **Add images.** Drop image files into `public/images/`. Supported: `.jpg`, `.jpeg`, `.png`,
   `.webp`.

2. **Set the production URL.** Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SITE_URL`
   to the final domain.

   > Every QR code embeds this URL. If you print codes and then change the domain, **every printed
   > code stops working.** Decide the domain before printing.

3. **Refresh the manifest.**

   ```bash
   npm run manifest
   ```

   This scans `public/images/` and writes `src/data/manifest.json`. It also runs automatically
   before `npm run dev` and `npm run build`, so you rarely need it by hand. Watch its output for
   collision warnings.

4. **Run the portal.**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, confirm the base URL shown at the top is correct, click
   **Generate QR Codes**, wait for the progress bar, then click **Download QR Codes**.

5. **Verify before printing.** Scan two or three codes from the downloaded ZIP with a real phone
   and confirm each opens the right image. This costs two minutes and is the only check that
   catches a wrong base URL before it becomes a reprint.

## How names are derived

Two names come from each filename, and they are deliberately different:

| | Purpose | `Front Label.jpg` → |
|---|---|---|
| `slug` | URL segment inside the QR code | `front-label` |
| `qrName` | Filename inside the ZIP | `Front Label.png` |

The QR filename keeps your original name verbatim so you can match a printed code back to its
image. The URL slug is lowercased and hyphenated so links stay clean.

If two files would produce the same name, the second gets a `-2` suffix and the manifest build
prints a warning.

## `src/data/slug-lock.json` — commit this file

**This is the file that guarantees printed QR codes never break.** It records which slug belongs to
which filename, permanently.

Deriving slugs from the folder contents alone is *not* safe. Suppose `front-b.jpg` is live and its
code is printed. Later you add `Front B.jpg` — which normalises to the same `front-b`. Whichever
filename sorts first wins, so the newcomer takes `front-b` and the original silently becomes
`front-b-2`. Every printed label for `front-b` would then open **the wrong poster** — worse than a
dead link, because it looks like it worked.

The lock prevents this:

- A filename already in the lock keeps its slug forever. New files are only ever *added*.
- Deleting an image moves it to `retired` and **keeps its slug reserved**, so the slug is never
  recycled onto a different image. An old code 404s, which is the honest outcome.
- Re-adding a deleted image gives it its original slug back.
- If a locked slug ever would change, `npm run manifest` **fails the build** rather than producing
  broken codes.

So: after adding images, run `npm run manifest` and **commit both** `manifest.json` and
`slug-lock.json`. If you lose the lock file, previously printed codes are no longer guaranteed.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Rebuild manifest, start dev server |
| `npm run build` | Rebuild manifest, production build, prerender every viewer page |
| `npm run manifest` | Rebuild `src/data/manifest.json` only |
| `npm test` | Run the naming and QR round-trip tests |

## Deploying

`npm run build` produces a static `out/` folder — plain HTML, CSS and images with no server. Host it
anywhere.

**Recommended: Cloudflare Pages.** Free, permits commercial use, and does not meter bandwidth.

1. Connect this GitHub repo to a new Cloudflare Pages project.
2. Build command `npm run build`, output directory `out`.
3. Add `NEXT_PUBLIC_SITE_URL` as an environment variable set to the deployed domain.
4. Redeploy, then regenerate the QR codes so they encode the right host.

> **Do not use Vercel's free Hobby plan for this.** Vercel's docs restrict Hobby to
> "non-commercial, personal use only." These are GAIL-branded corporate posters, so a suspension is
> a real risk — and it would kill every printed QR code at once. Vercel Pro ($20/month) lifts the
> restriction if you ever want it.

Because the output is static, migrating hosts later means copying the `out/` folder. The one thing
you *cannot* change after printing is the domain in the QR codes.

> **Strongly consider a custom domain before you print.** A `*.pages.dev` subdomain ties 1,700
> physical labels to Cloudflare permanently. A subdomain of a domain GAIL already owns costs nothing
> extra and lets you move hosts forever without reprinting.

## Layout

```
public/images/              source images (the folder you fill)
scripts/build-manifest.mjs  scans images, writes the manifest
src/data/manifest.json       generated: [{ file, slug, qrName, name }]
src/lib/naming.mjs           slug / qrName derivation and collision rules
src/app/page.js              the portal
src/app/view/[slug]/         the bare image viewer
docs/superpowers/specs/      design document
```

## On image size

The posters are print-resolution (2675×4754, ~1 MB each), about 1.8 GB across 1,700 files. They are
committed at **full quality on purpose** — the posters carry fine print that people zoom in to read,
and downscaling or re-encoding to WebP would degrade exactly that. See the "Image storage" section
of the design doc in `docs/superpowers/specs/` for the measured numbers and the verified platform
limits.

If a Vercel build ever fails on size, the fallback is Cloudflare R2 (10 GB free, free egress). The
viewer builds its image URL in one place, so that is a config change, not a rewrite.
