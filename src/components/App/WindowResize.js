import { MOBILE_BREAKPOINT } from '@/constants/Layout';
import { useEffect, useRef } from 'react';

export function useWindowResize(appState, sidebarState) {
  const prevIsMobile = useRef(null);

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
    const enteredMobile = appState.isMobile && prevIsMobile.current !== true;
    const leftMobile = !appState.isMobile && prevIsMobile.current === true;

    if (enteredMobile) {
      if (sidebarState.isSidebarPopupOpen || sidebarState.isAIInputPopupOpen) {
        sidebarState((draft) => {
          draft.isSidebarPopupOpen = false;
          draft.isAIInputPopupOpen = false;
        });
      }
    } else if (leftMobile) {
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
