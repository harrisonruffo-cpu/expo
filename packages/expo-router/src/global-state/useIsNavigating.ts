'use client';

import { use } from 'react';

import { NavigationPendingContext, PendingIntentsContext } from './routingQueueContext';

/**
 * Returns whether a navigation is queued or its state update is pending.
 *
 * The current screen can remain visible while this returns `true` if the destination suspends.
 * Returns `false` when called outside an Expo Router root.
 *
 * @experimental
 */
export function useIsNavigating(): boolean {
  return use(PendingIntentsContext).length > 0 || use(NavigationPendingContext);
}
