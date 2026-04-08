/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';

type PageTitleContextValue = string;
type PageTitleSetter = (title: string) => void;

const PageTitleContext = createContext<PageTitleContextValue | null>(null);
const PageTitleSetterContext = createContext<PageTitleSetter | null>(null);

type PageTitleProviderProps = {
  children: ReactNode;
};

export function PageTitleProvider({ children }: PageTitleProviderProps) {
  const [title, setTitle] = useState('');

  return (
    <PageTitleContext.Provider value={title}>
      <PageTitleSetterContext.Provider value={setTitle}>
        {children}
      </PageTitleSetterContext.Provider>
    </PageTitleContext.Provider>
  );
}

export function usePageTitle(): PageTitleContextValue {
  const context = useContext(PageTitleContext);
  if (context === null) {
    throw new Error('usePageTitle must be used within PageTitleProvider');
  }
  return context;
}

export function useSetPageTitle(): PageTitleSetter {
  const context = useContext(PageTitleSetterContext);
  if (!context) {
    throw new Error('useSetPageTitle must be used within PageTitleProvider');
  }
  return context;
}
