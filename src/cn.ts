/** Joins the truthy class names: `cn('a', flag && 'b')`. */
function cn(...classNames: (string | false | null | undefined)[]): string {
  return classNames.filter(Boolean).join(' ');
}

export { cn };
