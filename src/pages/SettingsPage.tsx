import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersClient } from '@/api/client';
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
import { useUserContext } from '@/context/UserContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { toast } from 'sonner';

export function SettingsPage() {
  useDocumentTitle('Settings');

  const { currentUser, isClusterAdmin, signOut } = useUserContext();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');

  const updateProfileMutation = useMutation({
    mutationFn: (payload: { identityId: string; name: string; email: string; nickname: string; photoUrl: string }) =>
      usersClient.updateUser({
        identityId: payload.identityId,
        name: payload.name,
        email: payload.email,
        nickname: payload.nickname,
        photoUrl: payload.photoUrl,
      }),
    onSuccess: () => {
      toast.success('Profile updated.');
      void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      void queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
      if (currentUser?.id) {
        void queryClient.invalidateQueries({ queryKey: ['users', currentUser.id] });
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
      setEmail(currentUser?.email ?? '');
      setNickname(currentUser?.nickname ?? '');
      setPhotoUrl(currentUser?.photoUrl ?? '');
      setNameError('');
      setEmailError('');
    } else {
      setName('');
      setEmail('');
      setNickname('');
      setPhotoUrl('');
      setNameError('');
      setEmailError('');
    }
  };

  const handleSaveProfile = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    let hasError = false;

    if (!trimmedName) {
      setNameError('Name is required.');
      hasError = true;
    } else if (nameError) {
      setNameError('');
    }

    if (!trimmedEmail) {
      setEmailError('Email is required.');
      hasError = true;
    } else if (emailError) {
      setEmailError('');
    }

    if (hasError) return;
    if (!currentUser?.id) {
      toast.error('Missing user profile.');
      return;
    }

    updateProfileMutation.mutate({
      identityId: currentUser.id,
      name: trimmedName,
      email: trimmedEmail,
      nickname: nickname.trim(),
      photoUrl: photoUrl.trim(),
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
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Email</div>
              <div className="text-sm text-foreground">{currentUser?.email ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Nickname</div>
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
              Update your console profile details.
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
              <Label htmlFor="settings-profile-edit-email">Email</Label>
              <Input
                id="settings-profile-edit-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError('');
                }}
                data-testid="settings-profile-edit-email"
              />
              {emailError ? (
                <p className="text-sm text-destructive" data-testid="settings-profile-edit-email-error">
                  {emailError}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-profile-edit-nickname">Nickname</Label>
              <Input
                id="settings-profile-edit-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                data-testid="settings-profile-edit-nickname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-profile-edit-photo-url">Photo URL</Label>
              <Input
                id="settings-profile-edit-photo-url"
                placeholder="https://..."
                value={photoUrl}
                onChange={(event) => setPhotoUrl(event.target.value)}
                data-testid="settings-profile-edit-photo-url"
              />
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
