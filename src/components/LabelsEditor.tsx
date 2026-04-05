import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import type { LabelEntry } from '@/lib/labels';
import { createLabelEntry } from '@/lib/labels';

type LabelsEditorProps = {
  value: LabelEntry[];
  onChange: (value: LabelEntry[]) => void;
  disabled?: boolean;
  testIdPrefix: string;
};

export function LabelsEditor({ value, onChange, disabled = false, testIdPrefix }: LabelsEditorProps) {
  const handleAdd = () => {
    onChange([...value, createLabelEntry()]);
  };

  const handleRemove = (id: string) => {
    onChange(value.filter((entry) => entry.id !== id));
  };

  const handleUpdate = (id: string, field: 'key' | 'value', nextValue: string) => {
    onChange(
      value.map((entry) => (entry.id === id ? { ...entry, [field]: nextValue } : entry)),
    );
  };

  return (
    <div className="space-y-2" data-testid={`${testIdPrefix}-labels`}>
      {value.length === 0 ? (
        <div className="text-xs text-[var(--agyn-gray)]" data-testid={`${testIdPrefix}-labels-empty`}>
          No labels configured.
        </div>
      ) : null}
      {value.map((entry, index) => (
        <div
          key={entry.id}
          className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
          data-testid={`${testIdPrefix}-labels-row`}
        >
          <Input
            size="sm"
            placeholder="Key"
            value={entry.key}
            onChange={(event) => handleUpdate(entry.id, 'key', event.target.value)}
            disabled={disabled}
            data-testid={`${testIdPrefix}-labels-key-${index}`}
          />
          <Input
            size="sm"
            placeholder="Value"
            value={entry.value}
            onChange={(event) => handleUpdate(entry.id, 'value', event.target.value)}
            disabled={disabled}
            data-testid={`${testIdPrefix}-labels-value-${index}`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleRemove(entry.id)}
            disabled={disabled}
            data-testid={`${testIdPrefix}-labels-remove-${index}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={disabled}
        data-testid={`${testIdPrefix}-labels-add`}
      >
        Add label
      </Button>
    </div>
  );
}
