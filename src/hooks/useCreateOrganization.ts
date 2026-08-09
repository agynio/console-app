import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectError } from '@connectrpc/connect';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationsClient } from '@/api/client';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { toast } from 'sonner';

type UseCreateOrganizationResult = {
  open: boolean;
  handleOpenChange: (open: boolean) => void;
  organizationName: string;
  organizationNameError: string;
  handleNameChange: (value: string) => void;
  handleSubmit: () => void;
  isSubmitting: boolean;
};

export function useCreateOrganization(): UseCreateOrganizationResult {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Read before the mutation runs: whether this is the user's first organization
  // is the whole test for starting setup, and it stops being true immediately.
  const { organizations } = useOrganizationContext();
  const [open, setOpen] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationNameError, setOrganizationNameError] = useState('');

  const resetState = () => {
    setOrganizationName('');
    setOrganizationNameError('');
  };

  const createOrganizationMutation = useMutation({
    mutationFn: (payload: { name: string }) =>
      organizationsClient
        .createOrganization({ name: payload.name })
        .then((response) => ({ response, wasFirst: organizations.length === 0 })),
    onSuccess: ({ response, wasFirst }) => {
      const organizationId = response.organization?.id;
      if (!organizationId) {
        throw new Error('createOrganization succeeded but returned no organization');
      }
      toast.success('Organization created.');
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'accessible'] });
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'memberships'] });
      void queryClient.invalidateQueries({ queryKey: ['organizations', 'list'] });
      setOpen(false);
      resetState();
      // A cluster admin creating ten organizations is not onboarding ten times,
      // and the second one teaches nothing the first did not. Elsewhere the
      // Overview offers setup instead.
      navigate(wasFirst ? `/organizations/${organizationId}/setup` : `/organizations/${organizationId}`);
    },
    onError: (error) => {
      if (error instanceof ConnectError) {
        toast.error(error.message);
        return;
      }
      toast.error('Failed to create organization.');
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const handleNameChange = (value: string) => {
    setOrganizationName(value);
    if (organizationNameError) {
      setOrganizationNameError('');
    }
  };

  const handleSubmit = () => {
    const trimmedName = organizationName.trim();
    if (!trimmedName) {
      setOrganizationNameError('Organization name is required.');
      return;
    }
    setOrganizationNameError('');
    createOrganizationMutation.mutate({ name: trimmedName });
  };

  return {
    open,
    handleOpenChange,
    organizationName,
    organizationNameError,
    handleNameChange,
    handleSubmit,
    isSubmitting: createOrganizationMutation.isPending,
  };
}
