# Tree QR & Plate Manager

GAIL (India) Ltd · Hazira Compressor Station · Tree Survey 2026-27.

Every tree in the survey gets its own viewer page, QR code, and printable plate. The survey Excel
is the source of truth (1,777 trees, 45 species); a tree goes live the moment its photo lands in
the drop folder. No backend, no database, no API tokens — the whole site is static files.

## Operator workflow (per-tree)

1. **Drop tree photos.** Put each species' photos in its own folder under `public/images/`:

   ```
   public/images/Aam/Aam 1.jpg
   public/images/Aam/Aam 2.jpg
   public/images/Ashok/Ashok 1.jpg
   ```

   - The folder name must match the species spelling in the Excel (`Aam`, `Royal Palm`, …).
   - The filename just has to **end in the tree number** (`Aam 7.jpg`, `Aam-7.jpg`, `7.jpg` all
     work). Supported: `.jpg`, `.jpeg`, `.png`, `.webp`.
   - A photo for a tree the Excel does not know is skipped with a warning — fix the name, never
     force it.

   > The 45 photos currently in the repo are **test stand-ins** (the old species posters split
   > into `Aam/`, `Aavla/`, `Ashok/`). Delete them when the real ~1,700 photos arrive.

2. **Refresh the manifest** (also runs automatically before `dev` and `build`):

   ```bash
   npm run manifest
   ```

   Reads `src/data/trees.json` + the photo folders, writes `src/data/manifest.json`, and reports
   how many trees are still waiting for photos. Commit both files.

3. **Set the production URL.** Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SITE_URL`
   to the final domain.

   > Every QR embeds this URL. Printed codes cannot be edited — decide the domain before printing.

4. **Use the portal** (`npm run dev`, then http://localhost:3000):

   - One collapsible **section per species** with every photographed tree: copy URL, open viewer,
     download a single QR.
   - **Download `<Species>.zip`** per section, or **Download All (ZIP)** for everything. Both use
     the same layout, one folder per species with matching file names:

     ```
     Aam/
       images/Aam 1.jpg   ← the original photo
       qr/Aam 1.png       ← the QR code
       plates/Aam 1.jpg   ← the composed plate (only for species with template artwork)
     ```

   - `/plate` composes any tree's plate at print resolution (1600×1309 px = 5.5″×4.5″) and
     downloads it as JPG.

5. **Before printing:**

   ```bash
   npm run verify-print                                    # coverage report, fails if not printable
   node scripts/generate-print-files.mjs https://your-domain   # writes output/print/ on disk
   ```

   The production script writes the same species/images-qr-plates layout to `output/print/`
   without holding 1,700 files in browser memory. Scan a few QRs with a real phone as the final
   check.

## When a revised Excel arrives

Replace `Revised Tree survey 2026-27.xlsx` and run:

```bash
npm run import-survey
```

This regenerates `src/data/trees.json` (committed). It aborts on duplicate or unparseable rows and
on any total other than 1,777 — adjust `EXPECTED_TOTAL` in `scripts/import-survey.mjs` if the
survey legitimately changes size.

## When new plate template artwork arrives

1. Drop the artwork in `public/plates/<species>.jpg` (same 5.5:4.5 proportions, high resolution —
   not a WhatsApp copy).
2. Register it in `PLATE_TEMPLATES` in `src/lib/plate.mjs` (copy the `Aam` entry; measure the QR
   box and number band from the artwork).
3. `npm run verify-print` confirms which species are still missing artwork.

## Tree identity and slugs

A tree's identity is its Excel name: species + running number. `Aam -15` is `Aam 15` forever, so
its slug `aam-15` is derived deterministically — no allocation, no lock needed. The build fails
loudly if a tree slug would ever collide with `src/data/slug-lock.json` (the frozen legacy lock
from the old one-QR-per-image scheme; keep it committed as a tombstone so no old printed code can
ever be silently re-pointed).

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Rebuild manifest, start dev server |
| `npm run build` | Rebuild manifest, production build, prerender every viewer page |
| `npm run manifest` | Rebuild `src/data/manifest.json` only |
| `npm run import-survey` | Excel → `src/data/trees.json` (run when the Excel changes) |
| `npm run verify-print` | Printability report (photo + template coverage per species) |
| `node scripts/generate-print-files.mjs <url>` | Write all print files to `output/print/` |
| `npm test` | Run the unit tests |

## Deploying

`npm run build` produces a static `out/` folder — plain HTML, CSS and images with no server. Host it
anywhere.

**Recommended: Cloudflare Pages.** Free, permits commercial use, and does not meter bandwidth.

1. Connect this GitHub repo to a new Cloudflare Pages project.
2. Build command `npm run build`, output directory `out`.
3. Add `NEXT_PUBLIC_SITE_URL` as an environment variable set to the deployed domain.
4. Redeploy, then regenerate the QR codes so they encode the right host.

> **Do not use Vercel's free Hobby plan for this.** Vercel's docs restrict Hobby to
> "non-commercial, personal use only." These are GAIL-branded corporate assets, so a suspension is
> a real risk — and it would kill every printed QR code at once.

Because the output is static, migrating hosts later means copying the `out/` folder. The one thing
you *cannot* change after printing is the domain in the QR codes.

> **Strongly consider a custom domain before you print.** A `*.pages.dev` subdomain ties 1,777
> physical plates to Cloudflare permanently. A subdomain of a domain GAIL already owns costs
> nothing extra and lets you move hosts forever without reprinting.

## Layout

```
public/images/<Species>/     tree photo drop folders (the folders you fill)
public/plates/               plate template artwork per species
public/fonts/STENCIL.TTF     number font for plates
Revised Tree survey *.xlsx   the survey (source of truth)
scripts/import-survey.mjs    Excel → src/data/trees.json
scripts/build-manifest.mjs   photos × survey → src/data/manifest.json
scripts/verify-print-run.mjs printability report
scripts/generate-print-files.mjs  production print files to output/print/
src/data/trees.json          generated, committed: all 1,777 trees
src/data/manifest.json       generated, committed: photographed trees
src/lib/trees.mjs            tree identity, photo matching, manifest building
src/lib/plate.mjs            plate geometry + drawing (engine-independent)
src/lib/bundle.mjs           the ZIP/disk bundle layout
src/app/page.js              the portal (species sections)
src/app/plate/               the plate generator
src/app/view/[slug]/         the bare per-tree viewer
docs/plate-plan.html         the roadmap shown to the operator
docs/superpowers/            design docs and implementation plans
```

## On image size

Print-resolution photos are committed at **full quality on purpose** — people zoom into them.
~1,700 photos at ~1 MB each is ~1.8 GB, verified against platform limits in the design doc under
`docs/superpowers/specs/`. If a build ever fails on size, the fallback is Cloudflare R2 (10 GB
free, free egress); the viewer builds its image URL in one place, so that is a config change, not
a rewrite.
