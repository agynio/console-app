import { create } from '@bufbuild/protobuf';
import type { ComputeResources } from '@/gen/agynio/api/agents/v1/agents_pb';
import { ComputeResourcesSchema } from '@/gen/agynio/api/agents/v1/agents_pb';
import { Input } from '@/components/Input';

type ComputeResourcesEditorProps = {
  value?: ComputeResources;
  onChange: (value?: ComputeResources) => void;
  testIdPrefix: string;
};

type ComputeResourceField = 'requestsCpu' | 'requestsMemory' | 'limitsCpu' | 'limitsMemory';

export function ComputeResourcesEditor({ value, onChange, testIdPrefix }: ComputeResourcesEditorProps) {
  const resources =
    value ??
    create(ComputeResourcesSchema, {
      requestsCpu: '',
      requestsMemory: '',
      limitsCpu: '',
      limitsMemory: '',
    });

  const updateResource = (field: ComputeResourceField, nextValue: string) => {
    const nextResources = create(ComputeResourcesSchema, { ...resources, [field]: nextValue });
    const hasValues = [
      nextResources.requestsCpu,
      nextResources.requestsMemory,
      nextResources.limitsCpu,
      nextResources.limitsMemory,
    ].some((entry) => entry.trim().length > 0);
    onChange(hasValues ? nextResources : undefined);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid={`${testIdPrefix}-resources`}>
      <Input
        label="Requests CPU"
        placeholder="100m"
        value={resources.requestsCpu}
        onChange={(event) => updateResource('requestsCpu', event.target.value)}
        data-testid={`${testIdPrefix}-requests-cpu`}
      />
      <Input
        label="Requests Memory"
        placeholder="256Mi"
        value={resources.requestsMemory}
        onChange={(event) => updateResource('requestsMemory', event.target.value)}
        data-testid={`${testIdPrefix}-requests-memory`}
      />
      <Input
        label="Limits CPU"
        placeholder="500m"
        value={resources.limitsCpu}
        onChange={(event) => updateResource('limitsCpu', event.target.value)}
        data-testid={`${testIdPrefix}-limits-cpu`}
      />
      <Input
        label="Limits Memory"
        placeholder="512Mi"
        value={resources.limitsMemory}
        onChange={(event) => updateResource('limitsMemory', event.target.value)}
        data-testid={`${testIdPrefix}-limits-memory`}
      />
    </div>
  );
}
