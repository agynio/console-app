const KEY = 'console.setupSkipped';

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * An empty organization opens setup on its own, so skipping has to be
 * remembered — otherwise the Overview would send the user straight back and the
 * flow would have no exit.
 */
export function markSetupSkipped(organizationId: string): void {
  if (typeof window === 'undefined' || !organizationId) return;
  const current = read();
  if (current.includes(organizationId)) return;
  window.localStorage.setItem(KEY, JSON.stringify([...current, organizationId]));
}

export function isSetupSkipped(organizationId: string): boolean {
  return read().includes(organizationId);
}
