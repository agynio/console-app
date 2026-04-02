import { NavLink, Outlet } from 'react-router-dom';
import { BuildingIcon, HomeIcon, SettingsIcon, ShieldIcon, ServerIcon, UsersIcon } from 'lucide-react';
import { Toaster } from 'sonner';
import { Button } from '@/components/Button';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { useUserContext } from '@/context/UserContext';
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
    isActive ? 'bg-[var(--agyn-bg-blue)] text-[var(--agyn-blue)]' : 'text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)]'
  }`;

export function AppLayout() {
  const { selectedOrganization, hasConsoleAccess, status: orgStatus } = useOrganizationContext();
  const { currentUser, isClusterAdmin, status: userStatus, error: userError, signOut } = useUserContext();

  if (userStatus === 'loading' || orgStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--agyn-bg-light)] text-sm text-[var(--agyn-gray)]">
        Loading console...
      </div>
    );
  }

  if (userStatus === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--agyn-bg-light)] text-sm text-[var(--agyn-gray)]">
        {userError?.message ?? 'Failed to load profile.'}
      </div>
    );
  }

  if (!hasConsoleAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--agyn-bg-light)] px-6">
        <div className="max-w-lg rounded-xl border border-[var(--agyn-border-subtle)] bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">No organizations to manage</h1>
          <p className="mt-2 text-sm text-[var(--agyn-gray)]">
            Your account does not have console access yet. Contact a cluster admin or organization owner to
            request access.
          </p>
          <Button className="mt-4" variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const chatUrl = typeof window !== 'undefined'
    ? window.location.origin.replace('console.', 'chat.')
    : 'https://chat.agyn.dev';
  const tracingUrl = typeof window !== 'undefined'
    ? window.location.origin.replace('console.', 'tracing.')
    : 'https://tracing.agyn.dev';

  return (
    <div className="flex min-h-screen bg-[var(--agyn-bg-light)]">
      <aside className="flex w-64 flex-col border-r border-[var(--agyn-border-subtle)] bg-white px-4 py-6">
        {isClusterAdmin ? (
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Platform</p>
            <nav className="mt-3 flex flex-col gap-1">
              <NavLink to="/" className={navLinkClass}>
                <HomeIcon className="h-4 w-4" />
                Dashboard
              </NavLink>
              <NavLink to="/users" className={navLinkClass}>
                <UsersIcon className="h-4 w-4" />
                Users
              </NavLink>
              <NavLink to="/runners" className={navLinkClass}>
                <ServerIcon className="h-4 w-4" />
                Cluster Runners
              </NavLink>
              <NavLink to="/organizations" className={navLinkClass}>
                <BuildingIcon className="h-4 w-4" />
                Organizations
              </NavLink>
            </nav>
          </div>
        ) : null}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Organization</p>
          <nav className="mt-3 flex flex-col gap-1">
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}` : '/organizations'}
              className={navLinkClass}
            >
              <BuildingIcon className="h-4 w-4" />
              Overview
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/members` : '/organizations'}
              className={navLinkClass}
            >
              <UsersIcon className="h-4 w-4" />
              Members
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/secrets` : '/organizations'}
              className={navLinkClass}
            >
              <ShieldIcon className="h-4 w-4" />
              Secrets
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/runners` : '/organizations'}
              className={navLinkClass}
            >
              <ServerIcon className="h-4 w-4" />
              Runners
            </NavLink>
          </nav>
        </div>
        <div className="mt-auto space-y-4">
          <NavLink to="/settings" className={navLinkClass}>
            <SettingsIcon className="h-4 w-4" />
            Settings
          </NavLink>
          <div className="rounded-lg border border-[var(--agyn-border-subtle)] p-3">
            <p className="text-sm font-medium text-[var(--agyn-dark)]">{currentUser?.name ?? 'Signed in'}</p>
            <p className="text-xs text-[var(--agyn-gray)]">{currentUser?.email ?? 'User profile'}</p>
            <p className="mt-2 text-xs text-[var(--agyn-gray)]">Cluster role: {isClusterAdmin ? 'admin' : 'none'}</p>
            <Button className="mt-3 w-full" variant="outline" size="sm" onClick={signOut}>
              Log out
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-[var(--agyn-dark)]">Agyn Console</h1>
            <p className="text-sm text-[var(--agyn-gray)]">Platform administration</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <a href={chatUrl} target="_blank" rel="noreferrer">
                Chat
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={tracingUrl} target="_blank" rel="noreferrer">
                Tracing
              </a>
            </Button>
            <OrganizationSwitcher />
          </div>
        </header>
        <div className="flex-1 p-6">
          <Outlet />
        </div>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
