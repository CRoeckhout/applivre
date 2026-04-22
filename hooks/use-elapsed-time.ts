import { useTimer } from '@/store/timer';
import { useEffect, useState } from 'react';

function computeElapsed(active: NonNullable<ReturnType<typeof useTimer.getState>['active']>): number {
  const endTime = active.pausedAt ?? Date.now();
  return Math.max(0, Math.floor((endTime - active.startedAt - active.accumulatedPausedMs) / 1000));
}

export function useElapsedTime(): number {
  const active = useTimer((s) => s.active);
  const [elapsedSec, setElapsedSec] = useState(() => (active ? computeElapsed(active) : 0));

  useEffect(() => {
    if (!active) {
      setElapsedSec(0);
      return;
    }

    setElapsedSec(computeElapsed(active));

    if (active.pausedAt !== null) return;

    const interval = setInterval(() => setElapsedSec(computeElapsed(active)), 1000);
    return () => clearInterval(interval);
  }, [active]);

  return elapsedSec;
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDurationHuman(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
