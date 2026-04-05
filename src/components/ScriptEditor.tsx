import { type ReactNode, type TextareaHTMLAttributes } from 'react';

interface ScriptEditorProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  label?: ReactNode;
  error?: string;
  helperText?: string;
  monospace?: boolean;
  minHeightClass?: string;
}

export function ScriptEditor({
  label,
  error,
  helperText,
  monospace = false,
  minHeightClass = 'min-h-[140px]',
  className = '',
  ...props
}: ScriptEditorProps) {
  return (
    <div className="w-full">
      {label ? <label className="mb-2 block text-[var(--agyn-dark)]">{label}</label> : null}
      <textarea
        className={`
          w-full ${minHeightClass} rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white px-4 py-3
          text-sm text-[var(--agyn-dark)] placeholder:text-[var(--agyn-gray)]
          focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
          disabled:bg-[var(--agyn-bg-light)] disabled:cursor-not-allowed
          ${monospace ? 'font-mono' : ''}
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
          ${className}
        `}
        {...props}
      />
      {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
      {helperText && !error ? <p className="mt-2 text-sm text-[var(--agyn-gray)]">{helperText}</p> : null}
    </div>
  );
}
