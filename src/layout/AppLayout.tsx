import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  LineChartIcon,
  MonitorSmartphoneIcon,
  SettingsIcon,
  ShieldIcon,
  ServerIcon,
  UsersIcon,
} from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { CreateOrganizationDialog } from '@/components/CreateOrganizationDialog';
import { PendingInvitesMenu } from '@/components/PendingInvitesMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { useUserContext } from '@/context/UserContext';
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher';
import { useCreateOrganization } from '@/hooks/useCreateOrganization';
import { usePageTitle } from '@/context/PageTitleContext';
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
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground hover:bg-sidebar-accent'
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
      <div className="flex min-h-screen flex-col bg-muted/40">
        <header className="sticky top-0 z-10 flex items-center justify-end border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {userMenu}
          </div>
        </header>
        <div
          className="flex flex-1 items-center justify-center bg-muted/40 px-6"
          data-testid="console-no-access"
        >
          <div className="max-w-lg rounded-xl border border-border bg-card p-8 text-center">
            <h1 className="text-xl font-semibold text-foreground">No organizations to manage</h1>
            <p className="mt-2 text-sm text-muted-foreground">
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
  const {
    contextMode,
    selectedOrganization,
    hasConsoleAccess,
    pendingMembershipsCount,
    status: orgStatus,
    error: orgError,
  } = useOrganizationContext();
  const { currentUser, isClusterAdmin, status: userStatus, error: userError, signOut } = useUserContext();
  const pageTitle = usePageTitle();
  const navigate = useNavigate();

  if (userStatus === 'loading' || orgStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 text-sm text-muted-foreground">
        Loading console...
      </div>
    );
  }

  if (userStatus === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 text-sm text-muted-foreground">
        {userError?.message ?? 'Failed to load profile.'}
      </div>
    );
  }

  if (orgStatus === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 text-sm text-muted-foreground">
        {orgError?.message ?? 'Failed to load organizations.'}
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
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground"
              data-testid="pending-invites-badge"
            >
              {pendingMembershipsCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="user-menu">
        <DropdownMenuLabel data-testid="user-menu-name">{currentUser?.name ?? 'Signed in'}</DropdownMenuLabel>
        <DropdownMenuLabel className="text-xs text-muted-foreground" data-testid="user-menu-email">
          {currentUser?.email ?? 'User profile'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled data-testid="user-menu-role">
          Cluster role: {isClusterAdmin ? 'admin' : 'none'}
        </DropdownMenuItem>
        <PendingInvitesMenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/devices')} data-testid="user-menu-devices">
          <MonitorSmartphoneIcon className="h-4 w-4" />
          Devices
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/api-tokens')} data-testid="user-menu-api-tokens">
          <KeyIcon className="h-4 w-4" />
          API Tokens
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings')} data-testid="user-menu-settings">
          <SettingsIcon className="h-4 w-4" />
          Settings
        </DropdownMenuItem>
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

  const organizationBase = selectedOrganization ? `/organizations/${selectedOrganization.id}` : '/organizations';
  const organizationRoute = (path: string) => `${organizationBase}${path}`;

  const isClusterContext = contextMode?.mode === 'cluster';
  const isOrganizationContext = contextMode?.mode === 'organization' && selectedOrganization;

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside
        className="sticky top-0 flex h-screen w-64 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-6 text-sidebar-foreground"
        data-testid="console-sidebar"
      >
        {isClusterContext ? (
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Platform</p>
            <nav className="mt-3 flex flex-col gap-1">
              <NavLink to="/" end className={navLinkClass} data-testid="nav-dashboard">
                <HomeIcon className="h-4 w-4" />
                Dashboard
              </NavLink>
              <NavLink to="/users" className={navLinkClass} data-testid="nav-users">
                <UsersIcon className="h-4 w-4" />
                Users
              </NavLink>
              <NavLink to="/organizations" className={navLinkClass} data-testid="nav-organizations">
                <BuildingIcon className="h-4 w-4" />
                Organizations
              </NavLink>
              <NavLink to="/runners" className={navLinkClass} data-testid="nav-cluster-runners">
                <ServerIcon className="h-4 w-4" />
                Cluster Runners
              </NavLink>
              <NavLink to="/apps" className={navLinkClass} data-testid="nav-apps">
                <BoxesIcon className="h-4 w-4" />
                Apps
              </NavLink>
            </nav>
          </div>
        ) : null}
        {isOrganizationContext ? (
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Organization</p>
            <nav className="mt-3 flex flex-col gap-1">
              <NavLink
                to={organizationBase}
                end
                className={navLinkClass}
                data-testid="nav-organization-overview"
              >
                <BuildingIcon className="h-4 w-4" />
                Overview
              </NavLink>
              <NavLink
                to={organizationRoute('/agents')}
                className={navLinkClass}
                data-testid="nav-organization-agents"
              >
                <BotIcon className="h-4 w-4" />
                Agents
              </NavLink>
              <NavLink
                to={organizationRoute('/volumes')}
                className={navLinkClass}
                data-testid="nav-organization-volumes"
              >
                <HardDriveIcon className="h-4 w-4" />
                Volumes
              </NavLink>
              <NavLink
                to={organizationRoute('/llm-providers')}
                className={navLinkClass}
                data-testid="nav-organization-llm-providers"
              >
                <BrainIcon className="h-4 w-4" />
                LLM Providers
              </NavLink>
              <NavLink
                to={organizationRoute('/models')}
                className={navLinkClass}
                data-testid="nav-organization-models"
              >
                <BoxesIcon className="h-4 w-4" />
                Models
              </NavLink>
              <NavLink
                to={organizationRoute('/secret-providers')}
                className={navLinkClass}
                data-testid="nav-organization-secret-providers"
              >
                <KeyIcon className="h-4 w-4" />
                Secret Providers
              </NavLink>
              <NavLink
                to={organizationRoute('/secrets')}
                className={navLinkClass}
                data-testid="nav-organization-secrets"
              >
                <ShieldIcon className="h-4 w-4" />
                Secrets
              </NavLink>
              <NavLink
                to={organizationRoute('/image-pull-secrets')}
                className={navLinkClass}
                data-testid="nav-organization-image-pull-secrets"
              >
                <KeyIcon className="h-4 w-4" />
                Image Pull Secrets
              </NavLink>
              <NavLink
                to={organizationRoute('/runners')}
                className={navLinkClass}
                data-testid="nav-organization-runners"
              >
                <ServerIcon className="h-4 w-4" />
                Runners
              </NavLink>
              <NavLink
                to={organizationRoute('/apps')}
                className={navLinkClass}
                data-testid="nav-organization-apps"
              >
                <BoxesIcon className="h-4 w-4" />
                Apps
              </NavLink>
              <NavLink
                to={organizationRoute('/members')}
                className={navLinkClass}
                data-testid="nav-organization-members"
              >
                <UsersIcon className="h-4 w-4" />
                Members
              </NavLink>
              <NavLink
                to={organizationRoute('/monitoring')}
                className={navLinkClass}
                data-testid="nav-organization-monitoring"
              >
                <ActivityIcon className="h-4 w-4" />
                Monitoring
              </NavLink>
              <NavLink
                to={organizationRoute('/usage')}
                className={navLinkClass}
                data-testid="nav-organization-usage"
              >
                <LineChartIcon className="h-4 w-4" />
                Usage
              </NavLink>
            </nav>
          </div>
        ) : null}
      </aside>
      <main className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <h1 className="text-lg font-semibold text-foreground" data-testid="page-title">
            {pageTitle}
          </h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />
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
