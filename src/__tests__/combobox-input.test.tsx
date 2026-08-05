import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ComboboxInput, type ComboboxOption } from '@/components/ComboboxInput';

const OPTIONS: ComboboxOption[] = [
  { value: '1.2.0', label: '1.2.0', description: 'Jan 1, 2026' },
  { value: '1.1.0', label: '1.1.0' },
  { value: 'latest', label: 'latest' },
];

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ComboboxInput value={value} onValueChange={setValue} options={OPTIONS} data-testid="combo" />
  );
}

describe('ComboboxInput', () => {
  afterEach(() => cleanup());

  it('opens on focus', async () => {
    render(<Harness />);
    fireEvent.focus(screen.getByTestId('combo'));
    expect(await screen.findByTestId('combo-option-1.2.0')).toBeTruthy();
  });

  // Filtering by a value that was picked narrows the list to that one option,
  // leaving nothing to switch to — the field looked like it had no alternatives.
  it('offers every option when the field already holds one', async () => {
    render(<Harness initial="1.2.0" />);
    fireEvent.focus(screen.getByTestId('combo'));

    expect(await screen.findByTestId('combo-option-1.1.0')).toBeTruthy();
    expect(screen.getByTestId('combo-option-latest')).toBeTruthy();
  });

  it('narrows to what is being typed', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId('combo'), { target: { value: '1.1' } });

    expect(await screen.findByTestId('combo-option-1.1.0')).toBeTruthy();
    expect(screen.queryByTestId('combo-option-latest')).toBeNull();
  });

  // A value nothing matches is still the answer: these lists are advisory.
  it('keeps a typed value that matches nothing', () => {
    render(<Harness />);
    const input = screen.getByTestId('combo') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'no-such-tag' } });

    expect(input.value).toBe('no-such-tag');
  });

  it('clears when the field is emptied', () => {
    render(<Harness initial="1.2.0" />);
    const input = screen.getByTestId('combo') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });

    expect(input.value).toBe('');
  });
});
