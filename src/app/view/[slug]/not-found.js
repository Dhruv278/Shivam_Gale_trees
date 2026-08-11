/**
 * Shown when a scanned slug is not in the manifest (a retired image, or a mistyped URL).
 * Rendering literally nothing would look like a broken site to someone holding a phone,
 * so this is the smallest honest fallback: one line, same dark backdrop as the viewer.
 */
export default function NotFound() {
  return (
    <section className="flex flex-1 items-center justify-center bg-[#171717] text-sm text-neutral-400">
      Image not found.
    </section>
  );
}
