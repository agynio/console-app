import {
  ActivityIcon,
  BotIcon,
  BoxesIcon,
  BrainIcon,
  BuildingIcon,
  CableIcon,
  ContainerIcon,
  LayersIcon,
  CpuIcon,
  DatabaseIcon,
  HardDriveIcon,
  HomeIcon,
  KeyRoundIcon,
  LineChartIcon,
  MessageSquareIcon,
  NetworkIcon,
  PlugIcon,
  ServerIcon,
  ShieldIcon,
  SparklesIcon,
  TerminalIcon,
  UsersIcon,
  VaultIcon,
  type LucideIcon,
} from 'lucide-react';

export type NavSection = {
  label: string;
  /** Appended to the context base path. The empty string is the base itself. */
  path: string;
  icon: LucideIcon;
  testId: string;
  /** Match the path exactly instead of as a prefix. */
  end?: boolean;
};

export type NavGroup = {
  /** Stable key for persisted collapse state; never derive it from the label. */
  id: string;
  label: string;
  testId: string;
  sections: NavSection[];
};

// Groups are named for what they govern, not for the service that owns them, and
// no group header repeats one of its own section names. Every icon is unique
// within a context so the sidebar stays scannable at a glance.
export const CLUSTER_NAV_GROUPS: NavGroup[] = [
  {
    id: 'platform',
    label: 'Platform',
    testId: 'nav-group-platform',
    sections: [
      { label: 'Overview', path: '/', icon: HomeIcon, testId: 'nav-dashboard', end: true },
      { label: 'Users', path: '/users', icon: UsersIcon, testId: 'nav-users' },
      { label: 'Organizations', path: '/organizations', icon: BuildingIcon, testId: 'nav-organizations' },
      { label: 'Runners', path: '/runners', icon: ServerIcon, testId: 'nav-cluster-runners' },
      { label: 'App Catalog', path: '/apps', icon: BoxesIcon, testId: 'nav-apps' },
    ],
  },
];

export const ORGANIZATION_NAV_GROUPS: NavGroup[] = [
  {
    id: 'organization',
    label: 'Organization',
    testId: 'nav-group-organization',
    sections: [
      { label: 'Overview', path: '', icon: BuildingIcon, testId: 'nav-organization-overview', end: true },
      { label: 'Members', path: '/members', icon: UsersIcon, testId: 'nav-organization-members' },
      { label: 'Groups', path: '/groups', icon: ShieldIcon, testId: 'nav-organization-groups' },
    ],
  },
  {
    id: 'agents-and-apps',
    label: 'Agents & Apps',
    testId: 'nav-group-agents-and-apps',
    sections: [
      { label: 'Agents', path: '/agents', icon: BotIcon, testId: 'nav-organization-agents' },
      { label: 'Apps', path: '/apps', icon: BoxesIcon, testId: 'nav-organization-apps' },
    ],
  },
  {
    id: 'runtime',
    label: 'Runtime',
    testId: 'nav-group-runtime',
    sections: [
      { label: 'Images', path: '/images', icon: LayersIcon, testId: 'nav-organization-images' },
      { label: 'Environments', path: '/environments', icon: ContainerIcon, testId: 'nav-organization-environments' },
      { label: 'Volumes', path: '/volumes', icon: HardDriveIcon, testId: 'nav-organization-volumes' },
      { label: 'Runners', path: '/runners', icon: ServerIcon, testId: 'nav-organization-runners' },
    ],
  },
  {
    id: 'networking',
    label: 'Networking',
    testId: 'nav-group-networking',
    sections: [
      {
        label: 'Private Networks',
        path: '/private-networks',
        icon: CableIcon,
        testId: 'nav-organization-private-networks',
      },
      {
        label: 'Private Resources',
        path: '/private-resources',
        icon: PlugIcon,
        testId: 'nav-organization-private-resources',
      },
      { label: 'Egress Rules', path: '/egress-rules', icon: NetworkIcon, testId: 'nav-organization-egress-rules' },
    ],
  },
  {
    id: 'llm',
    label: 'LLM',
    testId: 'nav-group-llm',
    sections: [
      { label: 'Providers', path: '/llm-providers', icon: BrainIcon, testId: 'nav-organization-llm-providers' },
      { label: 'Models', path: '/models', icon: SparklesIcon, testId: 'nav-organization-models' },
    ],
  },
  {
    id: 'credentials',
    label: 'Credentials',
    testId: 'nav-group-credentials',
    sections: [
      { label: 'Secrets', path: '/secrets', icon: KeyRoundIcon, testId: 'nav-organization-secrets' },
      {
        label: 'Secret Providers',
        path: '/secret-providers',
        icon: VaultIcon,
        testId: 'nav-organization-secret-providers',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    testId: 'nav-group-operations',
    sections: [
      { label: 'Threads', path: '/threads', icon: MessageSquareIcon, testId: 'nav-organization-threads' },
      { label: 'Instances', path: '/instances', icon: CpuIcon, testId: 'nav-organization-instances' },
      { label: 'Workloads', path: '/workloads', icon: ActivityIcon, testId: 'nav-organization-workloads' },
      { label: 'Sandboxes', path: '/sandboxes', icon: TerminalIcon, testId: 'nav-organization-sandboxes' },
      { label: 'Provisioned Storage', path: '/storage', icon: DatabaseIcon, testId: 'nav-organization-storage' },
      { label: 'Usage', path: '/usage', icon: LineChartIcon, testId: 'nav-organization-usage' },
    ],
  },
];
