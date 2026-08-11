import EmptyState from '@/components/EmptyState';
import Portal from '@/components/Portal';
import manifest from '@/data/manifest.json';

/**
 * Portal: the operator's control panel.
 *
 * Server component on purpose — the manifest is baked into the payload here and
 * only the interactive shell (`Portal`) crosses into the client, so the QR /
 * ZIP libraries stay out of the server bundle.
 */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4 sm:px-6">
          <h1 className="text-sm font-semibold tracking-[0.14em] text-zinc-900 uppercase dark:text-zinc-100">
            QR Manager
          </h1>
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            src/data/manifest.json · {manifest.length} entries
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {manifest.length === 0 ? <EmptyState /> : <Portal entries={manifest} />}
      </main>
    </div>
  );
}
