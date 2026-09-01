import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { JsonObject, JsonValue } from '@bufbuild/protobuf';
import { agentsClient, llmClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { visibleProperties, type ConfigurationSchema, type RefKind, type SchemaProperty } from '@/lib/configurationSchema';

type ConfigurationFormProps = {
  schema: ConfigurationSchema;
  values: JsonObject;
  onChange: (values: JsonObject) => void;
  /** Secret properties the installation already holds a value for. */
  secretKeysSet?: string[];
  errors?: Record<string, string>;
  organizationId: string;
  disabled?: boolean;
};

/**
 * Builds the install and update forms from the schema the app reported.
 * Installing an app is answering labelled questions rather than composing a
 * JSON document against documentation held somewhere else.
 */
export function ConfigurationForm({
  schema,
  values,
  onChange,
  secretKeysSet = [],
  errors = {},
  organizationId,
  disabled = false,
}: ConfigurationFormProps) {
  const shown = useMemo(
    () => visibleProperties(schema, values, secretKeysSet),
    [schema, values, secretKeysSet],
  );

  if (schema.properties.length === 0) {
    return <p className="text-sm text-muted-foreground">This app needs no configuration.</p>;
  }

  const set = (name: string, value: JsonValue | undefined) => {
    const next = { ...values };
    if (value === undefined) delete next[name];
    else next[name] = value;
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {shown.map((property) => (
        <PropertyField
          key={property.name}
          property={property}
          value={values[property.name]}
          onChange={(value) => set(property.name, value)}
          alreadySet={secretKeysSet.includes(property.name)}
          error={errors[property.name]}
          organizationId={organizationId}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

type PropertyFieldProps = {
  property: SchemaProperty;
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
  alreadySet: boolean;
  error?: string;
  organizationId: string;
  disabled: boolean;
};

function PropertyField({ property, value, onChange, alreadySet, error, organizationId, disabled }: PropertyFieldProps) {
  const id = `configuration-${property.name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex flex-wrap items-center gap-2">
        <span>{property.title}</span>
        {property.required ? <span className="text-destructive">*</span> : null}
        {property.deprecated ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Deprecated</span>
        ) : null}
      </Label>
      {property.description ? <p className="text-xs text-muted-foreground">{property.description}</p> : null}

      <PropertyInput
        id={id}
        property={property}
        value={value}
        onChange={onChange}
        alreadySet={alreadySet}
        organizationId={organizationId}
        disabled={disabled}
      />

      {property.deprecated && (value !== undefined || alreadySet) ? (
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(undefined)}>
          Clear
        </Button>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function PropertyInput({
  id,
  property,
  value,
  onChange,
  alreadySet,
  organizationId,
  disabled,
}: PropertyFieldProps & { id: string }) {
  const [replacing, setReplacing] = useState(false);

  if (property.secret) {
    // A stored secret is never sent to the browser, so there is nothing to
    // show. Leaving it untouched keeps what is stored.
    if (alreadySet && !replacing && value === undefined) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Set</span>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setReplacing(true)}>
            Replace
          </Button>
        </div>
      );
    }
    return (
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (property.ref) {
    return (
      <EntityPicker
        id={id}
        kind={property.ref}
        organizationId={organizationId}
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (property.enum) {
    return (
      <Select
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onValueChange={(next) => onChange(next)}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {property.enum.map((option) => (
            <SelectItem key={String(option)} value={String(option)}>
              {String(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (property.type === 'boolean') {
    return (
      <Checkbox id={id} disabled={disabled} checked={value === true} onCheckedChange={(next) => onChange(next === true)} />
    );
  }

  if (property.type === 'integer' || property.type === 'number') {
    return (
      <Input
        id={id}
        type="number"
        disabled={disabled}
        min={property.minimum}
        max={property.maximum}
        step={property.type === 'integer' ? 1 : 'any'}
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') return onChange(undefined);
          const parsed = Number(raw);
          onChange(Number.isNaN(parsed) ? raw : parsed);
        }}
      />
    );
  }

  if (property.type === 'array') {
    return <StringListInput id={id} value={value} onChange={onChange} disabled={disabled} />;
  }

  return (
    <Input
      id={id}
      disabled={disabled}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function StringListInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: JsonValue | undefined;
  onChange: (value: JsonValue | undefined) => void;
  disabled: boolean;
}) {
  const items = Array.isArray(value) ? value.map((item) => String(item)) : [];
  const replace = (next: string[]) => onChange(next);

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          <Input
            id={index === 0 ? id : undefined}
            disabled={disabled}
            value={item}
            onChange={(event) => replace(items.map((existing, i) => (i === index ? event.target.value : existing)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => replace(items.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => replace([...items, ''])}>
        Add
      </Button>
    </div>
  );
}

/**
 * A reference names a platform entity, so it gets a picker over that entity
 * kind in this organization — not a field to paste a UUID into from another
 * browser tab.
 */
function EntityPicker({
  id,
  kind,
  organizationId,
  value,
  onChange,
  disabled,
}: {
  id: string;
  kind: RefKind;
  organizationId: string;
  value: string;
  onChange: (value: JsonValue | undefined) => void;
  disabled: boolean;
}) {
  const query = useQuery({
    queryKey: ['configuration-reference', kind, organizationId],
    queryFn: async () => {
      const page = { organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' };
      if (kind === 'agent') {
        const response = await agentsClient.listAgents(page);
        return response.agents.flatMap((agent) => (agent.meta?.id ? [{ id: agent.meta.id, name: agent.name }] : []));
      }
      if (kind === 'environment') {
        const response = await agentsClient.listEnvironments(page);
        return response.environments.flatMap((environment) =>
          environment.meta?.id ? [{ id: environment.meta.id, name: environment.name }] : [],
        );
      }
      const response = await llmClient.listModels(page);
      return response.models.flatMap((model) => (model.meta?.id ? [{ id: model.meta.id, name: model.name }] : []));
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const options = query.data ?? [];
  // A stored reference whose target has since been deleted would otherwise
  // vanish from the picker and read as "unset".
  const dangling = value !== '' && !query.isPending && !options.some((option) => option.id === value);

  return (
    <div className="space-y-1">
      <Select disabled={disabled || query.isPending} value={value} onValueChange={(next) => onChange(next)}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={query.isPending ? 'Loading…' : `Select ${kind}…`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {dangling ? (
        <p className="text-xs text-destructive">
          The {kind} this names ({value}) is no longer in this organization. Pick another.
        </p>
      ) : null}
      {query.isError ? <p className="text-xs text-destructive">Could not load {kind}s.</p> : null}
    </div>
  );
}
