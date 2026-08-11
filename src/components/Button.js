/**
 * The only button in the app. Variants exist so the control panel has one
 * visual language instead of ad-hoc class strings per call site.
 */

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap ' +
  'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-zinc-500 ' +
  'dark:focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-45';

const VARIANTS = {
  primary:
    'bg-zinc-900 text-zinc-50 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white',
  secondary:
    'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 ' +
    'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  ghost:
    'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 ' +
    'dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50',
};

const SIZES = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-10 px-4 text-sm',
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}
