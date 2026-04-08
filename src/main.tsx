import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGate } from '@/auth';
import { ThemeProvider } from '@/components/theme-provider';
import { OrganizationProvider } from '@/context/OrganizationContext';
import { PageTitleProvider } from '@/context/PageTitleContext';
import { UserProvider } from '@/context/UserContext';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <PageTitleProvider>
          <QueryClientProvider client={queryClient}>
            <AuthGate>
              <UserProvider>
                <OrganizationProvider>
                  <App />
                </OrganizationProvider>
              </UserProvider>
            </AuthGate>
          </QueryClientProvider>
        </PageTitleProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
