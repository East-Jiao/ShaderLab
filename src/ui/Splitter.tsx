import { useCallback, useRef } from 'react';
import { useStore } from '../state/store';

export function Splitter({ dir }: { dir: 'v' | 'h' }) {
  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSize = useRef(0);
  const which = useRef<'leftW' | 'rightW' | 'bottomH'>('leftW');

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;
    const s = useStore.getState();
    if (which.current === 'bottomH') {
      const delta = startPos.current - e.clientY;
      s.setLayout('bottomH', Math.max(140, Math.min(600, startSize.current + delta)));
    } else if (which.current === 'leftW') {
      const delta = e.clientX - startPos.current;
      s.setLayout('leftW', Math.max(200, Math.min(460, startSize.current + delta)));
    } else {
      const delta = startPos.current - e.clientX;
      s.setLayout('rightW', Math.max(240, Math.min(520, startSize.current + delta)));
    }
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  const onPointerDown = (kind: 'leftW' | 'rightW' | 'bottomH') => (e: React.PointerEvent) => {
    dragging.current = true;
    which.current = kind;
    startPos.current = kind === 'bottomH' ? e.clientY : e.clientX;
    startSize.current = useStore.getState()[kind];
    document.body.style.cursor = kind === 'bottomH' ? 'row-resize' : 'col-resize';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div
      className={`splitter ${dir}`}
      onPointerDown={(e) => {
        // 依据位置判断拖的是哪条分割线
        const target = e.currentTarget as HTMLElement;
        const prev = target.previousElementSibling as HTMLElement | null;
        const next = target.nextElementSibling as HTMLElement | null;
        let kind: 'leftW' | 'rightW' | 'bottomH' = 'leftW';
        if (dir === 'h') kind = 'bottomH';
        else if (prev?.classList.contains('left-panel') && next?.classList.contains('viewport')) kind = 'leftW';
        else kind = 'rightW';
        onPointerDown(kind)(e);
      }}
    />
  );
}
