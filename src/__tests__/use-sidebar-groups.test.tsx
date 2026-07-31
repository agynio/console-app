import { beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useSidebarGroups } from '@/hooks/useSidebarGroups';

function Probe({ groupId }: { groupId: string }) {
  const { isCollapsed, toggleGroup } = useSidebarGroups();
  return (
    <button type="button" onClick={() => toggleGroup(groupId)} data-testid="toggle">
      {isCollapsed(groupId) ? 'collapsed' : 'expanded'}
    </button>
  );
}

describe('useSidebarGroups', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('starts expanded when nothing is stored', () => {
    render(<Probe groupId="operations" />);
    expect(screen.getByTestId('toggle').textContent).toBe('expanded');
  });

  it('persists a collapsed group', () => {
    render(<Probe groupId="operations" />);
    act(() => {
      screen.getByTestId('toggle').click();
    });

    expect(screen.getByTestId('toggle').textContent).toBe('collapsed');
    expect(JSON.parse(window.localStorage.getItem('console.sidebarGroups') ?? '{}')).toEqual({ operations: true });
  });

  it('restores the collapsed state on mount', () => {
    window.localStorage.setItem('console.sidebarGroups', JSON.stringify({ operations: true }));
    render(<Probe groupId="operations" />);
    expect(screen.getByTestId('toggle').textContent).toBe('collapsed');
  });

  it('keeps other groups expanded', () => {
    window.localStorage.setItem('console.sidebarGroups', JSON.stringify({ operations: true }));
    render(<Probe groupId="networking" />);
    expect(screen.getByTestId('toggle').textContent).toBe('expanded');
  });

  it('ignores malformed stored state', () => {
    window.localStorage.setItem('console.sidebarGroups', 'not json');
    render(<Probe groupId="operations" />);
    expect(screen.getByTestId('toggle').textContent).toBe('expanded');
  });
});
