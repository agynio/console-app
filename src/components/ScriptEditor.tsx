import { type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
      {label ? <Label className="mb-2 block">{label}</Label> : null}
      <Textarea
        className={`${minHeightClass} ${monospace ? 'font-mono' : ''} ${className}`}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {helperText && !error ? <p className="mt-2 text-sm text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}
