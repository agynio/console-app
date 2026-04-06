import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScriptEditor } from '@/components/ScriptEditor';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Skill } from '@/gen/agynio/api/agents/v1/agents_pb';
import { formatDateOnly, truncate } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentSkillsTabProps = {
  agentId: string;
};

export function AgentSkillsTab({ agentId }: AgentSkillsTabProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createBody, setCreateBody] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createNameError, setCreateNameError] = useState('');
  const [createBodyError, setCreateBodyError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editSkillId, setEditSkillId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editNameError, setEditNameError] = useState('');
  const [editBodyError, setEditBodyError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const skillsQuery = useQuery({
    queryKey: ['skills', agentId, 'list'],
    queryFn: () => agentsClient.listSkills({ agentId, pageSize: MAX_PAGE_SIZE, pageToken: '' }),
    enabled: Boolean(agentId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const skills = skillsQuery.data?.skills ?? [];

  const createSkillMutation = useMutation({
    mutationFn: (payload: { agentId: string; name: string; body: string; description: string }) =>
      agentsClient.createSkill(payload),
    onSuccess: () => {
      toast.success('Skill created.');
      void queryClient.invalidateQueries({ queryKey: ['skills', agentId, 'list'] });
      setCreateOpen(false);
      setCreateName('');
      setCreateBody('');
      setCreateDescription('');
      setCreateNameError('');
      setCreateBodyError('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create skill.');
    },
  });

  const updateSkillMutation = useMutation({
    mutationFn: (payload: { id: string; name?: string; body?: string; description?: string }) =>
      agentsClient.updateSkill(payload),
    onSuccess: () => {
      toast.success('Skill updated.');
      void queryClient.invalidateQueries({ queryKey: ['skills', agentId, 'list'] });
      setEditOpen(false);
      setEditSkillId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update skill.');
    },
  });

  const deleteSkillMutation = useMutation({
    mutationFn: (skillId: string) => agentsClient.deleteSkill({ id: skillId }),
    onSuccess: () => {
      toast.success('Skill deleted.');
      void queryClient.invalidateQueries({ queryKey: ['skills', agentId, 'list'] });
      setDeleteTargetId(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete skill.');
    },
  });

  const handleCreate = () => {
    const trimmedName = createName.trim();
    const trimmedBody = createBody.trim();
    if (!trimmedName) {
      setCreateNameError('Name is required.');
    }
    if (!trimmedBody) {
      setCreateBodyError('Body is required.');
    }
    if (!trimmedName || !trimmedBody) return;
    createSkillMutation.mutate({
      agentId,
      name: trimmedName,
      body: trimmedBody,
      description: createDescription.trim(),
    });
  };

  const handleEditOpen = (skill: Skill) => {
    const skillId = skill.meta?.id;
    if (!skillId) {
      toast.error('Missing skill ID.');
      return;
    }
    setEditSkillId(skillId);
    setEditName(skill.name);
    setEditBody(skill.body);
    setEditDescription(skill.description);
    setEditNameError('');
    setEditBodyError('');
    setEditOpen(true);
  };

  const handleEditSave = () => {
    const trimmedName = editName.trim();
    const trimmedBody = editBody.trim();
    if (!trimmedName) {
      setEditNameError('Name is required.');
    }
    if (!trimmedBody) {
      setEditBodyError('Body is required.');
    }
    if (!trimmedName || !trimmedBody) return;
    if (!editSkillId) {
      toast.error('Missing skill ID.');
      return;
    }
    updateSkillMutation.mutate({
      id: editSkillId,
      name: trimmedName,
      body: trimmedBody,
      description: editDescription.trim(),
    });
  };

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setEditSkillId(null);
      setEditName('');
      setEditBody('');
      setEditDescription('');
      setEditNameError('');
      setEditBodyError('');
    }
  };

  const handleDeleteOpen = (skill: Skill) => {
    const skillId = skill.meta?.id;
    if (!skillId) {
      toast.error('Missing skill ID.');
      return;
    }
    setDeleteTargetId(skillId);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground" data-testid="agent-skills-heading">
            Skills
          </h3>
          <p className="text-sm text-muted-foreground">Reusable prompts and instructions.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="agent-skills-create">
          Create skill
        </Button>
      </div>
      {skillsQuery.isPending ? <div className="text-sm text-muted-foreground">Loading skills...</div> : null}
      {skillsQuery.isError ? <div className="text-sm text-muted-foreground">Failed to load skills.</div> : null}
      {skills.length === 0 && !skillsQuery.isPending ? (
        <Card className="border-border" data-testid="agent-skills-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No skills configured.
          </CardContent>
        </Card>
      ) : null}
      {skills.length > 0 ? (
        <Card className="border-border" data-testid="agent-skills-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid-cols-[1fr_2fr_1fr_120px]"
              data-testid="agent-skills-header"
            >
              <span>Name</span>
              <span>Body</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {skills.map((skill) => (
                <div
                  key={skill.meta?.id ?? skill.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-foreground md:grid-cols-[1fr_2fr_1fr_120px]"
                  data-testid="agent-skill-row"
                >
                  <div>
                    <div className="font-medium" data-testid="agent-skill-name">
                      {skill.name}
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid="agent-skill-description">
                      {skill.description || '—'}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground" data-testid="agent-skill-body">
                    {truncate(skill.body)}
                  </span>
                  <span className="text-xs text-muted-foreground" data-testid="agent-skill-created">
                    {formatDateOnly(skill.meta?.createdAt)}
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditOpen(skill)}
                      data-testid="agent-skill-edit"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteOpen(skill)}
                      data-testid="agent-skill-delete"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-testid="agent-skills-create-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-skills-create-title">Create skill</DialogTitle>
          <DialogDescription data-testid="agent-skills-create-description">
            Add a new skill prompt for this agent.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-skills-create-name">Name</Label>
            <Input
              id="agent-skills-create-name"
              value={createName}
              onChange={(event) => {
                setCreateName(event.target.value);
                if (createNameError) setCreateNameError('');
              }}
              data-testid="agent-skills-create-name"
            />
            {createNameError && <p className="text-sm text-destructive">{createNameError}</p>}
          </div>
          <ScriptEditor
            label="Body"
            value={createBody}
              onChange={(event) => {
                setCreateBody(event.target.value);
                if (createBodyError) setCreateBodyError('');
              }}
            error={createBodyError}
            data-testid="agent-skills-create-body"
          />
          <div className="space-y-2">
            <Label htmlFor="agent-skills-create-description-input">Description</Label>
            <Input
              id="agent-skills-create-description-input"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              data-testid="agent-skills-create-description-input"
            />
          </div>
        </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-skills-create-cancel">
                Cancel
              </Button>
            </DialogClose>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={createSkillMutation.isPending}
            data-testid="agent-skills-create-submit"
          >
            {createSkillMutation.isPending ? 'Creating...' : 'Create skill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent data-testid="agent-skills-edit-dialog">
          <DialogHeader>
            <DialogTitle data-testid="agent-skills-edit-title">Edit skill</DialogTitle>
          <DialogDescription data-testid="agent-skills-edit-description">
            Update skill details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-skills-edit-name">Name</Label>
            <Input
              id="agent-skills-edit-name"
              value={editName}
              onChange={(event) => {
                setEditName(event.target.value);
                if (editNameError) setEditNameError('');
              }}
              data-testid="agent-skills-edit-name"
            />
            {editNameError && <p className="text-sm text-destructive">{editNameError}</p>}
          </div>
          <ScriptEditor
            label="Body"
            value={editBody}
              onChange={(event) => {
                setEditBody(event.target.value);
                if (editBodyError) setEditBodyError('');
              }}
            error={editBodyError}
            data-testid="agent-skills-edit-body"
          />
          <div className="space-y-2">
            <Label htmlFor="agent-skills-edit-description-input">Description</Label>
            <Input
              id="agent-skills-edit-description-input"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              data-testid="agent-skills-edit-description-input"
            />
          </div>
        </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-skills-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
          <Button
            size="sm"
            onClick={handleEditSave}
            disabled={updateSkillMutation.isPending}
            data-testid="agent-skills-edit-submit"
          >
            {updateSkillMutation.isPending ? 'Saving...' : 'Save changes'}
          </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        title="Delete skill"
        description="This action permanently removes the skill."
        confirmLabel="Delete skill"
        variant="danger"
        onConfirm={() => {
          if (deleteTargetId) {
            deleteSkillMutation.mutate(deleteTargetId);
          }
        }}
        isPending={deleteSkillMutation.isPending}
      />
    </div>
  );
}
