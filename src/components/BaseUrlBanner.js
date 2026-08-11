/**
 * The most important element on the page.
 *
 * QR codes get printed, so an incorrect domain silently destroys a whole run.
 * The banner therefore always shows the literal base URL and a literal example
 * target, and shouts when the domain is only a guess (window.location.origin).
 */

export default function BaseUrlBanner({ baseUrl, envConfigured, exampleSlug }) {
  const resolving = !baseUrl;
  const example = baseUrl && exampleSlug ? `${baseUrl}/view/${exampleSlug}` : null;

  return (
    <section
      aria-labelledby="base-url-heading"
      className={`flex overflow-hidden rounded-xl border shadow-sm ${
        envConfigured
          ? 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60'
          : 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/25'
      }`}
    >
      {/* Accent rail: a separate element rather than border-l-4, so border-width
          utilities can never fight each other. */}
      <div
        aria-hidden="true"
        className={`w-1.5 shrink-0 ${
          envConfigured ? 'bg-emerald-500' : 'bg-amber-500'
        }`}
      />

      <div className="min-w-0 flex-1 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
              envConfigured
                ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950'
                : 'bg-amber-500 text-amber-950'
            }`}
          >
            {envConfigured ? 'Domain pinned' : 'Domain not pinned'}
          </span>
          <h2 id="base-url-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {envConfigured ? 'NEXT_PUBLIC_SITE_URL is set' : 'NEXT_PUBLIC_SITE_URL is not set'}
          </h2>
        </div>

        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Base URL
            </dt>
            <dd className="mt-1.5 truncate font-mono text-base font-medium text-zinc-900 sm:text-lg dark:text-zinc-50">
              {resolving ? <span className="text-zinc-400">resolving…</span> : baseUrl}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Every QR encodes
            </dt>
            <dd className="mt-1.5 truncate font-mono text-base text-zinc-700 sm:text-lg dark:text-zinc-300">
              {example ?? <span className="text-zinc-400">resolving…</span>}
            </dd>
          </div>
        </dl>

        {!envConfigured && (
          <p className="mt-5 border-t border-amber-300/70 pt-4 text-sm leading-relaxed text-amber-900 dark:border-amber-500/30 dark:text-amber-200">
            Codes generated now encode{' '}
            <span className="font-mono font-semibold">{baseUrl || 'this browser’s origin'}</span> —
            the origin of the browser you are using right now, not a pinned domain. Set{' '}
            <span className="font-mono font-semibold">NEXT_PUBLIC_SITE_URL</span> and{' '}
            <span className="font-semibold">regenerate every QR code</span> before printing, and
            again if the domain ever changes: printed codes cannot be edited. Generation stays
            enabled so you can test locally.
          </p>
        )}
      </div>
    </section>
  );
}
