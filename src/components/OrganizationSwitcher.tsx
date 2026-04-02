import { ChevronDownIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrganizationContext } from '@/context/OrganizationContext';

export function OrganizationSwitcher() {
  const { organizations, selectedOrganization, status, setSelectedOrganization } = useOrganizationContext();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSelect = (orgId: string) => {
    const org = organizations.find((item) => item.id === orgId);
    if (!org) return;
    setSelectedOrganization(org);
    if (location.pathname.startsWith('/organizations/')) {
      const rest = location.pathname.split('/').slice(3).join('/');
      const nextPath = rest ? `/organizations/${org.id}/${rest}` : `/organizations/${org.id}`;
      navigate(nextPath);
      return;
    }
    navigate(`/organizations/${org.id}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={status === 'loading'}>
          {status === 'loading' ? 'Loading organizations' : selectedOrganization?.name ?? 'Select organization'}
          <ChevronDownIcon className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {organizations.length === 0 ? (
          <DropdownMenuItem disabled>No organizations</DropdownMenuItem>
        ) : (
          organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              disabled={org.id === selectedOrganization?.id}
              onSelect={() => handleSelect(org.id)}
            >
              {org.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
