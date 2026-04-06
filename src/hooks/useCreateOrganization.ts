import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectError } from '@connectrpc/connect';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationsClient } from '@/api/client';
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
  const [open, setOpen] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationNameError, setOrganizationNameError] = useState('');

  const resetState = () => {
    setOrganizationName('');
    setOrganizationNameError('');
  };

  const createOrganizationMutation = useMutation({
    mutationFn: (payload: { name: string }) => organizationsClient.createOrganization(payload),
    onSuccess: (response) => {
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
      navigate(`/organizations/${organizationId}`);
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
