import { Button } from '@/components/ui/button';

type LoadMoreButtonProps = {
  hasMore: boolean;
  isLoading: boolean;
  onClick: () => void;
};

export function LoadMoreButton({ hasMore, isLoading, onClick }: LoadMoreButtonProps) {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center py-4">
      <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={isLoading}
        data-testid="load-more"
      >
        {isLoading ? 'Loading...' : 'Load more'}
      </Button>
    </div>
  );
}
