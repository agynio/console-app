import { NavLink } from 'react-router-dom';
import { BuildingIcon, PlusIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CreateOrganizationDialog } from '@/components/CreateOrganizationDialog';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { useUserContext } from '@/context/UserContext';
import type { MembershipRole } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { useCreateOrganization } from '@/hooks/useCreateOrganization';
import { formatDateOnly, formatMembershipRole } from '@/lib/format';

function describeRole(role?: MembershipRole, isClusterAdmin?: boolean): string {
  if (!role) return isClusterAdmin ? 'Admin' : '—';
  return formatMembershipRole(role);
}

export function OrganizationsListPage() {
  const { organizations, status, error } = useOrganizationContext();
  const { isClusterAdmin } = useUserContext();
  const {
    open: createOpen,
    handleOpenChange,
    organizationName,
    organizationNameError,
    handleNameChange,
    handleSubmit,
    isSubmitting,
  } = useCreateOrganization();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground" data-testid="organizations-heading">
            Organizations
          </h2>
          <p className="text-sm text-muted-foreground">Manage organizations across the platform.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="organizations-create-button"
          onClick={() => handleOpenChange(true)}
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Create organization
        </Button>
      </div>

      {status === 'loading' && (
        <div className="text-sm text-muted-foreground">Loading organizations...</div>
      )}
      {status === 'error' && (
        <div className="text-sm text-muted-foreground">{error?.message ?? 'Failed to load organizations.'}</div>
      )}

      {status === 'ready' && organizations.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No organizations available yet.
          </CardContent>
        </Card>
      ) : null}

      {status === 'ready' && organizations.length > 0 ? (
        <Card className="border-border" data-testid="organizations-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_120px]"
              data-testid="organizations-header"
            >
              <span>Organization</span>
              <span>Role</span>
              <span>Created</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-border">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_120px]"
                  data-testid="organizations-row"
                >
                  <div className="flex items-center gap-2">
                    <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium" data-testid="organizations-name">
                      {org.name}
                    </span>
                  </div>
                  <Badge variant="secondary">{describeRole(org.membershipRole, isClusterAdmin)}</Badge>
                  <span className="text-muted-foreground">{formatDateOnly(org.createdAt)}</span>
                  <div className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <NavLink to={`/organizations/${org.id}`} data-testid="organizations-view">
                        View
                      </NavLink>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={handleOpenChange}
        organizationName={organizationName}
        organizationNameError={organizationNameError}
        onOrganizationNameChange={handleNameChange}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        testIdPrefix="create-organization"
      />
    </div>
  );
}
