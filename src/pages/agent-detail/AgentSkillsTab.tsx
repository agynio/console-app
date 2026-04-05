import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsClient } from '@/api/client';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Input } from '@/components/Input';
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
import { formatDateOnly } from '@/lib/format';
import { MAX_PAGE_SIZE } from '@/lib/pagination';
import { toast } from 'sonner';

type AgentSkillsTabProps = {
  agentId: string;
};

const truncate = (value: string, maxLength = 100) => {
  if (!value) return '—';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
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
  const [editSkillId, setEditSkillId] = useState('');
  const [editName, setEditName] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editNameError, setEditNameError] = useState('');
  const [editBodyError, setEditBodyError] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState('');

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
      setEditSkillId('');
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
      setDeleteTargetId('');
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
    setEditSkillId(skill.meta?.id ?? '');
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
      setEditSkillId('');
      setEditName('');
      setEditBody('');
      setEditDescription('');
      setEditNameError('');
      setEditBodyError('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--agyn-dark)]" data-testid="agent-skills-heading">
            Skills
          </h3>
          <p className="text-sm text-[var(--agyn-gray)]">Reusable prompts and instructions.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} data-testid="agent-skills-create">
          Create skill
        </Button>
      </div>
      {skillsQuery.isPending ? <div className="text-sm text-[var(--agyn-gray)]">Loading skills...</div> : null}
      {skillsQuery.isError ? <div className="text-sm text-[var(--agyn-gray)]">Failed to load skills.</div> : null}
      {skills.length === 0 && !skillsQuery.isPending ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-skills-empty">
          <CardContent className="py-10 text-center text-sm text-[var(--agyn-gray)]">
            No skills configured.
          </CardContent>
        </Card>
      ) : null}
      {skills.length > 0 ? (
        <Card className="border-[var(--agyn-border-subtle)]" data-testid="agent-skills-table">
          <CardContent className="px-0">
            <div
              className="grid gap-2 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)] md:grid-cols-[1fr_2fr_1fr_120px]"
              data-testid="agent-skills-header"
            >
              <span>Name</span>
              <span>Body</span>
              <span>Created</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-[var(--agyn-border-subtle)]">
              {skills.map((skill) => (
                <div
                  key={skill.meta?.id ?? skill.name}
                  className="grid items-center gap-2 px-6 py-4 text-sm text-[var(--agyn-dark)] md:grid-cols-[1fr_2fr_1fr_120px]"
                  data-testid="agent-skill-row"
                >
                  <div>
                    <div className="font-medium" data-testid="agent-skill-name">
                      {skill.name}
                    </div>
                    <div className="text-xs text-[var(--agyn-gray)]" data-testid="agent-skill-description">
                      {skill.description || '—'}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-skill-body">
                    {truncate(skill.body)}
                  </span>
                  <span className="text-xs text-[var(--agyn-gray)]" data-testid="agent-skill-created">
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
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteTargetId(skill.meta?.id ?? '')}
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
            <Input
              label="Name"
              value={createName}
              onChange={(event) => {
                setCreateName(event.target.value);
                if (createNameError) setCreateNameError('');
              }}
              error={createNameError}
              data-testid="agent-skills-create-name"
            />
            <div className="space-y-2">
              <label className="text-sm text-[var(--agyn-dark)]">Body</label>
              <textarea
                className={`
                  w-full min-h-[140px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white px-4 py-3
                  text-sm text-[var(--agyn-dark)] placeholder:text-[var(--agyn-gray)]
                  focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
                  ${createBodyError ? 'border-red-500 focus:ring-red-500' : ''}
                `}
                value={createBody}
                onChange={(event) => {
                  setCreateBody(event.target.value);
                  if (createBodyError) setCreateBodyError('');
                }}
                data-testid="agent-skills-create-body"
              />
              {createBodyError ? <p className="text-sm text-red-500">{createBodyError}</p> : null}
            </div>
            <Input
              label="Description"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              data-testid="agent-skills-create-description-input"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-skills-create-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
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
            <Input
              label="Name"
              value={editName}
              onChange={(event) => {
                setEditName(event.target.value);
                if (editNameError) setEditNameError('');
              }}
              error={editNameError}
              data-testid="agent-skills-edit-name"
            />
            <div className="space-y-2">
              <label className="text-sm text-[var(--agyn-dark)]">Body</label>
              <textarea
                className={`
                  w-full min-h-[140px] rounded-[10px] border border-[var(--agyn-border-subtle)] bg-white px-4 py-3
                  text-sm text-[var(--agyn-dark)] placeholder:text-[var(--agyn-gray)]
                  focus:outline-none focus:ring-2 focus:ring-[var(--agyn-blue)] focus:border-transparent
                  ${editBodyError ? 'border-red-500 focus:ring-red-500' : ''}
                `}
                value={editBody}
                onChange={(event) => {
                  setEditBody(event.target.value);
                  if (editBodyError) setEditBodyError('');
                }}
                data-testid="agent-skills-edit-body"
              />
              {editBodyError ? <p className="text-sm text-red-500">{editBodyError}</p> : null}
            </div>
            <Input
              label="Description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              data-testid="agent-skills-edit-description-input"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm" data-testid="agent-skills-edit-cancel">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="primary"
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
        onOpenChange={(open) => setDeleteTargetId(open ? deleteTargetId : '')}
        title="Delete skill"
        description="This action permanently removes the skill."
        confirmLabel="Delete skill"
        variant="danger"
        onConfirm={() => deleteSkillMutation.mutate(deleteTargetId)}
        isPending={deleteSkillMutation.isPending}
      />
    </div>
  );
}
