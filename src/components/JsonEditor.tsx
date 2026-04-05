import { useState, type ReactNode } from 'react';
import { ScriptEditor } from '@/components/ScriptEditor';

type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: ReactNode;
  testId?: string;
};

export function JsonEditor({ value, onChange, error, label, testId }: JsonEditorProps) {
  const [localError, setLocalError] = useState('');
  const displayError = error || localError;

  const handleBlur = () => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setLocalError('');
      return;
    }
    try {
      JSON.parse(trimmedValue);
      setLocalError('');
    } catch {
      setLocalError('Invalid JSON format.');
    }
  };

  return (
    <ScriptEditor
      label={label}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        if (localError) setLocalError('');
      }}
      onBlur={handleBlur}
      error={displayError}
      monospace
      rows={6}
      data-testid={testId}
    />
  );
}
