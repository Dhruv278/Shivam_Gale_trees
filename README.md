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
prints a warning. Files are processed in sorted order, so these suffixes never move between
builds — an already-printed code keeps pointing at the same image.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Rebuild manifest, start dev server |
| `npm run build` | Rebuild manifest, production build, prerender every viewer page |
| `npm run manifest` | Rebuild `src/data/manifest.json` only |
| `npm test` | Run the naming and QR round-trip tests |

## Deploying

Push to GitHub and deploy through Vercel's **Git integration**.

> **Do not run `vercel deploy` from your machine.** The CLI path caps static uploads at **100 MB**
> on the Hobby plan, and the images are ~1.8 GB, so it will fail. Git-integration deploys clone into
> a 32 GB build container instead, which has ample room.

Set `NEXT_PUBLIC_SITE_URL` in the Vercel project's environment variables to the deployed domain,
then redeploy so generated codes encode the right host.

Expect slow pushes and slow builds: the repo carries ~1.8 GB of images and Vercel re-clones it on
every build. That is the accepted cost of keeping the posters at full resolution so their fine print
stays readable when zoomed.

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
