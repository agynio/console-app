import { useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { organizationsClient, usersClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { LoadMoreButton } from '@/components/LoadMoreButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MembershipStatus } from '@/gen/agynio/api/organizations/v1/organizations_pb';
import { ClusterRole } from '@/gen/agynio/api/users/v1/users_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { formatClusterRole, formatMembershipRole } from '@/lib/format';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/lib/pagination';
import { useListControls } from '@/hooks/useListControls';
import { toast } from 'sonner';

export function UsersListPage() {
  useDocumentTitle('Users');

  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [oidcSubject, setOidcSubject] = useState('');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [clusterRole, setClusterRole] = useState<ClusterRole>(ClusterRole.UNSPECIFIED);
  const [oidcError, setOidcError] = useState('');

  const usersQuery = useInfiniteQuery({
    queryKey: ['users', 'list'],
    queryFn: ({ pageParam }) => usersClient.listUsers({ pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const organizationsQuery = useQuery({
    queryKey: ['organizations', 'list'],
    queryFn: () => organizationsClient.listOrganizations({ pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const organizations = useMemo(
    () => organizationsQuery.data?.organizations ?? [],
    [organizationsQuery.data?.organizations],
  );

  const membershipsQueries = useQueries({
    queries: organizations.map((org) => ({
      queryKey: ['organizations', org.id, 'members', 'users-list'],
      queryFn: () =>
        organizationsClient.listMembers({
          organizationId: org.id,
          status: MembershipStatus.ACTIVE,
          pageSize: MAX_PAGE_SIZE,
          pageToken: '',
        }),
      enabled: Boolean(org.id),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const membershipsQueriesRef = useRef(membershipsQueries);
  membershipsQueriesRef.current = membershipsQueries;

  const membershipsKey = membershipsQueries
    .flatMap((query) => query.data?.memberships ?? [])
    .map((membership) => membership.id || `${membership.organizationId}:${membership.identityId}`)
    .join('|');

  const memberships = useMemo(
    () => {
      void membershipsKey;
      return membershipsQueriesRef.current.flatMap((query) => query.data?.memberships ?? []);
    },
    [membershipsKey],
  );

  const orgNameMap = useMemo(
    () => new Map(organizations.map((org) => [org.id, org.name])),
    [organizations],
  );

  const orgsByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    memberships.forEach((membership) => {
      const orgName = orgNameMap.get(membership.organizationId) ?? membership.organizationId;
      const role = formatMembershipRole(membership.role);
      const entry = `${orgName} (${role})`;
      const current = map.get(membership.identityId) ?? [];
      map.set(membership.identityId, [...current, entry]);
    });
    return map;
  }, [memberships, orgNameMap]);

  const users = useMemo(
    () => usersQuery.data?.pages.flatMap((page) => page.users) ?? [],
    [usersQuery.data?.pages],
  );
  const identityIds = useMemo(() => {
    const ids = users.flatMap((user) => (user.meta?.id ? [user.meta.id] : []));
    return Array.from(new Set(ids));
  }, [users]);

  const clusterRoleQueries = useQueries({
    queries: identityIds.map((identityId) => ({
      queryKey: ['users', identityId, 'detail'],
      queryFn: () => usersClient.getUser({ identityId }),
      enabled: Boolean(identityId),
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    })),
  });

  const identityIndexMap = useMemo(
    () => new Map(identityIds.map((identityId, index) => [identityId, index])),
    [identityIds],
  );

  const clusterRoleMap = useMemo(() => {
    const map = new Map<string, ClusterRole>();
    identityIds.forEach((identityId, index) => {
      const role = clusterRoleQueries[index]?.data?.clusterRole;
      if (role !== undefined) {
        map.set(identityId, role);
      }
    });
    return map;
  }, [clusterRoleQueries, identityIds]);

  const getUserOrganizations = (identityId?: string) =>
    identityId ? (orgsByUser.get(identityId) ?? []).join(', ') : '';

  const getUserClusterRole = (identityId?: string) => {
    const roleValue = identityId ? clusterRoleMap.get(identityId) : undefined;
    return formatClusterRole(roleValue ?? ClusterRole.UNSPECIFIED);
  };

  const listControls = useListControls({
    items: users,
    searchFields: [
      (user) => user.name || '',
      (user) => user.email || '',
      (user) => user.meta?.id ?? '',
      (user) => getUserOrganizations(user.meta?.id),
      (user) => getUserClusterRole(user.meta?.id),
    ],
    sortOptions: {
      name: (user) => user.name || user.email || '',
      identityId: (user) => user.meta?.id ?? '',
      organizations: (user) => getUserOrganizations(user.meta?.id),
      clusterRole: (user) => getUserClusterRole(user.meta?.id),
    },
    defaultSortKey: 'name',
  });

  const visibleUsers = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  const createUserMutation = useMutation({
    mutationFn: (payload: {
      oidcSubject: string;
      name?: string;
      nickname?: string;
      photoUrl?: string;
      clusterRole: ClusterRole;
    }) => usersClient.createUser(payload),
    onSuccess: () => {
      toast.success('User created.');
      void queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
      setCreateOpen(false);
      setOidcSubject('');
      setName('');
      setNickname('');
      setPhotoUrl('');
      setClusterRole(ClusterRole.UNSPECIFIED);
      setOidcError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create user.');
    },
  });

  const handleCreateUser = () => {
    const trimmedOidc = oidcSubject.trim();
    if (!trimmedOidc) {
      setOidcError('OIDC subject is required.');
      return;
    }
    setOidcError('');
    createUserMutation.mutate({
      oidcSubject: trimmedOidc,
      clusterRole,
      name: name.trim() || undefined,
      nickname: nickname.trim() || undefined,
      photoUrl: photoUrl.trim() || undefined,
    });
  };

  const isMembershipsLoading = organizationsQuery.isPending || membershipsQueries.some((query) => query.isPending);
  const isMembershipsError = organizationsQuery.isError || membershipsQueries.some((query) => query.isError);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search users..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
        </div>
        <Button variant="outline" size="sm" data-testid="users-create-button" onClick={() => setCreateOpen(true)}>
          Create user
        </Button>
      </div>

      {usersQuery.isPending && <div className="text-sm text-muted-foreground">Loading users...</div>}
      {usersQuery.isError && <div className="text-sm text-muted-foreground">Failed to load users.</div>}
      {isMembershipsError && (
        <div className="text-sm text-muted-foreground">Failed to load organization memberships.</div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="users-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="users-create-title">Create user</DialogTitle>
            <DialogDescription data-testid="users-create-description">
              Add a new user by OIDC subject and profile details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="users-create-oidc">OIDC Subject</Label>
              <Input
                id="users-create-oidc"
                placeholder="auth0|abc123"
                value={oidcSubject}
                onChange={(event) => {
                  setOidcSubject(event.target.value);
                  if (oidcError) setOidcError('');
                }}
                data-testid="users-create-oidc"
              />
              {oidcError ? <p className="text-sm text-destructive">{oidcError}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="users-create-name">Name</Label>
              <Input
                id="users-create-name"
                placeholder="Jane Doe"
                value={name}
                onChange={(event) => setName(event.target.value)}
                data-testid="users-create-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="users-create-nickname">Nickname</Label>
              <Input
                id="users-create-nickname"
                placeholder="jane"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                data-testid="users-create-nickname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="users-create-photo-url">Photo URL</Label>
              <Input
                id="users-create-photo-url"
                placeholder="https://..."
                value={photoUrl}
                onChange={(event) => setPhotoUrl(event.target.value)}
                data-testid="users-create-photo-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="users-create-cluster-role">Cluster Role</Label>
              <Select
                value={clusterRole === ClusterRole.ADMIN ? 'admin' : 'none'}
                onValueChange={(value) =>
                  setClusterRole(value === 'admin' ? ClusterRole.ADMIN : ClusterRole.UNSPECIFIED)
                }
              >
                <SelectTrigger id="users-create-cluster-role" data-testid="users-create-cluster-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="users-create-cancel" disabled={createUserMutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              onClick={handleCreateUser}
              disabled={createUserMutation.isPending}
              data-testid="users-create-submit"
            >
              {createUserMutation.isPending ? 'Creating...' : 'Create user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border" data-testid="users-table">
        <CardContent className="px-0">
          <div
            className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1.5fr_2fr_1fr_120px]"
            data-testid="users-header"
          >
            <SortableHeader
              label="User"
              sortKey="name"
              activeSortKey={listControls.sortKey}
              sortDirection={listControls.sortDirection}
              onSort={listControls.handleSort}
            />
            <SortableHeader
              label="Identity ID"
              sortKey="identityId"
              activeSortKey={listControls.sortKey}
              sortDirection={listControls.sortDirection}
              onSort={listControls.handleSort}
            />
            <SortableHeader
              label="Organizations"
              sortKey="organizations"
              activeSortKey={listControls.sortKey}
              sortDirection={listControls.sortDirection}
              onSort={listControls.handleSort}
            />
            <SortableHeader
              label="Cluster Admin"
              sortKey="clusterRole"
              activeSortKey={listControls.sortKey}
              sortDirection={listControls.sortDirection}
              onSort={listControls.handleSort}
            />
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-border">
            {visibleUsers.length === 0 ? (
              <div className="px-6 py-6 text-sm text-muted-foreground">
                {hasSearch ? 'No results found.' : 'No users found.'}
              </div>
            ) : (
              visibleUsers.map((user) => {
                const identityId = user.meta?.id;
                const canView = Boolean(identityId);
                const memberships = identityId ? orgsByUser.get(identityId) ?? [] : [];
                const roleValue = identityId ? clusterRoleMap.get(identityId) : undefined;
                const roleIndex = identityId ? identityIndexMap.get(identityId) : undefined;
                const isRoleLoading = roleIndex !== undefined ? clusterRoleQueries[roleIndex]?.isPending ?? false : false;
                const rowKey = identityId ?? user.email ?? user.name ?? 'user';
                return (
                  <div
                    key={rowKey}
                    className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1.5fr_2fr_1fr_120px]"
                    data-testid="users-row"
                  >
                    <div>
                      <div className="font-medium" data-testid="users-name">
                        {user.name || 'Unnamed user'}
                      </div>
                      <div className="text-xs text-muted-foreground" data-testid="users-email">
                        {user.email}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{identityId || '—'}</div>
                    <div className="text-xs text-muted-foreground" data-testid="users-organizations">
                      {isMembershipsLoading ? 'Loading...' : memberships.length > 0 ? memberships.join(', ') : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid="users-cluster-role">
                      {isRoleLoading ? (
                        'Loading...'
                      ) : (
                        <Badge
                          variant={roleValue === ClusterRole.ADMIN ? 'default' : 'outline'}
                          data-testid="users-cluster-role-badge"
                        >
                          {formatClusterRole(roleValue ?? ClusterRole.UNSPECIFIED)}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      {canView ? (
                        <Button variant="outline" size="sm" asChild>
                          <NavLink to={`/users/${identityId}`} data-testid="users-view">
                            View
                          </NavLink>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
      <LoadMoreButton
        hasMore={Boolean(usersQuery.hasNextPage)}
        isLoading={usersQuery.isFetchingNextPage}
        onClick={() => {
          void usersQuery.fetchNextPage();
        }}
      />
    </div>
  );
}
