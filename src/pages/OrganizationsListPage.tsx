import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BuildingIcon, PlusIcon } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationsClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/Input';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { useUserContext } from '@/context/UserContext';
import type { MembershipRole } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { formatDateOnly, formatMembershipRole } from '@/lib/format';
import { toast } from 'sonner';

function describeRole(role?: MembershipRole, isClusterAdmin?: boolean): string {
  if (!role) return isClusterAdmin ? 'Admin' : '—';
  return formatMembershipRole(role);
}

export function OrganizationsListPage() {
  const { organizations, status, error } = useOrganizationContext();
  const { isClusterAdmin } = useUserContext();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgNameError, setOrgNameError] = useState('');

  const createOrganizationMutation = useMutation({
    mutationFn: (payload: { name: string }) => organizationsClient.createOrganization(payload),
    onSuccess: () => {
      toast.success('Organization created.');
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'accessible'] });
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'memberships'] });
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'list'] });
      setCreateOpen(false);
      setOrgName('');
      setOrgNameError('');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create organization.');
    },
  });

  const handleCreateOrganization = () => {
    const trimmedName = orgName.trim();
    if (!trimmedName) {
      setOrgNameError('Organization name is required.');
      return;
    }
    setOrgNameError('');
    createOrganizationMutation.mutate({ name: trimmedName });
  };

  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setOrgName('');
      setOrgNameError('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]" data-testid="organizations-heading">
            Organizations
          </h2>
          <p className="text-sm text-[var(--agyn-gray)]">Manage organizations across the platform.</p>
        </div>
        {isClusterAdmin ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="organizations-create-button"
            onClick={() => handleCreateOpenChange(true)}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            Create organization
          </Button>
        ) : null}
      </div>

      {status === 'loading' && (
        <div className="text-sm text-[var(--agyn-gray)]">Loading organizations...</div>
      )}
      {status === 'error' && (
        <div className="text-sm text-[var(--agyn-gray)]">{error?.message ?? 'Failed to load organizations.'}</div>
      )}

      {status === 'ready' && organizations.length === 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No organizations available yet.
          </CardContent>
        </Card>
      ) : null}

      {status === 'ready' && organizations.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="organizations-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[2fr_1fr_1fr_120px]"
              data-testid="organizations-header"
            >
              <span>Organization</span>
              <span>Role</span>
              <span>Created</span>
              <span className="text-right">Action</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[2fr_1fr_1fr_120px]"
                  data-testid="organizations-row"
                >
                  <div className="flex items-center gap-2">
                    <BuildingIcon className="h-4 w-4 text-[var(--agyn-gray)]" />
                    <span className="font-medium" data-testid="organizations-name">
                      {org.name}
                    </span>
                  </div>
                  <Badge variant="secondary">{describeRole(org.membershipRole, isClusterAdmin)}</Badge>
                  <span className="text-[var(--agyn-gray)]">{formatDateOnly(org.createdAt)}</span>
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
      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent data-testid="organizations-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="organizations-create-title">Create organization</DialogTitle>
            <DialogDescription data-testid="organizations-create-description">
              Set the organization name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Organization Name"
              placeholder="Acme AI"
              value={orgName}
              onChange={(event) => {
                setOrgName(event.target.value);
                if (orgNameError) setOrgNameError('');
              }}
              error={orgNameError}
              data-testid="organizations-create-name"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="organizations-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateOrganization}
              disabled={createOrganizationMutation.isPending}
              data-testid="organizations-create-submit"
            >
              {createOrganizationMutation.isPending ? 'Creating...' : 'Create organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
