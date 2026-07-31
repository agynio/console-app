import { toast } from 'sonner';

export function copyText(value: string, successMessage: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(successMessage),
    () => toast.error('Failed to copy to clipboard.'),
  );
}
