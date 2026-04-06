import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  ActivityIcon,
  BotIcon,
  BoxesIcon,
  BrainIcon,
  ChevronDownIcon,
  BuildingIcon,
  HardDriveIcon,
  HomeIcon,
  KeyIcon,
  SettingsIcon,
  ShieldIcon,
  ServerIcon,
  UsersIcon,
} from 'lucide-react';
import { Toaster } from 'sonner';
import { Button } from '@/components/Button';
import { CreateOrganizationDialog } from '@/components/CreateOrganizationDialog';
import { PendingInvitesMenu } from '@/components/PendingInvitesMenu';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { useUserContext } from '@/context/UserContext';
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher';
import { useCreateOrganization } from '@/hooks/useCreateOrganization';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
    isActive ? 'bg-[var(--agyn-bg-blue)] text-[var(--agyn-blue)]' : 'text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)]'
  }`;

type NoAccessScreenProps = {
  onSignOut: () => void;
  userMenu: ReactNode;
  pendingMembershipsCount: number;
};

function NoAccessScreen({ onSignOut, userMenu, pendingMembershipsCount }: NoAccessScreenProps) {
  const {
    open,
    handleOpenChange,
    organizationName,
    organizationNameError,
    handleNameChange,
    handleSubmit,
    isSubmitting,
  } = useCreateOrganization();

  return (
    <>
      <div className="flex min-h-screen flex-col bg-[var(--agyn-bg-light)]">
        <header className="flex items-center justify-end border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-4">
          {userMenu}
        </header>
        <div
          className="flex flex-1 items-center justify-center bg-[var(--agyn-bg-light)] px-6"
          data-testid="console-no-access"
        >
          <div className="max-w-lg rounded-xl border border-[var(--agyn-border-subtle)] bg-white p-8 text-center">
            <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">No organizations to manage</h1>
            <p className="mt-2 text-sm text-[var(--agyn-gray)]">
              {pendingMembershipsCount > 0
                ? 'You have pending organization invites. Use the menu above to accept or decline them.'
                : 'Your account does not have console access yet. Contact a cluster admin or organization owner to request access.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={() => handleOpenChange(true)}
                data-testid="console-create-organization-button"
              >
                Create organization
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onSignOut}
                data-testid="console-sign-out-button"
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </div>
      <CreateOrganizationDialog
        open={open}
        onOpenChange={handleOpenChange}
        organizationName={organizationName}
        organizationNameError={organizationNameError}
        onOrganizationNameChange={handleNameChange}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        testIdPrefix="console-create-organization"
      />
      <Toaster richColors position="top-right" />
    </>
  );
}

export function AppLayout() {
  const { selectedOrganization, hasConsoleAccess, pendingMembershipsCount, status: orgStatus } =
    useOrganizationContext();
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

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative" data-testid="user-menu-trigger">
          {currentUser?.name ?? 'Signed in'}
          <ChevronDownIcon className="ml-2 h-4 w-4" />
          {pendingMembershipsCount > 0 ? (
            <span
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--agyn-blue)] px-1 text-xs font-semibold text-white"
              data-testid="pending-invites-badge"
            >
              {pendingMembershipsCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="user-menu">
        <DropdownMenuLabel data-testid="user-menu-name">{currentUser?.name ?? 'Signed in'}</DropdownMenuLabel>
        <DropdownMenuLabel className="text-xs text-[var(--agyn-gray)]" data-testid="user-menu-email">
          {currentUser?.email ?? 'User profile'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled data-testid="user-menu-role">
          Cluster role: {isClusterAdmin ? 'admin' : 'none'}
        </DropdownMenuItem>
        <PendingInvitesMenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()} data-testid="user-menu-signout">
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (!hasConsoleAccess) {
    return (
      <NoAccessScreen
        onSignOut={signOut}
        userMenu={userMenu}
        pendingMembershipsCount={pendingMembershipsCount}
      />
    );
  }

  const origin = window.location.origin;
  const chatUrl = origin.replace('console.', 'chat.');
  const tracingUrl = origin.replace('console.', 'tracing.');

  return (
    <div className="flex min-h-screen bg-[var(--agyn-bg-light)]">
      <aside
        className="flex w-64 flex-col border-r border-[var(--agyn-border-subtle)] bg-white px-4 py-6"
        data-testid="console-sidebar"
      >
        {isClusterAdmin ? (
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Platform</p>
            <nav className="mt-3 flex flex-col gap-1">
              <NavLink to="/" className={navLinkClass} data-testid="nav-dashboard">
                <HomeIcon className="h-4 w-4" />
                Dashboard
              </NavLink>
              <NavLink to="/users" className={navLinkClass} data-testid="nav-users">
                <UsersIcon className="h-4 w-4" />
                Users
              </NavLink>
              <NavLink to="/apps" className={navLinkClass} data-testid="nav-apps">
                <BoxesIcon className="h-4 w-4" />
                Apps
              </NavLink>
              <NavLink to="/runners" className={navLinkClass} data-testid="nav-cluster-runners">
                <ServerIcon className="h-4 w-4" />
                Cluster Runners
              </NavLink>
              <NavLink to="/organizations" className={navLinkClass} data-testid="nav-organizations">
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
              data-testid="nav-organization-overview"
            >
              <BuildingIcon className="h-4 w-4" />
              Overview
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/members` : '/organizations'}
              className={navLinkClass}
              data-testid="nav-organization-members"
            >
              <UsersIcon className="h-4 w-4" />
              Members
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/agents` : '/organizations'}
              className={navLinkClass}
              data-testid="nav-organization-agents"
            >
              <BotIcon className="h-4 w-4" />
              Agents
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/volumes` : '/organizations'}
              className={navLinkClass}
              data-testid="nav-organization-volumes"
            >
              <HardDriveIcon className="h-4 w-4" />
              Volumes
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/llm-providers` : '/organizations'}
              className={navLinkClass}
              data-testid="nav-organization-llm-providers"
            >
              <BrainIcon className="h-4 w-4" />
              LLM Providers
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/models` : '/organizations'}
              className={navLinkClass}
              data-testid="nav-organization-models"
            >
              <BoxesIcon className="h-4 w-4" />
              Models
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/secrets` : '/organizations'}
              className={navLinkClass}
              data-testid="nav-organization-secrets"
            >
              <ShieldIcon className="h-4 w-4" />
              Secrets
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/runners` : '/organizations'}
              className={navLinkClass}
              data-testid="nav-organization-runners"
            >
              <ServerIcon className="h-4 w-4" />
              Runners
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/apps` : '/organizations'}
              className={navLinkClass}
              data-testid="nav-organization-apps"
            >
              <BoxesIcon className="h-4 w-4" />
              Apps
            </NavLink>
            <NavLink
              to={selectedOrganization ? `/organizations/${selectedOrganization.id}/monitoring` : '/organizations'}
              className={navLinkClass}
              data-testid="nav-organization-monitoring"
            >
              <ActivityIcon className="h-4 w-4" />
              Monitoring
            </NavLink>
          </nav>
        </div>
        <div className="mt-auto space-y-4">
          <NavLink to="/api-tokens" className={navLinkClass} data-testid="nav-api-tokens">
            <KeyIcon className="h-4 w-4" />
            API Tokens
          </NavLink>
          <NavLink to="/settings" className={navLinkClass} data-testid="nav-settings">
            <SettingsIcon className="h-4 w-4" />
            Settings
          </NavLink>
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
            {userMenu}
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
