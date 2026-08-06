import { LaptopIcon, MoonIcon, SunIcon } from 'lucide-react';
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/components/theme-provider';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: LaptopIcon },
] as const;

/** Theme picker, rendered inside the user menu. */
export function ThemeMenuItems() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const themeLabel = THEME_OPTIONS.find((option) => option.value === theme)?.label ?? 'System';
  // The trigger shows what is actually rendered, so "System" still reads.
  const TriggerIcon = resolvedTheme === 'dark' ? MoonIcon : SunIcon;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-testid="theme-menu-trigger">
        <TriggerIcon className="h-4 w-4" />
        <span className="flex-1">Theme</span>
        <span className="text-muted-foreground">{themeLabel}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} data-testid={`theme-${value}`}>
              <Icon className="h-4 w-4" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
