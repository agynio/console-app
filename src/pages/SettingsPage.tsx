import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/Button';
import { Card, CardContent } from '@/components/ui/card';
import { useUserContext } from '@/context/UserContext';

export function SettingsPage() {
  const { currentUser, isClusterAdmin, signOut } = useUserContext();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--agyn-dark)]" data-testid="settings-heading">
          Settings
        </h2>
        <p className="text-sm text-[var(--agyn-gray)]">Profile and session settings.</p>
      </div>
      <Card className="border-[var(--agyn-border-subtle)]" data-testid="settings-profile-card">
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--agyn-dark)]">Profile</h3>
            <p className="text-sm text-[var(--agyn-gray)]">Your console profile details.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Name</div>
              <div className="text-sm text-[var(--agyn-dark)]">{currentUser?.name ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Email</div>
              <div className="text-sm text-[var(--agyn-dark)]">{currentUser?.email ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Nickname</div>
              <div className="text-sm text-[var(--agyn-dark)]">{currentUser?.nickname ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">OIDC Subject</div>
              <div className="text-sm text-[var(--agyn-dark)]">{currentUser?.oidcSubject ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--agyn-gray)]">Cluster role</div>
              <Badge variant={isClusterAdmin ? 'default' : 'outline'}>
                {isClusterAdmin ? 'Admin' : 'None'}
              </Badge>
            </div>
          </div>
          <div>
            <Button variant="outline" onClick={signOut} data-testid="settings-signout">
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
