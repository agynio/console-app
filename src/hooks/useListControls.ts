import { useMemo, useRef, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

type SortValue = string | number;

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => Object.is(value, b[index]));
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(bRecord, key) && Object.is(aRecord[key], bRecord[key]));
}

function useStableValue<T>(value: T): T {
  const ref = useRef(value);
  if (!shallowEqual(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
}

type UseListControlsOptions<T, SortOptions extends Record<string, (item: T) => SortValue>> = {
  items: T[];
  searchFields: Array<(item: T) => string>;
  sortOptions: SortOptions;
  defaultSortKey: keyof SortOptions;
  defaultSortDirection?: SortDirection;
};

type UseListControlsResult<T, SortKey extends string> = {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  sortKey: SortKey;
  sortDirection: SortDirection;
  handleSort: (key: SortKey) => void;
  filteredItems: T[];
};

export function useListControls<T, SortOptions extends Record<string, (item: T) => SortValue>>(
  options: UseListControlsOptions<T, SortOptions>,
): UseListControlsResult<T, Extract<keyof SortOptions, string>> {
  const {
    items,
    searchFields,
    sortOptions,
    defaultSortKey,
    defaultSortDirection = 'asc',
  } = options;
  type SortKey = Extract<keyof SortOptions, string>;
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey as SortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSortDirection);
  const stableSearchFields = useStableValue(searchFields);
  const stableSortOptions = useStableValue(sortOptions);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter((item) =>
      stableSearchFields.some((field) => field(item).toLowerCase().includes(normalizedSearch)),
    );
  }, [items, normalizedSearch, stableSearchFields]);

  const sortedItems = useMemo(() => {
    const sortAccessor = stableSortOptions[sortKey];
    const sorted = [...filteredItems].sort((a, b) => {
      const aValue = sortAccessor(a);
      const bValue = sortAccessor(b);
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return aValue - bValue;
      }
      return String(aValue).localeCompare(String(bValue), undefined, { sensitivity: 'base' });
    });
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [filteredItems, sortDirection, sortKey, stableSortOptions]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  return {
    searchTerm,
    setSearchTerm,
    sortKey,
    sortDirection,
    handleSort,
    filteredItems: sortedItems,
  };
}
