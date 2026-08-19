'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Circle, Square } from 'lucide-react';

const MAX_DURATION_SECONDS = 30;

// Picks the first mime type the browser's MediaRecorder actually
// supports — Safari and Chrome don't agree on this, and passing an
// unsupported type to `new MediaRecorder(stream, { mimeType })` throws
// synchronously rather than falling back on its own.
function pickSupportedMimeType(): string | null {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return null;
}

export function VideoRecorderModal({
  onCapture,
  onClose,
}: {
  onCapture: (file: File, durationSeconds: number) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<'requesting' | 'preview' | 'recording' | 'error'>('requesting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setPhase('preview');
      })
      .catch((e) => {
        if (cancelled) return;
        setPhase('error');
        setErrorMsg(
          e instanceof Error && e.name === 'NotAllowedError'
            ? 'Camera access was denied — allow camera/mic access to record a video story.'
            : 'Could not access your camera.'
        );
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  function startRecording() {
    if (!streamRef.current) return;
    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setPhase('error');
      setErrorMsg('Video recording is not supported in this browser.');
      return;
    }
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const durationSeconds = Math.min(MAX_DURATION_SECONDS, (Date.now() - startedAtRef.current) / 1000);
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `story.${ext}`, { type: mimeType.split(';')[0] });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCapture(file, Math.round(durationSeconds));
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    recorder.start();
    setPhase('recording');
    setElapsed(0);

    // Hard cap enforced here, during recording — not just validated
    // after the fact. Recording is force-stopped the instant it hits
    // MAX_DURATION_SECONDS, same as the spec asked for.
    tickRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 0.1;
        return next;
      });
    }, 100);
    stopTimerRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_DURATION_SECONDS * 1000);
  }

  function stopRecording() {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    recorderRef.current?.stop();
  }

  function handleClose() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    onClose();
  }

  const remaining = Math.max(0, MAX_DURATION_SECONDS - elapsed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-hairline-strong)] bg-[var(--color-surface)]">
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="relative aspect-[9/16] w-full bg-black">
          {phase === 'error' ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-[var(--color-ink-muted)]">{errorMsg}</div>
          ) : (
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          )}

          {phase === 'recording' && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              {remaining.toFixed(1)}s left
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 p-4">
          {phase === 'preview' && (
            <button
              onClick={startRecording}
              className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-red-500 hover:bg-red-600"
              aria-label="Start recording"
            >
              <Circle size={20} fill="white" className="text-white" />
            </button>
          )}
          {phase === 'recording' && (
            <button
              onClick={stopRecording}
              className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-overlay)]"
              aria-label="Stop recording"
            >
              <Square size={18} fill="currentColor" className="text-red-500" />
            </button>
          )}
          {phase === 'requesting' && <div className="py-3 text-[13px] text-[var(--color-ink-muted)]">Requesting camera access…</div>}
        </div>
        <p className="pb-4 text-center text-[11px] text-[var(--color-ink-faint)]">Up to {MAX_DURATION_SECONDS} seconds · tap to stop early</p>
      </div>
    </div>
  );
}
