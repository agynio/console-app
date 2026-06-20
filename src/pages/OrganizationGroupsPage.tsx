import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SortableHeader } from '@/components/SortableHeader';
import { GroupSource, type Group } from '@/gen/agynio/api/groups/v1/groups_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, timestampToMillis } from '@/lib/format';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

const groupNamePattern = /^[a-z0-9_-]{1,64}$/;

type GroupDialogValues = {
  name: string;
  description: string;
};

type GroupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: GroupDialogValues) => void;
  isSubmitting: boolean;
};

function GroupDialog({ open, onOpenChange, onSubmit, isSubmitting }: GroupDialogProps) {
  const [values, setValues] = useState<GroupDialogValues>({ name: '', description: '' });
  const [error, setError] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setValues({ name: '', description: '' });
      setError('');
    }
  };

  const handleSubmit = () => {
    const name = values.name.trim();
    if (!groupNamePattern.test(name)) {
      setError('Use 1-64 lowercase letters, numbers, underscores, or hyphens.');
      return;
    }
    onSubmit({ name, description: values.description.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="groups-create-dialog">
        <DialogHeader>
          <DialogTitle>Create group</DialogTitle>
          <DialogDescription>
            Create a platform-managed group for users, agents, and apps in this organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={values.name}
              onChange={(event) => {
                setValues((current) => ({ ...current, name: event.target.value }));
                setError('');
              }}
              placeholder="engineering"
              data-testid="groups-create-name"
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-description">Description</Label>
            <Textarea
              id="group-description"
              value={values.description}
              onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
              placeholder="Who belongs in this group?"
              data-testid="groups-create-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} data-testid="groups-create-submit">
            {isSubmitting ? 'Creating...' : 'Create group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationGroupsPage() {
  useDocumentTitle('Groups');

  const { id } = useParams();
  const organizationId = id ?? '';
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const groupsQuery = useInfiniteQuery({
    queryKey: ['groups', organizationId, 'list'],
    queryFn: ({ pageParam }) =>
      groupsClient.listGroups({ organizationId, pageSize: DEFAULT_PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextPageToken || undefined,
    enabled: Boolean(organizationId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: (values: GroupDialogValues) =>
      groupsClient.createGroup({
        organizationId,
        name: values.name,
        description: values.description,
        source: GroupSource.PLATFORM,
      }),
    onSuccess: () => {
      toast.success('Group created.');
      setCreateOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['groups', organizationId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create group.');
    },
  });

  const groups = useMemo(() => groupsQuery.data?.pages.flatMap((page) => page.groups) ?? [], [groupsQuery.data]);
  const listControls = useListControls({
    items: groups,
    searchFields: [
      (group) => group.name,
      (group) => group.description,
      (group) => group.meta?.id ?? '',
      (group) => formatGroupSource(group.source),
      (group) => formatDateOnly(group.meta?.createdAt),
    ],
    sortOptions: {
      name: (group) => group.name,
      source: (group) => formatGroupSource(group.source),
      created: (group) => timestampToMillis(group.meta?.createdAt),
    },
    defaultSortKey: 'name',
  });

  const visibleGroups = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search groups..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="groups-search"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="groups-create">
          Create group
        </Button>
      </div>
      {groupsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading groups...</div> : null}
      {groupsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load groups.</div> : null}
      {groups.length === 0 && !groupsQuery.isPending ? (
        <Card className="border-border" data-testid="groups-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No groups configured.
          </CardContent>
        </Card>
      ) : null}
      {groups.length > 0 ? (
        <Card className="border-border" data-testid="groups-table">
          <CardContent className="px-0">
            <div className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_2fr_1fr_1fr]">
              <SortableHeader
                label="Group"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <span>Description</span>
              <SortableHeader
                label="Source"
                sortKey="source"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Created"
                sortKey="created"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
            </div>
            <div className="divide-y divide-border">
              {visibleGroups.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No groups configured.'}
                </div>
              ) : (
                visibleGroups.map((group) => <GroupRow key={group.meta?.id ?? group.name} group={group} />)
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      {groupsQuery.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void groupsQuery.fetchNextPage()}
            disabled={groupsQuery.isFetchingNextPage}
          >
            {groupsQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      ) : null}
      <GroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}

function GroupRow({ group }: { group: Group }) {
  const groupId = group.meta?.id;

  return (
    <div className="grid gap-2 px-6 py-4 text-sm md:grid-cols-[2fr_2fr_1fr_1fr]" data-testid="groups-row">
      <div>
        {groupId ? (
          <NavLink className="font-medium text-primary hover:underline" to={groupId} data-testid="groups-row-link">
            {group.name}
          </NavLink>
        ) : (
          <span className="font-medium text-foreground">{group.name}</span>
        )}
        <div className="text-xs text-muted-foreground">{groupId || 'No ID'}</div>
      </div>
      <div className="text-muted-foreground">{group.description || 'No description'}</div>
      <div>{formatGroupSource(group.source)}</div>
      <div>{formatDateOnly(group.meta?.createdAt)}</div>
    </div>
  );
}

function formatGroupSource(source: GroupSource) {
  switch (source) {
    case GroupSource.PLATFORM:
      return 'Platform';
    case GroupSource.SCIM:
      return 'SCIM';
    case GroupSource.UNSPECIFIED:
      return 'Unspecified';
  }
}
