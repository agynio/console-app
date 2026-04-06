import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useUserContext } from '@/context/UserContext';

export function SettingsPage() {
  const { currentUser, isClusterAdmin, signOut } = useUserContext();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground" data-testid="settings-heading">
          Settings
        </h2>
        <p className="text-sm text-muted-foreground">Profile and session settings.</p>
      </div>
      <Card className="border-border" data-testid="settings-profile-card">
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Profile</h3>
            <p className="text-sm text-muted-foreground">Your console profile details.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Name</div>
              <div className="text-sm text-foreground">{currentUser?.name ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Email</div>
              <div className="text-sm text-foreground">{currentUser?.email ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Nickname</div>
              <div className="text-sm text-foreground">{currentUser?.nickname ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">OIDC Subject</div>
              <div className="text-sm text-foreground">{currentUser?.oidcSubject ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Cluster role</div>
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
