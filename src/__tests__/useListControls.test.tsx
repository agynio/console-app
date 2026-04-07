import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useListControls } from '@/hooks/useListControls';

type Item = {
  id: string;
  name: string;
  tag: string;
  count: number;
};

const items: Item[] = [
  { id: 'one', name: 'Alpha', tag: 'omega', count: 3 },
  { id: 'two', name: 'Beta', tag: 'delta', count: 1 },
  { id: 'three', name: 'Gamma', tag: 'beta', count: 2 },
];

const sortOptions = {
  name: (item: Item) => item.name,
  count: (item: Item) => item.count,
};

describe('useListControls', () => {
  it('filters items using trimmed, case-insensitive search', () => {
    const { result } = renderHook(() =>
      useListControls({
        items,
        searchFields: [(item) => item.name, (item) => item.tag],
        sortOptions,
        defaultSortKey: 'name',
      }),
    );

    act(() => {
      result.current.setSearchTerm('  BETA  ');
    });

    expect(result.current.filteredItems.map((item) => item.name)).toEqual(['Beta', 'Gamma']);
  });

  it('toggles sort direction and resets on new key', () => {
    const { result } = renderHook(() =>
      useListControls({
        items,
        searchFields: [(item) => item.name],
        sortOptions,
        defaultSortKey: 'name',
      }),
    );

    expect(result.current.filteredItems.map((item) => item.name)).toEqual(['Alpha', 'Beta', 'Gamma']);

    act(() => {
      result.current.handleSort('name');
    });

    expect(result.current.sortDirection).toBe('desc');
    expect(result.current.filteredItems.map((item) => item.name)).toEqual(['Gamma', 'Beta', 'Alpha']);

    act(() => {
      result.current.handleSort('count');
    });

    expect(result.current.sortKey).toBe('count');
    expect(result.current.sortDirection).toBe('asc');
    expect(result.current.filteredItems.map((item) => item.count)).toEqual([1, 2, 3]);
  });

  it('recomputes filtered items when search fields change', () => {
    const initialSearchFields = [(item: Item) => item.name];
    const { result, rerender } = renderHook(
      ({ searchFields }) =>
        useListControls({
          items,
          searchFields,
          sortOptions,
          defaultSortKey: 'name',
        }),
      { initialProps: { searchFields: initialSearchFields } },
    );

    act(() => {
      result.current.setSearchTerm('delta');
    });

    expect(result.current.filteredItems).toHaveLength(0);

    rerender({ searchFields: [(item: Item) => item.tag] });

    expect(result.current.filteredItems.map((item) => item.id)).toEqual(['two']);
  });
});
