import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

type MarkdownProps = {
  content: string;
  className?: string;
};

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <ReactMarkdown
      className={cn(
        'text-sm text-foreground leading-relaxed [&_p]:mt-2 [&_p:first-child]:mt-0 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 [&_a]:text-primary [&_a]:underline',
        className,
      )}
    >
      {content}
    </ReactMarkdown>
  );
}
