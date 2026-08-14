import { useQuery } from '@tanstack/react-query';
import { secretsClient } from '@/api/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { NEW_SECRET, NO_SECRET, type SecretChoice } from '@/lib/secret-choice';

type Props = {
  organizationId: string;
  choice: SecretChoice;
  onChange: (choice: SecretChoice) => void;
  /** Gates the list request, so a dialog that is closed asks for nothing. */
  enabled?: boolean;
  label?: string;
  /** Offers NO_SECRET. Off for a credential that is required. */
  allowNone?: boolean;
  noneLabel?: string;
  valueLabel?: string;
  titlePlaceholder?: string;
  /** Prefix for element ids and data-testid, e.g. "images-register-secret". */
  testId: string;
  error?: string;
  valueError?: string;
  helpText?: string;
};

/**
 * Picks the secret a resource holds by reference, or creates one inline. What
 * is typed here reaches the Secrets service and nowhere else: the resource is
 * given the id.
 */
export function SecretPicker({
  organizationId,
  choice,
  onChange,
  enabled = true,
  label = 'Secret',
  allowNone = false,
  noneLabel = 'None',
  valueLabel = 'Value',
  titlePlaceholder,
  testId,
  error,
  valueError,
  helpText = 'Stored as a secret and referenced by id. Never shown again.',
}: Props) {
  const { data } = useQuery({
    queryKey: ['secrets', organizationId, 'picker'],
    queryFn: () => secretsClient.listSecrets({ organizationId, pageSize: MAX_PAGE_SIZE }),
    enabled: enabled && Boolean(organizationId),
  });

  const secrets = data?.secrets ?? [];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={testId}>{label}</Label>
        <Select
          value={choice.selection}
          onValueChange={(selection) => onChange({ ...choice, selection })}
        >
          <SelectTrigger id={testId} data-testid={testId}>
            <SelectValue placeholder="Choose a secret, or add one" />
          </SelectTrigger>
          <SelectContent>
            {allowNone ? <SelectItem value={NO_SECRET}>{noneLabel}</SelectItem> : null}
            <SelectItem value={NEW_SECRET}>Add a new secret…</SelectItem>
            {secrets.map((secret) => (
              <SelectItem key={secret.meta?.id} value={secret.meta?.id ?? ''}>
                {secret.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      {choice.selection === NEW_SECRET ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor={`${testId}-title`}>Secret name</Label>
            <Input
              id={`${testId}-title`}
              value={choice.title}
              onChange={(event) => onChange({ ...choice, title: event.target.value })}
              placeholder={titlePlaceholder}
              data-testid={`${testId}-title`}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${testId}-value`}>{valueLabel}</Label>
            <Input
              id={`${testId}-value`}
              type="password"
              value={choice.value}
              onChange={(event) => onChange({ ...choice, value: event.target.value })}
              data-testid={`${testId}-value`}
            />
            {valueError ? (
              <p className="text-sm text-destructive">{valueError}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{helpText}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
