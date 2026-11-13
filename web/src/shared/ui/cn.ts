/** Join truthy class names cleanly for Tailwind primitives. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
