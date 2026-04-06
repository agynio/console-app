import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { organizationsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useOrganizationContext } from '@/context/OrganizationContext';
import type { Membership } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { formatMembershipRole } from '@/lib/format';
import { toast } from 'sonner';

type MembershipAction = {
  membershipId: string;
  organizationId: string;
};

export function PendingInvitesMenu() {
  const { pendingMemberships } = useOrganizationContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const acceptMutation = useMutation({
    mutationFn: ({ membershipId }: MembershipAction) => organizationsClient.acceptMembership({ membershipId }),
    onSuccess: (_, variables) => {
      toast.success('Invite accepted.');
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'accessible'] });
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'memberships'] });
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'pendingMemberships'] });
      navigate(`/organizations/${variables.organizationId}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to accept invite.');
    },
  });

  const declineMutation = useMutation({
    mutationFn: ({ membershipId }: { membershipId: string }) =>
      organizationsClient.declineMembership({ membershipId }),
    onSuccess: () => {
      toast.success('Invite declined.');
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'pendingMemberships'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to decline invite.');
    },
  });

  if (pendingMemberships.length === 0) return null;

  const handleAccept = (membership: Membership) => {
    acceptMutation.mutate({
      membershipId: membership.id,
      organizationId: membership.organizationId,
    });
  };

  const handleDecline = (membership: Membership) => {
    declineMutation.mutate({ membershipId: membership.id });
  };

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel data-testid="pending-invites-label">
        Pending invites ({pendingMemberships.length})
      </DropdownMenuLabel>
      <div className="space-y-2 px-2 pb-2">
        {pendingMemberships.map((membership) => (
          <div
            key={membership.id}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--agyn-border-subtle)] bg-[var(--agyn-secondary)] px-2 py-2 text-xs text-[var(--agyn-dark)]"
            data-testid="pending-invite-row"
          >
            <div className="space-y-1">
              <div className="font-medium text-[var(--agyn-dark)]" data-testid="pending-invite-org-id">
                {membership.organizationId}
              </div>
              <div className="text-[var(--agyn-gray)]" data-testid="pending-invite-role">
                {formatMembershipRole(membership.role)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAccept(membership)}
                disabled={acceptMutation.isPending || declineMutation.isPending}
                data-testid="pending-invite-accept"
              >
                Accept
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDecline(membership)}
                disabled={acceptMutation.isPending || declineMutation.isPending}
                data-testid="pending-invite-decline"
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
