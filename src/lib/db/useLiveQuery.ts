import { useEffect, useRef, useState } from "react";

export type LiveQueryResult<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
};

/**
 * Reactive IndexedDB query. Re-runs whenever the BroadcastChannel for the
 * named store (or "*") fires.
 */
export function useLiveQuery<T>(
  storeName: string,
  query: () => Promise<T>,
  deps: unknown[] = [],
): LiveQueryResult<T> {
  const [state, setState] = useState<LiveQueryResult<T>>({
    data: undefined,
    loading: true,
    error: undefined,
  });
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const data = await queryRef.current();
        if (!cancelled) setState({ data, loading: false, error: undefined });
      } catch (err) {
        if (!cancelled) {
          setState({ data: undefined, loading: false, error: err as Error });
        }
      }
    };

    run();

    if (typeof BroadcastChannel === "undefined") {
      return () => {
        cancelled = true;
      };
    }

    const channels = [new BroadcastChannel(`db:${storeName}`), new BroadcastChannel("db:*")];
    for (const channel of channels) {
      channel.onmessage = () => {
        run();
      };
    }

    return () => {
      cancelled = true;
      for (const channel of channels) channel.close();
    };
  }, [storeName, ...deps]);

  return state;
}
