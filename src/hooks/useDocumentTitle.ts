import { useEffect } from 'react';
import { useSetPageTitle } from '@/context/PageTitleContext';

export function useDocumentTitle(title: string): void {
  const setTitle = useSetPageTitle();

  useEffect(() => {
    setTitle(title);
  }, [setTitle, title]);
}
