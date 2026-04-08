import { Outlet } from 'react-router-dom';

export function OrganizationDetailLayout() {
  return (
    <div className="space-y-6">
      <Outlet />
    </div>
  );
}
