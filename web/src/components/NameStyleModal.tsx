'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { NameStyle, type NameFont, type NameEffect, type NameStyleData } from './NameStyle';

const FONTS: { id: NameFont; label: string }[] = [
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'gothic', label: 'Gothic' },
  { id: 'pixel', label: 'Pixel' },
];

// Colors-needed per effect, exactly as specified: Solid picks 1 from a
// full color picker; Gradient/Neon/Gummy each need exactly 2; Toon
// needs 1; Prism needs all 7.
const EFFECTS: { id: NameEffect; label: string; colorCount: number }[] = [
  { id: 'solid', label: 'Solid', colorCount: 1 },
  { id: 'gradient', label: 'Gradient', colorCount: 2 },
  { id: 'neon', label: 'Neon', colorCount: 2 },
  { id: 'toon', label: 'Toon / Pop', colorCount: 1 },
  { id: 'prism', label: 'Prism', colorCount: 7 },
  { id: 'gummy', label: 'Gummy', colorCount: 2 },
];

const DEFAULT_COLORS = ['#ff2a6d', '#05d9e8', '#f1fa8c', '#50fa7b', '#bd93f9', '#ff79c6', '#ffb86c'];

export function NameStyleModal({
  displayName,
  initial,
  onClose,
  onSave,
}: {
  displayName: string;
  initial: NameStyleData | null;
  onClose: () => void;
  onSave: (style: NameStyleData) => Promise<void>;
}) {
  const [font, setFont] = useState<NameFont>(initial?.font ?? 'sans');
  const [effect, setEffect] = useState<NameEffect>(initial?.effect ?? 'solid');
  const [colors, setColors] = useState<string[]>(
    initial?.colors && initial.colors.length > 0 ? initial.colors : DEFAULT_COLORS
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeEffect = EFFECTS.find((e) => e.id === effect)!;
  const previewColors = colors.slice(0, activeEffect.colorCount);

  function updateColor(index: number, value: string) {
    setColors((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave({ font, effect, colors: colors.slice(0, activeEffect.colorCount) });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-5 py-4">
          <h3 className="text-base font-semibold">Display Name Style</h3>
          <button onClick={onClose} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Live preview */}
        <div className="flex items-center justify-center border-b border-[var(--color-hairline)] bg-[var(--color-void)] py-8">
          <span className="text-3xl font-bold">
            <NameStyle name={displayName || 'YourName'} style={{ font, effect, colors: previewColors }} />
          </span>
        </div>

        <div className="max-h-[50vh] space-y-5 overflow-y-auto p-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{error}</div>
          )}

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Choose Font</div>
            <div className="grid grid-cols-4 gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFont(f.id)}
                  className={`flex h-12 items-center justify-center rounded-lg border text-base font-bold ${
                    font === f.id ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                  }`}
                >
                  <NameStyle name="Gg" style={{ font: f.id }} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">Choose Effect</div>
            <div className="grid grid-cols-3 gap-2">
              {EFFECTS.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEffect(e.id)}
                  className={`flex h-10 items-center justify-center rounded-lg border text-[12.5px] font-medium ${
                    effect === e.id ? 'border-[var(--presence-default-a)] bg-[var(--presence-default-a)]/10' : 'border-[var(--color-hairline)] hover:border-[var(--color-hairline-strong)]'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-faint)]">
              {activeEffect.colorCount === 1 ? 'Choose Colour' : `Choose ${activeEffect.colorCount} Colours`}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {Array.from({ length: activeEffect.colorCount }).map((_, i) => (
                <label key={i} className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-full border border-[var(--color-hairline-strong)]">
                  <input
                    type="color"
                    value={colors[i] ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                    onChange={(e) => updateColor(i, e.target.value)}
                    className="absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)] cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--color-hairline)] p-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-lg presence-fill py-2.5 text-[13.5px] font-semibold text-black disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save style'}
          </button>
        </div>
      </div>
    </div>
  );
}
