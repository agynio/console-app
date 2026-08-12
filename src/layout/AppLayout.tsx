import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronRightIcon,
  KeyIcon,
  LogOutIcon,
  MonitorSmartphoneIcon,
  SettingsIcon,
} from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { CreateOrganizationDialog } from '@/components/CreateOrganizationDialog';
import { ProductSwitcher } from '@/components/ProductSwitcher';
import { ThemeMenuItems } from '@/components/ThemeMenuItems';
import { PendingInvitesMenu } from '@/components/PendingInvitesMenu';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { useSetupOverlay } from '@/context/SetupOverlayContext';
import { useUserContext } from '@/context/UserContext';
import { ClusterAdministrationMenuItem, OrganizationMenuItems } from '@/components/OrganizationSwitcher';
import { useCreateOrganization } from '@/hooks/useCreateOrganization';
import { useSidebarGroups } from '@/hooks/useSidebarGroups';
import { usePageTitle } from '@/context/PageTitleContext';
import { SetupFinish } from '@/pages/setup/SetupFinish';
import { setupDestination, type SetupDestination } from '@/pages/setup/destination';
import { CLUSTER_NAV_GROUPS, ORGANIZATION_NAV_GROUPS, type NavGroup } from '@/layout/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function getInitials(name: string | null | undefined): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || 'U';
}

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

/**
 * The switcher in its ordinary place, plus the one state the setup wizard needs
 * from it. Its panel is portaled above everything, so on the wizard's dimmed
 * finish screen it is the only lit, interactive thing — anchored where the user
 * will look for it every day after this one.
 */
function SidebarProductSwitcher({ target }: { target: SetupDestination | null }) {
  return (
    <ProductSwitcher
      currentProductId="console"
      open={target ? true : undefined}
      highlightProductId={target?.productId}
      hrefOverrides={target ? { [target.productId]: target.href } : undefined}
    />
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
  const createOrganization = useCreateOrganization();
  const pageTitle = usePageTitle();
  const navigate = useNavigate();
  const location = useLocation();
  const { finish, setFinish } = useSetupOverlay();

  // The wizard is a flow, not a section: navigation away from it is the one
  // thing it does not want to offer while it is running.
  const inSetup = location.pathname.endsWith('/setup');
  const target = finish ? setupDestination(finish.state, finish.organizationId) : null;

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

  const userInitials = getInitials(currentUser?.name ?? currentUser?.email);

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
          data-testid="user-menu-trigger"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {userInitials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-foreground">
              {currentUser?.email ?? currentUser?.name ?? 'Signed in'}
            </p>
            <p className="truncate text-xs text-muted-foreground" data-testid="user-menu-org">
              {selectedOrganization?.name ?? (contextMode?.mode === 'cluster' ? 'Cluster Administration' : 'No organization')}
            </p>
          </div>
          <ChevronsUpDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {pendingMembershipsCount > 0 ? (
            <span
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground"
              data-testid="pending-invites-badge"
            >
              {pendingMembershipsCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" data-testid="user-menu">
        {/* The trigger already shows who is signed in and where. */}
        <OrganizationMenuItems onCreateOrganization={() => createOrganization.handleOpenChange(true)} />
        {isClusterAdmin ? (
          <>
            <DropdownMenuSeparator />
            <ClusterAdministrationMenuItem />
          </>
        ) : null}
        {/* PendingInvitesMenu renders nothing without invites, so its divider
            travels with it rather than stacking on the next one. */}
        {pendingMembershipsCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <PendingInvitesMenu />
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/devices')} data-testid="user-menu-devices">
          <MonitorSmartphoneIcon className="h-4 w-4" />
          Devices
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/api-tokens')} data-testid="user-menu-api-tokens">
          <KeyIcon className="h-4 w-4" />
          API Tokens
        </DropdownMenuItem>
        <ThemeMenuItems />
        <DropdownMenuItem onSelect={() => navigate('/settings')} data-testid="user-menu-settings">
          <SettingsIcon className="h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut()} data-testid="user-menu-signout">
          <LogOutIcon className="h-4 w-4" />
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
      {inSetup ? null : (
        <aside
          className="sticky top-0 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
          data-testid="console-sidebar"
        >
          {/* Pinned: only the navigation below it scrolls. */}
          <div className="shrink-0 px-4 py-4">
            <SidebarProductSwitcher target={target} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            {isClusterContext ? <SidebarNav groups={CLUSTER_NAV_GROUPS} basePath="" /> : null}
            {isOrganizationContext ? (
              <SidebarNav groups={ORGANIZATION_NAV_GROUPS} basePath={organizationBase} />
            ) : null}
          </div>
        </aside>
      )}
      <main className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          {/* The wizard hides the sidebar, which is where the switcher normally
              lives. It takes the title's place rather than going missing: every
              app on this platform is reached from it, including on the screen
              the flow ends on. */}
          {inSetup ? (
            <SidebarProductSwitcher target={target} />
          ) : (
            <h1 className="text-lg font-semibold text-foreground" data-testid="page-title">
              {pageTitle}
            </h1>
          )}
          <div className="flex items-center gap-3">{userMenu}</div>
        </header>
        <div className="flex-1 p-6">
          <Outlet />
        </div>
      </main>
      <CreateOrganizationDialog
        open={createOrganization.open}
        onOpenChange={createOrganization.handleOpenChange}
        organizationName={createOrganization.organizationName}
        organizationNameError={createOrganization.organizationNameError}
        onOrganizationNameChange={createOrganization.handleNameChange}
        onSubmit={createOrganization.handleSubmit}
        isSubmitting={createOrganization.isSubmitting}
        testIdPrefix="org-switcher-create"
      />
      {/* Rendered here rather than by the wizard: by the time it shows, the
          wizard is gone and the ordinary Console is what gets dimmed. */}
      {finish ? (
        <SetupFinish state={finish.state} target={target} onDismiss={() => setFinish(null)} />
      ) : null}
      <Toaster richColors position="top-right" />
    </div>
  );
}
