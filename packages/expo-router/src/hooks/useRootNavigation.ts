'use client';

import { navigationRef } from '../global-state/navigationRef';

/**
 * @deprecated Use [`useNavigationContainerRef`](#usenavigationcontainerref) instead,
 * which returns a React `ref`.
 */
export function useRootNavigation() {
  return navigationRef.current;
}
