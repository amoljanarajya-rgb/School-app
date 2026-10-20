import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  initSyncEngine,
  enqueue,
  onSyncStateChange,
  triggerSync,
  getSyncState,
  cacheSet,
  cacheGet,
  type SyncOperation,
  type SyncState,
} from "@/lib/offlineSync";

let initialized = false;

function ensureInit() {
  if (initialized) return;
  initialized = true;
  initSyncEngine(async (op: SyncOperation) => {
    switch (op.operation) {
      case "insert": {
        const { error } = await supabase.from(op.table).insert(op.payload);
        if (error) throw new Error(error.message);
        break;
      }
      case "update": {
        const { id, ...rest } = op.payload;
        const { error } = await supabase.from(op.table).update(rest).eq("id", id as string);
        if (error) throw new Error(error.message);
        break;
      }
      case "delete": {
        const { error } = await supabase.from(op.table).delete().eq("id", op.payload.id as string);
        if (error) throw new Error(error.message);
        break;
      }
    }
  });
}

export function useOfflineSync() {
  const [state, setState] = useState<SyncState>(getSyncState());

  useEffect(() => {
    ensureInit();
    const unsub = onSyncStateChange(setState);
    return unsub;
  }, []);

  return {
    state,
    enqueue,
    triggerSync,
    cacheSet,
    cacheGet,
  };
}
