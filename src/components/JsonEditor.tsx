import { useState, type ReactNode } from 'react';

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
    <div className="w-full">
      {label ? <label className="mb-2 block text-[var(--agyn-dark)]">{label}</label> : null}
      <textarea
        className={`
          w-full min-h-[140px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white px-4 py-3
          text-sm text-[var(--agyn-dark)] placeholder:text-[var(--agyn-gray)] font-mono
          focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
          disabled:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed
          ${displayError ? 'border-red-500 focus:ring-red-500' : ''}
        `}
        rows={6}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          if (localError) setLocalError('');
        }}
        onBlur={handleBlur}
        data-testid={testId}
      />
      {displayError ? <p className="mt-2 text-sm text-red-500">{displayError}</p> : null}
    </div>
  );
}
