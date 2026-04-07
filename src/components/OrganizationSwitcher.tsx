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
import { useCreateOrganization } from '@/hooks/useCreateOrganization';

export function OrganizationSwitcher() {
  const { organizations, selectedOrganization, status, setSelectedOrganization } = useOrganizationContext();
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

  const handleSelect = (orgId: string) => {
    const org = sortedOrganizations.find((item) => item.id === orgId);
    if (!org) return;
    setSelectedOrganization(org);
    navigate(resolveOrganizationPath(org.id));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={status === 'loading'}>
            {status === 'loading' ? 'Loading organizations' : selectedOrganization?.name ?? 'Select organization'}
            <ChevronDownIcon className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {sortedOrganizations.length === 0 ? (
            <DropdownMenuItem disabled>No organizations</DropdownMenuItem>
          ) : (
            sortedOrganizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                disabled={org.id === selectedOrganization?.id}
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
