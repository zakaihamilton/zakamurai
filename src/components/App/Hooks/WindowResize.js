import { MOBILE_BREAKPOINT } from '@/constants/Layout';
import { useEffect, useRef } from 'react';

export function useWindowResize(appState, sidebarState) {
  const prevIsMobile = useRef(appState.isMobile);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileNow = window.innerWidth <= MOBILE_BREAKPOINT;
      appState((draft) => {
        if (draft.isMobile !== isMobileNow) {
          draft.isMobile = isMobileNow;
        }
      });
    };

    window.addEventListener('resize', checkMobile);
    checkMobile();
    return () => window.removeEventListener('resize', checkMobile);
  }, [appState]);

  useEffect(() => {
    if (!appState.isMobile && prevIsMobile.current) {
      if (sidebarState.isSidebarPopupOpen || sidebarState.isAIInputPopupOpen) {
        sidebarState((draft) => {
          draft.isSidebarPopupOpen = false;
          draft.isAIInputPopupOpen = false;
        });
      }
    }
    prevIsMobile.current = appState.isMobile;
  }, [appState.isMobile, sidebarState]);
}
