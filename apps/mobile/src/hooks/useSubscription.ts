import { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getMe } from '@/lib/api';

export type SubscriptionStatus = 'loading' | 'free' | 'active';

interface UseSubscriptionResult {
  status: SubscriptionStatus;
  isSubscribed: boolean;
  refresh: () => Promise<void>;
}

export function useSubscription(session: Session | null): UseSubscriptionResult {
  const [status, setStatus] = useState<SubscriptionStatus>('loading');

  const fetchStatus = useCallback(async () => {
    if (!session) {
      setStatus('free');
      return;
    }
    try {
      const me = await getMe(session.access_token);
      setStatus(me.subscriptionStatus === 'active' ? 'active' : 'free');
    } catch {
      // On network/API errors, default to free so the app remains usable.
      // A paying subscriber may briefly see the paywall — acceptable tradeoff
      // vs. blocking all users when the API is down.
      setStatus('free');
    }
  }, [session]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    isSubscribed: status === 'active',
    refresh: fetchStatus,
  };
}
