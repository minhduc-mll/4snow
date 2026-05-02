"use client";

import { useEffect, useState } from "react";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  type RealtimeChannel,
  type RealtimePostgresChangesFilter,
  type RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type RealtimeStatus =
  | "idle"
  | "subscribing"
  | "subscribed"
  | "closed"
  | "timed_out"
  | "error";

export type RealtimeRecord = Record<string, unknown>;
export type RealtimePostgresEvent = `${REALTIME_POSTGRES_CHANGES_LISTEN_EVENT}`;

export interface RealtimePostgresOptions<TRecord extends RealtimeRecord> {
  type: "postgres";
  channelName: string;
  table: string;
  schema?: string;
  event?: RealtimePostgresEvent;
  filter?: string;
  enabled?: boolean;
  onChange: (payload: RealtimePostgresChangesPayload<TRecord>) => void;
}

export interface RealtimeBroadcastOptions<TPayload extends RealtimeRecord> {
  type: "broadcast";
  channelName: string;
  event: string;
  enabled?: boolean;
  onMessage: (payload: TPayload) => void;
}

export type UseRealtimeOptions<
  TRecord extends RealtimeRecord,
  TBroadcastPayload extends RealtimeRecord,
> =
  | RealtimePostgresOptions<TRecord>
  | RealtimeBroadcastOptions<TBroadcastPayload>;

export interface UseRealtimeResult {
  status: RealtimeStatus;
  channel: RealtimeChannel | null;
}

function getSubscriptionStatus(status: string): RealtimeStatus {
  if (status === "SUBSCRIBED") {
    return "subscribed";
  }

  if (status === "TIMED_OUT") {
    return "timed_out";
  }

  if (status === "CLOSED") {
    return "closed";
  }

  if (status === "CHANNEL_ERROR") {
    return "error";
  }

  return "subscribing";
}

export function useRealtime<
  TRecord extends RealtimeRecord = RealtimeRecord,
  TBroadcastPayload extends RealtimeRecord = RealtimeRecord,
>(
  options: UseRealtimeOptions<TRecord, TBroadcastPayload>,
): UseRealtimeResult {
  const [status, setStatus] = useState<RealtimeStatus>("subscribing");
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const shouldSubscribe = options.enabled !== false && isSupabaseConfigured;

  useEffect(() => {
    if (!shouldSubscribe) {
      return;
    }

    const realtimeChannel = supabase.channel(options.channelName, {
      config: {
        broadcast: {
          ack: false,
          self: false,
        },
      },
    });

    if (options.type === "postgres") {
      const postgresFilter: RealtimePostgresChangesFilter<RealtimePostgresEvent> =
        {
          event: options.event ?? REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.ALL,
          schema: options.schema ?? "public",
          table: options.table,
          filter: options.filter,
        };

      realtimeChannel.on<TRecord>(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        postgresFilter,
        options.onChange,
      );
    }

    if (options.type === "broadcast") {
      realtimeChannel.on<TBroadcastPayload>(
        REALTIME_LISTEN_TYPES.BROADCAST,
        { event: options.event },
        ({ payload }) => options.onMessage(payload),
      );
    }

    realtimeChannel.subscribe((subscriptionStatus) => {
      setChannel(realtimeChannel);
      setStatus(getSubscriptionStatus(subscriptionStatus));
    });

    return () => {
      setChannel(null);
      void supabase.removeChannel(realtimeChannel);
    };
  }, [options, shouldSubscribe]);

  return {
    status: shouldSubscribe ? status : "idle",
    channel: shouldSubscribe ? channel : null,
  };
}
