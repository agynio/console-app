import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { OrganizationSummary } from '@/context/OrganizationContext';
import type { useOrganizationContext } from '@/context/OrganizationContext';
import type { useUserContext } from '@/context/UserContext';
import { RequireClusterAdmin, RequireOrganization } from '@/components/RouteGuards';

type UserContextValue = ReturnType<typeof useUserContext>;
type OrganizationContextValue = ReturnType<typeof useOrganizationContext>;

let userContext: UserContextValue;
let orgContext: OrganizationContextValue;

vi.mock('@/context/UserContext', () => ({
  useUserContext: () => userContext,
}));

vi.mock('@/context/OrganizationContext', () => ({
  useOrganizationContext: () => orgContext,
}));

describe('route guards', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    userContext = {
      currentUser: null,
      clusterRole: null,
      identityId: null,
      isClusterAdmin: false,
      status: 'ready',
      error: null,
      signOut: vi.fn(),
    };

    orgContext = {
      organizations: [],
      memberships: [],
      contextMode: null,
      selectedOrganization: null,
      status: 'ready',
      error: null,
      hasConsoleAccess: true,
      setContextMode: vi.fn(),
      setSelectedOrganization: vi.fn(),
    };
  });

  it('redirects non-admin users away from admin routes', () => {
    const selectedOrganization: OrganizationSummary = {
      id: 'org-1',
      name: 'Org One',
    };
    orgContext.contextMode = { mode: 'organization', organization: selectedOrganization };
    orgContext.selectedOrganization = selectedOrganization;
    orgContext.organizations = [selectedOrganization];

    render(
      <MemoryRouter initialEntries={['/users']}>
        <Routes>
          <Route
            path="/users"
            element={
              <RequireClusterAdmin>
                <div>Admin content</div>
              </RequireClusterAdmin>
            }
          />
          <Route path="/organizations/:id" element={<div>Org detail</div>} />
          <Route path="/organizations" element={<div>Org list</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Org detail')).toBeTruthy();
  });

  it('allows cluster admins to access admin routes', () => {
    userContext.isClusterAdmin = true;

    render(
      <MemoryRouter initialEntries={['/users']}>
        <Routes>
          <Route
            path="/users"
            element={
              <RequireClusterAdmin>
                <div>Admin content</div>
              </RequireClusterAdmin>
            }
          />
          <Route path="/organizations" element={<div>Org list</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Admin content')).toBeTruthy();
  });

  it('redirects when no organization is selected', () => {
    render(
      <MemoryRouter initialEntries={['/organizations/org-2']}>
        <Routes>
          <Route
            path="/organizations/:id"
            element={
              <RequireOrganization>
                <div>Org detail</div>
              </RequireOrganization>
            }
          />
          <Route path="/organizations" element={<div>Org list</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Org list')).toBeTruthy();
  });

  it('does not override cluster context on organization routes', () => {
    const orgTwo: OrganizationSummary = {
      id: 'org-2',
      name: 'Org Two',
    };

    orgContext.contextMode = { mode: 'cluster' };
    orgContext.organizations = [orgTwo];

    render(
      <MemoryRouter initialEntries={['/organizations/org-2']}>
        <Routes>
          <Route
            path="/organizations/:id"
            element={
              <RequireOrganization>
                <div>Org detail</div>
              </RequireOrganization>
            }
          />
          <Route path="/organizations" element={<div>Org list</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Org detail')).toBeTruthy();
    expect(orgContext.setContextMode).not.toHaveBeenCalled();
  });

  it('syncs context with deep-linked organization routes', async () => {
    const orgOne: OrganizationSummary = {
      id: 'org-1',
      name: 'Org One',
    };
    const orgTwo: OrganizationSummary = {
      id: 'org-2',
      name: 'Org Two',
    };

    orgContext.contextMode = { mode: 'organization', organization: orgOne };
    orgContext.selectedOrganization = orgOne;
    orgContext.organizations = [orgOne, orgTwo];

    render(
      <MemoryRouter initialEntries={['/organizations/org-2']}>
        <Routes>
          <Route
            path="/organizations/:id"
            element={
              <RequireOrganization>
                <div>Org detail</div>
              </RequireOrganization>
            }
          />
          <Route path="/organizations" element={<div>Org list</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(orgContext.setContextMode).toHaveBeenCalledWith({ mode: 'organization', organization: orgTwo });
    });
  });
});
