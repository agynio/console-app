import { useCallback, useState } from 'react';

const STORAGE_KEY = 'console.sidebarGroups';

/** Group ids that the user has collapsed. Absent means expanded. */
type CollapsedGroups = Record<string, boolean>;

function readCollapsedGroups(): CollapsedGroups {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === 'boolean'),
    ) as CollapsedGroups;
  } catch {
    return {};
  }
}

function persistCollapsedGroups(collapsed: CollapsedGroups) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
}

export function useSidebarGroups() {
  const [collapsed, setCollapsed] = useState<CollapsedGroups>(readCollapsedGroups);

  const isCollapsed = useCallback((groupId: string) => collapsed[groupId] === true, [collapsed]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsed((current) => {
      const next = { ...current, [groupId]: !current[groupId] };
      persistCollapsedGroups(next);
      return next;
    });
  }, []);

  return { isCollapsed, toggleGroup };
}
