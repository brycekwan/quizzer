export function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function isValidPlayerName(name: string): boolean {
  const normalized = normalizePlayerName(name);
  return normalized.length >= 1 && normalized.length <= 24;
}

/** Case-insensitive uniqueness check against existing names. */
export function isNameTaken(
  name: string,
  existingNames: Iterable<string>
): boolean {
  const target = normalizePlayerName(name).toLowerCase();
  for (const existing of existingNames) {
    if (normalizePlayerName(existing).toLowerCase() === target) {
      return true;
    }
  }
  return false;
}
