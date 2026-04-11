import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersClient } from '@/api/client';
import { SortableHeader } from '@/components/SortableHeader';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateDeviceDialog } from '@/components/CreateDeviceDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Device } from '@/gen/agynio/api/users/v1/users_pb';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useListControls } from '@/hooks/useListControls';
import { formatDateOnly, formatDeviceStatus, timestampToMillis } from '@/lib/format';
import { toast } from 'sonner';

export function DevicesPage() {
  useDocumentTitle('Devices');

  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteDevice, setDeleteDevice] = useState<Device | null>(null);

  const devicesQuery = useQuery({
    queryKey: ['devices', 'list'],
    queryFn: () => usersClient.listDevices({}),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (deviceId: string) => usersClient.deleteDevice({ id: deviceId }),
    onSuccess: () => {
      toast.success('Device deleted.');
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
      setDeleteDevice(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete device.');
    },
  });

  const devices = devicesQuery.data?.devices ?? [];
  const listControls = useListControls({
    items: devices,
    searchFields: [
      (device) => device.name,
      (device) => formatDeviceStatus(device.status),
      (device) => formatDateOnly(device.meta?.createdAt),
    ],
    sortOptions: {
      name: (device) => device.name,
      status: (device) => formatDeviceStatus(device.status),
      created: (device) => timestampToMillis(device.meta?.createdAt),
    },
    defaultSortKey: 'name',
  });

  const visibleDevices = listControls.filteredItems;
  const hasSearch = listControls.searchTerm.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search devices..."
            value={listControls.searchTerm}
            onChange={(event) => listControls.setSearchTerm(event.target.value)}
            data-testid="list-search"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="devices-create">
          Add device
        </Button>
      </div>
      {devicesQuery.isPending ? <div className="text-sm text-muted-foreground">Loading devices...</div> : null}
      {devicesQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load devices.</div> : null}
      {devices.length === 0 && !devicesQuery.isPending ? (
        <Card className="border-border" data-testid="devices-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No devices. Add one to enable secure network access.
          </CardContent>
        </Card>
      ) : null}
      {devices.length > 0 ? (
        <Card className="border-border" data-testid="devices-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[2fr_1fr_1fr_120px]"
              data-testid="devices-header"
            >
              <SortableHeader
                label="Name"
                sortKey="name"
                activeSortKey={listControls.sortKey}
                sortDirection={listControls.sortDirection}
                onSort={listControls.handleSort}
              />
              <SortableHeader
                label="Status"
                sortKey="status"
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
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {visibleDevices.length === 0 ? (
                <div className="px-6 py-6 text-sm text-muted-foreground">
                  {hasSearch ? 'No results found.' : 'No devices yet.'}
                </div>
              ) : (
                visibleDevices.map((device) => {
                  const deviceId = device.meta?.id;
                  return (
                    <div
                      key={deviceId ?? device.name}
                      className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[2fr_1fr_1fr_120px]"
                      data-testid="devices-row"
                    >
                      <span className="font-medium" data-testid="devices-name">
                        {device.name}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="devices-status">
                        {formatDeviceStatus(device.status)}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="devices-created">
                        {formatDateOnly(device.meta?.createdAt)}
                      </span>
                      <div className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteDevice(device)}
                          disabled={!deviceId}
                          data-testid="devices-delete"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <CreateDeviceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={Boolean(deleteDevice)}
        onOpenChange={(open) => {
          if (!open) setDeleteDevice(null);
        }}
        title="Delete device"
        description="This device will no longer be able to access the network."
        confirmLabel="Delete device"
        variant="danger"
        onConfirm={() => {
          if (deleteDevice?.meta?.id) {
            deleteMutation.mutate(deleteDevice.meta.id);
          }
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
