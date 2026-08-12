import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { useOrganizationContext } from '@/context/OrganizationContext';
import { ClusterAdministrationMenuItem, OrganizationMenuItems } from '@/components/OrganizationSwitcher';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type OrganizationContextValue = ReturnType<typeof useOrganizationContext>;

let orgContext: OrganizationContextValue;

vi.mock('@/context/OrganizationContext', () => ({
  useOrganizationContext: () => orgContext,
}));

function renderMenu(children: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/organizations/org-1']}>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>{children}</DropdownMenuContent>
      </DropdownMenu>
    </MemoryRouter>,
  );
}

describe('organization switcher menu', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    const orgOne = { id: 'org-1', name: 'Org One' };
    orgContext = {
      organizations: [orgOne],
      memberships: [],
      pendingMemberships: [],
      pendingMembershipsCount: 0,
      contextMode: { mode: 'organization', organization: orgOne },
      selectedOrganization: orgOne,
      status: 'ready',
      error: null,
      hasConsoleAccess: true,
      setContextMode: vi.fn(),
      setSelectedOrganization: vi.fn(),
    };
  });

  it('lists organizations without a cluster administration entry', () => {
    renderMenu(<OrganizationMenuItems onCreateOrganization={() => {}} />);

    expect(screen.getByTestId('org-item-org-1')).toBeTruthy();
    expect(screen.queryByTestId('org-switcher-cluster')).toBeNull();
  });

  it('shows no organizations placeholder when the member list is empty', () => {
    orgContext.organizations = [];
    orgContext.selectedOrganization = null;
    orgContext.contextMode = { mode: 'cluster' };

    renderMenu(<OrganizationMenuItems onCreateOrganization={() => {}} />);

    expect(screen.getByText('No organizations')).toBeTruthy();
  });

  it('switches into cluster administration from its own menu item', () => {
    renderMenu(<ClusterAdministrationMenuItem />);

    fireEvent.click(screen.getByTestId('org-switcher-cluster'));

    expect(orgContext.setContextMode).toHaveBeenCalledWith({ mode: 'cluster' });
  });
});
