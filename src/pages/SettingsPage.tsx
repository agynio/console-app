import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationsClient, usersClient } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useOrganizationContext } from '@/context/OrganizationContext';
import { useUserContext } from '@/context/UserContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toast } from 'sonner';

export function SettingsPage() {
  useDocumentTitle('Settings');

  const { currentUser, isClusterAdmin, signOut } = useUserContext();
  const { selectedOrganization } = useOrganizationContext();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [nameError, setNameError] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const nicknameLabel = selectedOrganization ? `Nickname (${selectedOrganization.name})` : 'Nickname';

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      username: string;
      nickname: string;
      organizationId: string | null;
    }) => {
      await usersClient.updateMe({ name: payload.name, username: payload.username });
      let nicknameError: Error | null = null;
      if (payload.organizationId) {
        try {
          await organizationsClient.setMyOrgNickname({
            organizationId: payload.organizationId,
            nickname: payload.nickname,
          });
        } catch (error) {
          nicknameError =
            error instanceof Error ? error : new Error('Failed to update nickname.');
        }
      }
      return { nicknameError };
    },
    onSuccess: ({ nicknameError }) => {
      void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['users', 'batch'] });
      if (currentUser?.id) {
        void queryClient.invalidateQueries({ queryKey: ['users', currentUser.id] });
      }
      if (selectedOrganization?.id) {
        void queryClient.invalidateQueries({
          queryKey: ['organizations', selectedOrganization.id, 'members'],
        });
      }
      if (nicknameError) {
        toast.success('Profile updated.');
        toast.error(`Nickname update failed: ${nicknameError.message}`);
      } else {
        toast.success('Profile updated.');
      }
      setEditOpen(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile.');
    },
  });

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (open) {
      setName(currentUser?.name ?? '');
      setUsername(currentUser?.username ?? '');
      setNickname(currentUser?.nickname ?? '');
      setNameError('');
      setUsernameError('');
    } else {
      setName('');
      setUsername('');
      setNickname('');
      setNameError('');
      setUsernameError('');
    }
  };

  const handleSaveProfile = () => {
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    const trimmedNickname = nickname.trim();
    let hasError = false;

    if (!trimmedName) {
      setNameError('Name is required.');
      hasError = true;
    } else if (nameError) {
      setNameError('');
    }

    if (!trimmedUsername) {
      setUsernameError('Username is required.');
      hasError = true;
    } else if (usernameError) {
      setUsernameError('');
    }

    if (hasError) return;
    if (!currentUser) {
      toast.error('Missing user profile.');
      return;
    }

    updateProfileMutation.mutate({
      name: trimmedName,
      username: trimmedUsername,
      nickname: trimmedNickname,
      organizationId: selectedOrganization?.id ?? null,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-border" data-testid="settings-profile-card">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Profile</h3>
              <p className="text-sm text-muted-foreground">Your console profile details.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEditOpenChange(true)}
              disabled={!currentUser}
              data-testid="settings-profile-edit"
            >
              Edit profile
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Name</div>
              <div className="text-sm text-foreground">{currentUser?.name ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Username</div>
              <div className="text-sm text-foreground">{currentUser?.username ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Email</div>
              <div className="text-sm text-foreground">{currentUser?.email ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{nicknameLabel}</div>
              <div className="text-sm text-foreground">{currentUser?.nickname ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Photo URL</div>
              <div className="text-sm text-foreground" data-testid="settings-profile-photo-url">
                {currentUser?.photoUrl ?? '—'}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">OIDC Subject</div>
              <div className="text-sm text-foreground">{currentUser?.oidcSubject ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Cluster role</div>
              <Badge variant={isClusterAdmin ? 'default' : 'outline'}>
                {isClusterAdmin ? 'Admin' : 'None'}
              </Badge>
            </div>
          </div>
          <div>
            <Button variant="outline" onClick={signOut} data-testid="settings-signout">
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="settings-profile-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="settings-profile-edit-title">Edit profile</DialogTitle>
            <DialogDescription data-testid="settings-profile-edit-description">
              Update your name, username, and organization nickname.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-profile-edit-name">Name</Label>
              <Input
                id="settings-profile-edit-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError('');
                }}
                data-testid="settings-profile-edit-name"
              />
              {nameError ? (
                <p className="text-sm text-destructive" data-testid="settings-profile-edit-name-error">
                  {nameError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-profile-edit-username">Username</Label>
              <Input
                id="settings-profile-edit-username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (usernameError) setUsernameError('');
                }}
                data-testid="settings-profile-edit-username"
              />
              {usernameError ? (
                <p className="text-sm text-destructive" data-testid="settings-profile-edit-username-error">
                  {usernameError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-profile-edit-nickname">{nicknameLabel}</Label>
              <Input
                id="settings-profile-edit-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                disabled={!selectedOrganization}
                data-testid="settings-profile-edit-nickname"
              />
              {!selectedOrganization ? (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="settings-profile-edit-nickname-help"
                >
                  Select an organization to edit your nickname.
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="settings-profile-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleSaveProfile}
              disabled={updateProfileMutation.isPending}
              data-testid="settings-profile-edit-submit"
            >
              {updateProfileMutation.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
