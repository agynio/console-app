import { useMemo } from 'react';
import { PlusIcon, ShieldIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { useOrganizationContext } from '@/context/OrganizationContext';

/**
 * Organization items, rendered inside the user menu. Creating an organization
 * is raised to the caller: this menu unmounts on select, so it cannot own the
 * dialog.
 */
export function OrganizationMenuItems({ onCreateOrganization }: { onCreateOrganization: () => void }) {
  const { organizations, selectedOrganization, setContextMode } = useOrganizationContext();
  const navigate = useNavigate();
  const location = useLocation();
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
    setContextMode({ mode: 'organization', organization: org });
    navigate(resolveOrganizationPath(org.id));
  };

  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Organization</DropdownMenuLabel>
      {/* Radio group, matching the chat and tracing menus: the current context
          is marked rather than greyed out. */}
      <DropdownMenuRadioGroup
        value={selectedOrganization?.id ?? ''}
        onValueChange={handleSelect}
        data-testid="org-switcher"
      >
        {sortedOrganizations.length === 0 ? (
          <DropdownMenuItem disabled>No organizations</DropdownMenuItem>
        ) : null}
        {sortedOrganizations.map((org) => (
          <DropdownMenuRadioItem
            key={org.id}
            value={org.id}
            className="data-[state=checked]:font-medium"
            data-testid={`org-item-${org.id}`}
          >
            <span className="truncate" title={org.name}>
              {org.name}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuItem onSelect={onCreateOrganization} data-testid="org-switcher-create">
        <PlusIcon className="mr-2 h-4 w-4" />
        Create organization
      </DropdownMenuItem>
    </>
  );
}

/**
 * Entry into the cluster administration context. Lives outside the
 * organization list: it is a mode, not an organization.
 */
export function ClusterAdministrationMenuItem() {
  const { contextMode, setContextMode } = useOrganizationContext();
  const navigate = useNavigate();
  const location = useLocation();

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

  const handleSelect = () => {
    setContextMode({ mode: 'cluster' });
    navigate(resolveClusterPath());
  };

  return (
    <DropdownMenuItem
      onSelect={handleSelect}
      className={contextMode?.mode === 'cluster' ? 'font-medium' : undefined}
      data-testid="org-switcher-cluster"
    >
      <ShieldIcon className="h-4 w-4" />
      Cluster Administration
    </DropdownMenuItem>
  );
}
