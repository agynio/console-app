import { useParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InstalledAppsPanel } from '@/pages/InstalledAppsPanel';
import { PublishedAppsPanel } from '@/pages/PublishedAppsPanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function OrganizationAppsTab() {
  useDocumentTitle('Apps');

  const { id } = useParams();
  const organizationId = id ?? '';

  return (
    <div className="space-y-4">
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
