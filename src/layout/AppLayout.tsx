import type { ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  KeyIcon,
  MonitorSmartphoneIcon,
  SettingsIcon,
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
import { useSidebarGroups } from '@/hooks/useSidebarGroups';
import { usePageTitle } from '@/context/PageTitleContext';
import { CLUSTER_NAV_GROUPS, ORGANIZATION_NAV_GROUPS, type NavGroup } from '@/layout/navigation';
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

type SidebarNavProps = {
  groups: NavGroup[];
  /** Prefixed to every section path; sections carry only the suffix. */
  basePath: string;
};

function SidebarNav({ groups, basePath }: SidebarNavProps) {
  const { isCollapsed, toggleGroup } = useSidebarGroups();

  return (
    <div className="mb-6 space-y-4">
      {groups.map((group) => {
        const collapsed = isCollapsed(group.id);
        const ChevronIcon = collapsed ? ChevronRightIcon : ChevronDownIcon;

        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={!collapsed}
              className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-xs uppercase tracking-wide text-muted-foreground transition hover:text-sidebar-foreground"
              data-testid={group.testId}
            >
              <ChevronIcon className="h-3.5 w-3.5" />
              {group.label}
            </button>
            {collapsed ? null : (
              <nav className="mt-2 flex flex-col gap-1">
                {group.sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <NavLink
                      key={section.testId}
                      to={`${basePath}${section.path}`}
                      end={section.end}
                      className={navLinkClass}
                      data-testid={section.testId}
                    >
                      <Icon className="h-4 w-4" />
                      {section.label}
                    </NavLink>
                  );
                })}
              </nav>
            )}
          </div>
        );
      })}
    </div>
  );
}

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

  const isClusterContext = contextMode?.mode === 'cluster';
  const isOrganizationContext = contextMode?.mode === 'organization' && selectedOrganization;

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside
        className="sticky top-0 flex h-screen w-64 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-6 text-sidebar-foreground"
        data-testid="console-sidebar"
      >
        {isClusterContext ? <SidebarNav groups={CLUSTER_NAV_GROUPS} basePath="" /> : null}
        {isOrganizationContext ? <SidebarNav groups={ORGANIZATION_NAV_GROUPS} basePath={organizationBase} /> : null}
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
