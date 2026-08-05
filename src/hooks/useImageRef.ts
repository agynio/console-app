import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { imagesClient } from '@/api/client';
import { MAX_PAGE_SIZE } from '@/lib/pagination';

/**
 * Renders an image reference for a list. A stored id and tag say nothing on
 * their own, so the organization's images are listed once and every row looks
 * its name up here.
 */
export function useImageRef(organizationId: string) {
  const listed = useQuery({
    queryKey: ['images', organizationId, 'all'],
    enabled: Boolean(organizationId),
    queryFn: () => imagesClient.listImages({ organizationId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    staleTime: 60_000,
  });

  const images = useMemo(() => listed.data?.images ?? [], [listed.data]);

  return useCallback(
    (imageId: string, imageTag: string, legacy?: string) => {
      // A record written before the catalog carries a literal reference and no
      // id; showing it beats showing nothing until it is migrated.
      if (!imageId) return legacy || '—';
      const image = images.find((candidate) => candidate.meta?.id === imageId);
      // A deleted image leaves references behind: say so rather than blank.
      if (!image) return imageTag ? `(deleted image):${imageTag}` : '(deleted image)';
      return imageTag ? `${image.name}:${imageTag}` : image.name;
    },
    [images],
  );
}
