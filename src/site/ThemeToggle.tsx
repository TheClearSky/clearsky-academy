import { nextPreference, setThemePreference, useThemePreference } from '../theme';
import type { ThemePreference } from '../theme';
import { cn } from '../cn';

const LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  if (preference === 'light') {
    return (
      <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
        <circle cx='12' cy='12' r='4' {...stroke} />
        <path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' {...stroke} />
      </svg>
    );
  }
  if (preference === 'dark') {
    return (
      <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
        <path d='M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z' {...stroke} />
      </svg>
    );
  }
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
      <rect x='3' y='4' width='18' height='12' rx='2' {...stroke} />
      <path d='M8 20h8M12 16v4' {...stroke} />
    </svg>
  );
}

/**
 * The theme switch (`theme.ts`): one button that cycles System → Light →
 * Dark, showing the current choice. System (the default) follows the OS.
 */
function ThemeToggle({ className }: { className?: string }) {
  const preference = useThemePreference();
  const next = nextPreference(preference);
  return (
    <button
      type='button'
      onClick={() => setThemePreference(next)}
      title={`Theme: ${LABELS[preference]} — switch to ${LABELS[next]}`}
      aria-label={`Theme: ${LABELS[preference]}. Switch to ${LABELS[next]}`}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-full border border-primary-white/25 bg-primary-black/30 px-3 py-1.5 text-[13px] font-medium backdrop-blur hover:bg-primary-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-gold',
        className,
      )}
    >
      <ThemeIcon preference={preference} />
      <span>{LABELS[preference]}</span>
    </button>
  );
}

export { ThemeToggle };
