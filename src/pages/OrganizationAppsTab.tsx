import { useParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InstalledAppsPanel } from '@/pages/InstalledAppsPanel';
import { PublishedAppsPanel } from '@/pages/PublishedAppsPanel';

export function OrganizationAppsTab() {
  const { id } = useParams();
  const organizationId = id ?? '';

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="organization-apps-heading">
          Apps
        </h3>
        <p className="text-sm text-[var(--agyn-gray)]" data-testid="organization-apps-scope">
          Manage app installations for this organization.
        </p>
      </div>
      <Tabs defaultValue="installed" data-testid="organization-apps-tabs">
        <TabsList>
          <TabsTrigger value="installed" data-testid="organization-apps-tab-installed">
            Installed
          </TabsTrigger>
          <TabsTrigger value="published" data-testid="organization-apps-tab-published">
            Published
          </TabsTrigger>
        </TabsList>
        <TabsContent value="installed">
          <InstalledAppsPanel organizationId={organizationId} />
        </TabsContent>
        <TabsContent value="published">
          <PublishedAppsPanel organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
