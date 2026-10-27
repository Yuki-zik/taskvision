// Vendored from https://ui.reactflow.dev/node-tooltip (MIT, xyflow).
// Import path adapted locally; see third_party/react-flow-ui/README.md.
// Accessibility patches: compose caller handlers after spreading props; retain
// hover/focus across the portal; Enter enters content, Escape dismisses and
// restores trigger focus; use natural tab order instead of upstream tabIndex=1.
// Floating UI bounds the portalled detail panel to the current canvas/viewport.
'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { Position, type NodeToolbarProps } from '@xyflow/react';
import { FloatingNodePanel } from './floating-node-panel';

import { cn } from '../../lib/utils';

/* TOOLTIP CONTEXT ---------------------------------------------------------- */

type TooltipContextType = {
  isVisible: boolean;
  showTooltip: () => void;
  hideTooltip: () => void;
  dismissTooltip: () => void;
  focusTooltip: () => void;
  tooltipId: string;
  triggerRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
};

const TooltipContext = createContext<TooltipContextType | null>(null);
// Closing a portal can expose another node under a stationary cursor. Do not
// immediately replace the dismissed dialog with that node's hover dialog.
let hoverSuppressed = false;
const releaseHover = () => {
  hoverSuppressed = false;
};
function suppressHoverUntilPointerMoves() {
  hoverSuppressed = true;
  window.addEventListener('pointermove', releaseHover, { once: true, capture: true });
}

/* TOOLTIP NODE ------------------------------------------------------------- */

export function NodeTooltip({ children, ...props }: ComponentProps<'div'>) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const focusFrame = useRef<number | undefined>(undefined);
  const dismissed = useRef(false);

  const showTooltip = useCallback(() => {
    clearTimeout(closeTimer.current);
    if (!dismissed.current && !hoverSuppressed) setIsVisible(true);
  }, []);
  const hideTooltip = useCallback(() => {
    clearTimeout(closeTimer.current);
    // The toolbar is portalled and separated by a small physical pointer gap.
    closeTimer.current = setTimeout(() => {
      const surfaces = [triggerRef.current, contentRef.current?.parentElement];
      if (
        surfaces.some(
          (surface) => surface?.contains(document.activeElement) || surface?.matches(':hover'),
        )
      )
        return;
      dismissed.current = false;
      setIsVisible(false);
    }, 220);
  }, []);
  const dismissTooltip = useCallback(() => {
    clearTimeout(closeTimer.current);
    dismissed.current = true;
    suppressHoverUntilPointerMoves();
    setIsVisible(false);
  }, []);
  const focusTooltip = useCallback(() => {
    hoverSuppressed = false;
    dismissed.current = false;
    clearTimeout(closeTimer.current);
    setIsVisible(true);
    if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      const firstAction = contentRef.current?.querySelector<HTMLElement>(
        'button:not(:disabled), a[href], [tabindex="0"]',
      );
      (firstAction ?? contentRef.current)?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(
    () => () => {
      clearTimeout(closeTimer.current);
      if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    },
    [],
  );
  useEffect(() => {
    if (!isVisible) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(closeTimer.current);
      dismissed.current = true;
      suppressHoverUntilPointerMoves();
      if (contentRef.current?.contains(document.activeElement)) {
        // The sole node focus target is React Flow's ancestor wrapper. Inner
        // source controls can be hidden by semantic zoom, so never focus them.
        const node = triggerRef.current?.closest<HTMLElement>('.react-flow__node[tabindex="0"]');
        (node ?? triggerRef.current)?.focus({ preventScroll: true });
      }
      setIsVisible(false);
    };
    document.addEventListener('keydown', dismiss, true);
    return () => document.removeEventListener('keydown', dismiss, true);
  }, [isVisible]);

  return (
    <TooltipContext.Provider
      value={{
        isVisible,
        showTooltip,
        hideTooltip,
        dismissTooltip,
        focusTooltip,
        tooltipId,
        triggerRef,
        contentRef,
      }}
    >
      <div {...props}>{children}</div>
    </TooltipContext.Provider>
  );
}

/* TOOLTIP TRIGGER ---------------------------------------------------------- */

export function NodeTooltipTrigger(props: ComponentProps<'div'>) {
  const tooltipContext = useContext(TooltipContext);
  if (!tooltipContext) {
    throw new Error('NodeTooltipTrigger must be used within NodeTooltip');
  }
  const {
    showTooltip,
    hideTooltip,
    dismissTooltip,
    focusTooltip,
    isVisible,
    tooltipId,
    triggerRef,
  } = tooltipContext;

  const onMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      props.onMouseEnter?.(e);
      showTooltip();
    },
    [props, showTooltip],
  );

  const onMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      props.onMouseLeave?.(e);
      hideTooltip();
    },
    [props, hideTooltip],
  );

  return (
    <div
      {...props}
      ref={triggerRef}
      aria-describedby={isVisible ? tooltipId : props['aria-describedby']}
      onMouseEnter={onMouseEnter}
      onPointerMove={(event) => {
        props.onPointerMove?.(event);
        // Native pointermove releases the global Escape suppression before
        // this handler. Reopen for the genuinely new hovered node even when
        // mouseenter arrived before that movement event.
        if (!event.defaultPrevented) showTooltip();
      }}
      onMouseLeave={onMouseLeave}
      onClickCapture={(event) => {
        props.onClickCapture?.(event);
        // Source/drill/expand actions must not leave a focused hover panel
        // covering the newly revealed file node. Keep the action's focus;
        // close only this supplementary panel, not the actual inspector.
        if ((event.target as HTMLElement).closest('button, a')) dismissTooltip();
      }}
      onFocus={(event) => {
        props.onFocus?.(event);
        if (!event.defaultPrevented) showTooltip();
      }}
      onBlur={(event) => {
        props.onBlur?.(event);
        hideTooltip();
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        // Preserve native activation for source/drill/expand buttons.
        if (
          !event.defaultPrevented &&
          event.key === 'Enter' &&
          !(event.target as HTMLElement).closest('button, a, input, textarea, select')
        ) {
          event.preventDefault();
          event.stopPropagation();
          focusTooltip();
        }
      }}
    />
  );
}

/* TOOLTIP CONTENT ---------------------------------------------------------- */

export function NodeTooltipContent({
  children,
  position = Position.Bottom,
  offset = 10,
  className,
  nodeId: _nodeId,
  align: _align,
  isVisible: _visible,
  ...props
}: NodeToolbarProps) {
  const tooltipContext = useContext(TooltipContext);
  if (!tooltipContext) {
    throw new Error('NodeTooltipContent must be used within NodeTooltip');
  }
  const { isVisible, showTooltip, hideTooltip, dismissTooltip, tooltipId, contentRef, triggerRef } =
    tooltipContext;

  return (
    <div>
      <FloatingNodePanel
        {...props}
        reference={triggerRef}
        isVisible={isVisible}
        className={cn('bg-primary text-primary-foreground rounded-sm p-2', className)}
        placement={position}
        distance={offset}
        role={props.role ?? 'dialog'}
        id={tooltipId}
        tabIndex={-1}
        onMouseEnter={(event) => {
          props.onMouseEnter?.(event);
          showTooltip();
        }}
        onMouseLeave={(event) => {
          props.onMouseLeave?.(event);
          hideTooltip();
        }}
        onClickCapture={(event) => {
          props.onClickCapture?.(event);
          if ((event.target as HTMLElement).closest('button, a')) dismissTooltip();
        }}
        onFocus={(event) => {
          props.onFocus?.(event);
          if (!event.defaultPrevented) showTooltip();
        }}
        onBlur={(event) => {
          props.onBlur?.(event);
          hideTooltip();
        }}
      >
        <div ref={contentRef} tabIndex={-1}>
          {children}
        </div>
      </FloatingNodePanel>
    </div>
  );
}
