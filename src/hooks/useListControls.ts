import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

type SortValue = string | number;

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

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter((item) =>
      searchFields.some((field) => field(item).toLowerCase().includes(normalizedSearch)),
    );
  }, [items, normalizedSearch, searchFields]);

  const sortedItems = useMemo(() => {
    const sortAccessor = sortOptions[sortKey];
    const sorted = [...filteredItems].sort((a, b) => {
      const aValue = sortAccessor(a);
      const bValue = sortAccessor(b);
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return aValue - bValue;
      }
      return String(aValue).localeCompare(String(bValue), undefined, { sensitivity: 'base' });
    });
    return sortDirection === 'asc' ? sorted : sorted.reverse();
  }, [filteredItems, sortDirection, sortKey, sortOptions]);

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
