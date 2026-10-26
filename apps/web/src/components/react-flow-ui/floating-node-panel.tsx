import { useLayoutEffect, useRef, type ComponentProps, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
  hide,
  type Placement,
} from '@floating-ui/dom';

interface FloatingNodePanelProps extends ComponentProps<'div'> {
  reference: RefObject<HTMLDivElement | null>;
  isVisible: boolean;
  placement?: Placement;
  distance?: number;
}

/**
 * Local viewport-safety adapter for the vendored node UI. Floating UI performs
 * flip/shift/size and transform tracking; no bespoke placement/routing algorithm.
 * Portal outside the transformed canvas keeps text/actions screen-sized.
 */
export function FloatingNodePanel({
  reference,
  isVisible,
  placement = 'bottom',
  distance = 10,
  children,
  style,
  ...props
}: FloatingNodePanelProps) {
  const floating = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const anchor = reference.current;
    const panel = floating.current;
    if (!isVisible || !anchor || !panel) return;
    let alive = true;
    const boundary = anchor.closest<HTMLElement>('.react-flow') ?? document.documentElement;
    const update = () => {
      void computePosition(anchor, panel, {
        placement,
        strategy: 'fixed',
        middleware: [
          offset(distance),
          flip({ boundary, padding: 12, fallbackAxisSideDirection: 'start' }),
          shift({ boundary, padding: 12, crossAxis: true }),
          size({
            boundary,
            padding: 12,
            apply({ availableWidth, availableHeight, elements }) {
              Object.assign(elements.floating.style, {
                maxWidth: `${Math.max(0, Math.min(360, availableWidth))}px`,
                maxHeight: `${Math.max(0, Math.min(420, availableHeight))}px`,
              });
            },
          }),
          hide({ boundary, strategy: 'referenceHidden' }),
        ],
      }).then(({ x, y, placement: actual, middlewareData }) => {
        if (!alive) return;
        Object.assign(panel.style, {
          left: `${x}px`,
          top: `${y}px`,
          visibility: middlewareData.hide?.referenceHidden ? 'hidden' : 'visible',
        });
        panel.dataset.placement = actual;
      });
    };
    const cleanup = autoUpdate(anchor, panel, update, { animationFrame: true });
    return () => {
      alive = false;
      cleanup();
    };
  }, [reference, isVisible, placement, distance]);

  if (!isVisible) return null;
  return createPortal(
    <div
      {...props}
      ref={floating}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        visibility: 'hidden',
        zIndex: 70,
        overflow: 'auto',
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
