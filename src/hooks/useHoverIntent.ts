import { useCallback, useEffect, useRef, useState } from "react";

type UseHoverIntentOptions = {
  showDelay?: number;
  hideDelay?: number;
};

export function useHoverIntent({
  showDelay = 400,
  hideDelay = 120,
}: UseHoverIntentOptions = {}) {
  const [active, setActive] = useState(false);
  const showTimeoutRef = useRef<number | undefined>(undefined);
  const hideTimeoutRef = useRef<number | undefined>(undefined);

  const clearTimeouts = useCallback(() => {
    window.clearTimeout(showTimeoutRef.current);
    window.clearTimeout(hideTimeoutRef.current);
  }, []);

  const onMouseEnter = useCallback(() => {
    window.clearTimeout(hideTimeoutRef.current);
    showTimeoutRef.current = window.setTimeout(
      () => setActive(true),
      showDelay,
    );
  }, [showDelay]);

  const onMouseLeave = useCallback(() => {
    window.clearTimeout(showTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(
      () => setActive(false),
      hideDelay,
    );
  }, [hideDelay]);

  useEffect(() => () => clearTimeouts(), [clearTimeouts]);

  return {
    active,
    onMouseEnter,
    onMouseLeave,
    showImmediately: useCallback(() => {
      clearTimeouts();
      setActive(true);
    }, [clearTimeouts]),
    hideImmediately: useCallback(() => {
      clearTimeouts();
      setActive(false);
    }, [clearTimeouts]),
  };
}
