import { useMemo } from 'react';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CreateOrganizationDialog } from '@/components/CreateOrganizationDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { useUserContext } from '@/context/UserContext';
import { useCreateOrganization } from '@/hooks/useCreateOrganization';

export function OrganizationSwitcher() {
  const { organizations, contextMode, selectedOrganization, status, setContextMode } = useOrganizationContext();
  const { isClusterAdmin } = useUserContext();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    open: createOpen,
    handleOpenChange,
    organizationName,
    organizationNameError,
    handleNameChange,
    handleSubmit,
    isSubmitting,
  } = useCreateOrganization();

  const sortedOrganizations = useMemo(
    () => [...organizations].sort((a, b) => a.name.localeCompare(b.name)),
    [organizations],
  );

  const resolveOrganizationPath = (orgId: string) => {
    if (!location.pathname.startsWith('/organizations/')) {
      return `/organizations/${orgId}`;
    }

    const segments = location.pathname.split('/').slice(3);
    if (segments.length === 0) {
      return `/organizations/${orgId}`;
    }

    const [section, subSection, ...rest] = segments;
    if (section === 'agents' && subSection && subSection !== 'new') {
      return `/organizations/${orgId}/agents`;
    }
    if (section === 'apps' && subSection) {
      return `/organizations/${orgId}/apps`;
    }

    const suffix = [section, subSection, ...rest].filter(Boolean).join('/');
    return suffix ? `/organizations/${orgId}/${suffix}` : `/organizations/${orgId}`;
  };

  const resolveClusterPath = () => {
    if (location.pathname.startsWith('/organizations/')) {
      return '/organizations';
    }
    if (
      location.pathname === '/' ||
      location.pathname.startsWith('/users') ||
      location.pathname.startsWith('/apps') ||
      location.pathname.startsWith('/runners') ||
      location.pathname.startsWith('/organizations') ||
      location.pathname.startsWith('/settings') ||
      location.pathname.startsWith('/api-tokens')
    ) {
      return location.pathname;
    }
    return '/';
  };

  const handleSelect = (orgId: string) => {
    const org = sortedOrganizations.find((item) => item.id === orgId);
    if (!org) return;
    setContextMode({ mode: 'organization', organization: org });
    navigate(resolveOrganizationPath(org.id));
  };

  const handleSelectCluster = () => {
    setContextMode({ mode: 'cluster' });
    navigate(resolveClusterPath());
  };

  const triggerLabel = () => {
    if (status === 'loading') return 'Loading organizations';
    if (contextMode?.mode === 'cluster') return 'Cluster Administration';
    return selectedOrganization?.name ?? 'Select organization';
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={status === 'loading'}>
            {triggerLabel()}
            <ChevronDownIcon className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isClusterAdmin ? (
            <>
              <DropdownMenuItem
                onSelect={handleSelectCluster}
                disabled={contextMode?.mode === 'cluster'}
                data-testid="org-switcher-cluster"
              >
                Cluster Administration
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {sortedOrganizations.length === 0 ? (
            <DropdownMenuItem disabled>No organizations</DropdownMenuItem>
          ) : (
            sortedOrganizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                disabled={org.id === selectedOrganization?.id && contextMode?.mode === 'organization'}
                onSelect={() => handleSelect(org.id)}
              >
                {org.name}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => handleOpenChange(true)} data-testid="org-switcher-create">
            <PlusIcon className="mr-2 h-4 w-4" />
            Create organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={handleOpenChange}
        organizationName={organizationName}
        organizationNameError={organizationNameError}
        onOrganizationNameChange={handleNameChange}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        testIdPrefix="org-switcher-create"
      />
    </>
  );
}
