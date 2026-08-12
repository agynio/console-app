import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import type { OrganizationSummary } from '@/context/OrganizationContext';
import type { useOrganizationContext } from '@/context/OrganizationContext';
import type { useUserContext } from '@/context/UserContext';
import { OrganizationSchema } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { RequireClusterAdmin, RequireOrganization } from '@/components/RouteGuards';

type UserContextValue = ReturnType<typeof useUserContext>;
type OrganizationContextValue = ReturnType<typeof useOrganizationContext>;

let userContext: UserContextValue;
let orgContext: OrganizationContextValue;

const { getOrganization } = vi.hoisted(() => ({
  getOrganization: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  organizationsClient: {
    getOrganization,
  },
}));

vi.mock('@/context/UserContext', () => ({
  useUserContext: () => userContext,
}));

vi.mock('@/context/OrganizationContext', () => ({
  useOrganizationContext: () => orgContext,
}));

function renderAt(path: string, element: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/users" element={element} />
          <Route path="/organizations/:id" element={element} />
          <Route path="/organizations" element={<div>Org list</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

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

    getOrganization.mockReset();
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
    renderAt(
      '/organizations/org-2',
      <RequireOrganization>
        <div>Org detail</div>
      </RequireOrganization>,
    );

    expect(screen.getByText('Org list')).toBeTruthy();
    expect(getOrganization).not.toHaveBeenCalled();
  });

  it('adopts the deep-linked organization even from cluster context', async () => {
    const orgTwo: OrganizationSummary = {
      id: 'org-2',
      name: 'Org Two',
    };

    orgContext.contextMode = { mode: 'cluster' };
    orgContext.organizations = [orgTwo];

    renderAt(
      '/organizations/org-2',
      <RequireOrganization>
        <div>Org detail</div>
      </RequireOrganization>,
    );

    expect(screen.getByText('Org detail')).toBeTruthy();
    await waitFor(() => {
      expect(orgContext.setContextMode).toHaveBeenCalledWith({ mode: 'organization', organization: orgTwo });
    });
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

    renderAt(
      '/organizations/org-2',
      <RequireOrganization>
        <div>Org detail</div>
      </RequireOrganization>,
    );

    await waitFor(() => {
      expect(orgContext.setContextMode).toHaveBeenCalledWith({ mode: 'organization', organization: orgTwo });
    });
  });

  it('lets cluster admins open organizations they are not a member of', async () => {
    userContext.isClusterAdmin = true;
    orgContext.contextMode = { mode: 'cluster' };

    getOrganization.mockResolvedValue({
      organization: create(OrganizationSchema, { id: 'org-9', name: 'Other Org' }),
    });

    renderAt(
      '/organizations/org-9',
      <RequireOrganization>
        <div>Org detail</div>
      </RequireOrganization>,
    );

    await waitFor(() => {
      expect(screen.getByText('Org detail')).toBeTruthy();
    });
    expect(getOrganization).toHaveBeenCalledWith({ id: 'org-9' });
    await waitFor(() => {
      expect(orgContext.setContextMode).toHaveBeenCalledWith({
        mode: 'organization',
        organization: expect.objectContaining({ id: 'org-9', name: 'Other Org' }),
      });
    });
  });

  it('redirects non-admins away from organizations they are not a member of', () => {
    const orgOne: OrganizationSummary = {
      id: 'org-1',
      name: 'Org One',
    };
    orgContext.organizations = [orgOne];

    renderAt(
      '/organizations/org-9',
      <RequireOrganization>
        <div>Org detail</div>
      </RequireOrganization>,
    );

    expect(screen.getByText('Org list')).toBeTruthy();
    expect(getOrganization).not.toHaveBeenCalled();
  });
});
