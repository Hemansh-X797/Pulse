'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface CropModalProps {
  file: File;
  kind: 'avatar' | 'banner';
  onCancel: () => void;
  onApply: (blob: Blob) => void;
}

// Avatar exports square (matches how it's displayed everywhere — CSS
// rounds it to a circle at render time, same approach Discord's own
// cropper uses under the hood despite showing a circular guide).
// Banner exports a 3:1 rectangle, matching the banner's actual display
// aspect ratio in Settings/Profile.
const OUTPUT = {
  avatar: { width: 512, height: 512, mask: 'circle' as const },
  banner: { width: 960, height: 320, mask: 'rect' as const },
};

export function CropModal({ file, kind, onCancel, onApply }: CropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragging = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);

  const { width: outW, height: outH, mask } = OUTPUT[kind];
  const displaySize = { width: 340, height: (outH / outW) * 340 };

  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load the file into an <img>, compute the "cover fit" minimum scale
  // (the smallest zoom where the image still fully covers the crop
  // frame in both dimensions), and center it.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const coverScale = Math.max(displaySize.width / img.width, displaySize.height / img.height);
      setMinScale(coverScale);
      setScale(coverScale);
      setOffset({ x: 0, y: 0 });
      setReady(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Redraw whenever pan/zoom changes.
  useEffect(() => {
    if (!ready || !canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = imgRef.current;

    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const cx = displaySize.width / 2 + offset.x;
    const cy = displaySize.height / 2 + offset.y;
    ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  }, [ready, scale, offset, displaySize.width, displaySize.height]);

  function clampOffset(next: { x: number; y: number }, currentScale: number) {
    if (!imgRef.current) return next;
    const drawW = imgRef.current.width * currentScale;
    const drawH = imgRef.current.height * currentScale;
    const maxX = Math.max(0, (drawW - displaySize.width) / 2);
    const maxY = Math.max(0, (drawH - displaySize.height) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }

  function handlePointerDown(e: React.PointerEvent) {
    dragging.current = { startX: e.clientX, startY: e.clientY, startOffX: offset.x, startOffY: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - dragging.current.startX;
    const dy = e.clientY - dragging.current.startY;
    setOffset(clampOffset({ x: dragging.current.startOffX + dx, y: dragging.current.startOffY + dy }, scale));
  }
  function handlePointerUp() {
    dragging.current = null;
  }

  function handleScaleChange(next: number) {
    setScale(next);
    setOffset((prev) => clampOffset(prev, next));
  }

  function handleApply() {
    if (!imgRef.current) return;
    setExporting(true);
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = outW;
    exportCanvas.height = outH;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Map the display-canvas crop transform to the full-resolution
    // export size (same center/offset/scale, just scaled up).
    const exportScale = scale * (outW / displaySize.width);
    const drawW = imgRef.current.width * exportScale;
    const drawH = imgRef.current.height * exportScale;
    const cx = outW / 2 + offset.x * (outW / displaySize.width);
    const cy = outH / 2 + offset.y * (outW / displaySize.width);
    ctx.drawImage(imgRef.current, cx - drawW / 2, cy - drawH / 2, drawW, drawH);

    exportCanvas.toBlob(
      (blob) => {
        setExporting(false);
        if (blob) onApply(blob);
      },
      'image/png',
      0.92
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface-overlay)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">Edit image</h3>
          <button onClick={onCancel} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]" aria-label="Cancel">
            <X size={18} />
          </button>
        </div>

        <div
          className="relative mx-auto touch-none select-none overflow-hidden rounded-lg bg-black"
          style={{ width: displaySize.width, height: displaySize.height, cursor: 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <canvas ref={canvasRef} />
          {/* Crop guide overlay — visual only, doesn't affect the export math above */}
          <div
            className="pointer-events-none absolute inset-0 border-2 border-white/80"
            style={mask === 'circle' ? { borderRadius: '9999px', margin: 4 } : { margin: 4 }}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-[11px] text-[var(--color-ink-faint)]">Zoom</span>
          <input
            type="range"
            min={minScale}
            max={minScale * 3}
            step={0.01}
            value={scale}
            onChange={(e) => handleScaleChange(Number(e.target.value))}
            className="flex-1 accent-[var(--presence-default-a)]"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-full px-4 py-2 text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!ready || exporting}
            className="rounded-full bg-[var(--color-ink)] px-5 py-2 text-[13px] font-semibold text-black disabled:opacity-40"
          >
            {exporting ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}
