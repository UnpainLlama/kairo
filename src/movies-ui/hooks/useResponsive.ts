import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

interface ResponsiveState {
  width: number;
  isMobile: boolean;
  isDesktop: boolean;
}

function compute(): ResponsiveState {
  const width = window.innerWidth || document.documentElement.clientWidth || 0;
  const isMobile = width > 0 && width < MOBILE_BREAKPOINT;
  return {
    width,
    isMobile,
    isDesktop: !isMobile,
  };
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>(compute);

  useEffect(() => {
    const update = () => setState(compute());
    // Re-check on mount in case innerWidth was 0 during initial render (headless contexts)
    update();
    window.addEventListener('resize', update);
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mq.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      mq.removeEventListener('change', update);
    };
  }, []);

  return state;
}
