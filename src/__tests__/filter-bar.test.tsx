import { useState } from 'react';
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FilterBar } from '@/components/FilterBar';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';

const OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'terminated', label: 'Terminated' },
];

function Harness({ initial = [] as string[] }) {
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <FilterBar isActive={selected.length > 0} onClear={() => setSelected([])} testId="bar">
      <MultiSelectFilter
        label="State"
        options={OPTIONS}
        selectedValues={selected}
        onChange={setSelected}
        testId="state-filter"
      />
    </FilterBar>
  );
}

const originalResizeObserver = globalThis.ResizeObserver;

describe('FilterBar', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterAll(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows only the label while nothing is selected', () => {
    render(<Harness />);
    expect(screen.getByTestId('state-filter').textContent).toBe('State');
    expect(screen.getByTestId('state-filter').getAttribute('data-active')).toBeNull();
  });

  it('names the selection rather than counting it', () => {
    render(<Harness initial={['active']} />);
    const trigger = screen.getByTestId('state-filter');
    expect(trigger.textContent).toContain('State');
    expect(trigger.textContent).toContain('Active');
    expect(trigger.getAttribute('data-active')).toBe('true');
  });

  it('summarises extra selections as +N', () => {
    render(<Harness initial={['active', 'paused']} />);
    expect(screen.getByTestId('state-filter').textContent).toContain('+1');
  });

  // Picking several values is the point, so the menu must survive a selection.
  it('stays open across selections', async () => {
    render(<Harness />);
    // Radix opens on pointerdown, which jsdom does not synthesise from a click.
    fireEvent.keyDown(screen.getByTestId('state-filter'), { key: 'Enter' });

    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByText('Active'));
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(within(screen.getByRole('menu')).getByText('Paused'));
    expect(screen.getByTestId('state-filter').textContent).toContain('+1');
  });

  it('keeps the clear control inert until a filter is set, then resets', () => {
    render(<Harness initial={['active']} />);
    const clear = screen.getByTestId('bar-clear') as HTMLButtonElement;
    expect(clear.disabled).toBe(false);

    fireEvent.click(clear);
    expect(screen.getByTestId('state-filter').textContent).toBe('State');
    expect((screen.getByTestId('bar-clear') as HTMLButtonElement).disabled).toBe(true);
  });
});
