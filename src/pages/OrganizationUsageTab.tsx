import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ComputeSection } from './usage/ComputeSection';
import { LlmSection } from './usage/LlmSection';
import { PlatformSection } from './usage/PlatformSection';
import { StorageSection } from './usage/StorageSection';
import { buildRange, formatDateInput, rangeOptions, type RangeOption } from './usage/range';

export function OrganizationUsageTab() {
  useDocumentTitle('Usage');

  const { id } = useParams();
  const organizationId = id ?? '';

  const [rangeOption, setRangeOption] = useState<RangeOption>('24h');
  const [customStart, setCustomStart] = useState(() => formatDateInput(new Date(Date.now() - 6 * 86400000)));
  const [customEnd, setCustomEnd] = useState(() => formatDateInput(new Date()));

  const { range, error: rangeError } = useMemo(
    () => buildRange(rangeOption, customStart, customEnd),
    [rangeOption, customStart, customEnd],
  );

  return (
    <div className="space-y-6">
      {/* The window is the one control that scopes every section, so it sits
          above the tabs. Anything that scopes a single chart lives on it. */}
      <div className="flex flex-wrap items-center gap-3" data-testid="organization-usage-header">
        <Select value={rangeOption} onValueChange={(value) => setRangeOption(value as RangeOption)}>
          <SelectTrigger>
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            {rangeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {rangeOption === 'custom' ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="organization-usage-custom-range">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Start date</span>
            <Input
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              data-testid="organization-usage-custom-start"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">End date</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              data-testid="organization-usage-custom-end"
            />
          </div>
        </div>
      ) : null}
      {rangeError ? <div className="text-sm text-destructive">{rangeError}</div> : null}

      {/* Each tab loads only its own queries: the inactive ones are unmounted,
          so nothing fetches storage buckets to draw an LLM chart. */}
      <Tabs defaultValue="llm" data-testid="organization-usage-tabs">
        <TabsList variant="line" className="w-full justify-start border-b border-border [&>*]:flex-none">
          <TabsTrigger value="llm" data-testid="organization-usage-llm-tab">
            LLM
          </TabsTrigger>
          <TabsTrigger value="compute" data-testid="organization-usage-compute-tab">
            Compute
          </TabsTrigger>
          <TabsTrigger value="storage" data-testid="organization-usage-storage-tab">
            Storage
          </TabsTrigger>
          <TabsTrigger value="platform" data-testid="organization-usage-platform-tab">
            Platform
          </TabsTrigger>
        </TabsList>
        <TabsContent value="llm" className="mt-4">
          <LlmSection organizationId={organizationId} range={range} />
        </TabsContent>
        <TabsContent value="compute" className="mt-4">
          <ComputeSection organizationId={organizationId} range={range} />
        </TabsContent>
        <TabsContent value="storage" className="mt-4">
          <StorageSection organizationId={organizationId} range={range} />
        </TabsContent>
        <TabsContent value="platform" className="mt-4">
          <PlatformSection organizationId={organizationId} range={range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
