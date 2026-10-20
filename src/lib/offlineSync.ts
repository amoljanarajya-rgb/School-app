// Offline-first sync engine using IndexedDB as a local database.
// Records are queued locally when offline and flushed to Supabase
// when connectivity is restored. Mirrors the SQLite/local-DB pattern
// described in the Flutter / .NET MAUI reference implementations.

const DB_NAME = "school_erp_offline";
const DB_VERSION = 1;
const STORE_QUEUE = "sync_queue";
const STORE_CACHE = "local_cache";

export type SyncOperation = {
  id: string;
  table: string;
  operation: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
  last_error?: string | null;
};

type SyncHandler = (op: SyncOperation) => Promise<void>;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: "id" });
        store.createIndex("table", "table", { unique: false });
        store.createIndex("created_at", "created_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txStore(db: IDBDatabase, store: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Queue operations ──────────────────────────────────────────────────────

export async function enqueue(op: Omit<SyncOperation, "id" | "created_at" | "attempts">): Promise<SyncOperation> {
  const db = await openDB();
  const full: SyncOperation = {
    ...op,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    attempts: 0,
  };
  await reqToPromise(txStore(db, STORE_QUEUE, "readwrite").add(full));
  notifySyncState();
  return full;
}

export async function getQueuedOps(): Promise<SyncOperation[]> {
  const db = await openDB();
  return reqToPromise(
    txStore(db, STORE_QUEUE, "readonly").getAll() as IDBRequest<SyncOperation[]>,
  );
}

export async function removeOp(id: string): Promise<void> {
  const db = await openDB();
  await reqToPromise(txStore(db, STORE_QUEUE, "readwrite").delete(id));
  notifySyncState();
}

export async function markOpError(id: string, error: string): Promise<void> {
  const db = await openDB();
  const store = txStore(db, STORE_QUEUE, "readwrite");
  const existing = await reqToPromise(store.get(id) as IDBRequest<SyncOperation | undefined>);
  if (existing) {
    existing.attempts += 1;
    existing.last_error = error;
    await reqToPromise(store.put(existing));
  }
}

// ── Local cache (for offline reads) ───────────────────────────────────────

export async function cacheSet(key: string, data: unknown): Promise<void> {
  const db = await openDB();
  await reqToPromise(
    txStore(db, STORE_CACHE, "readwrite").put({ key, data, updated_at: new Date().toISOString() }),
  );
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  const row = await reqToPromise(
    txStore(db, STORE_CACHE, "readonly").get(key) as IDBRequest<{ key: string; data: T } | undefined>,
  );
  return row?.data ?? null;
}

// ── Background sync ───────────────────────────────────────────────────────

let syncHandler: SyncHandler | null = null;
let syncing = false;
let online = typeof navigator === "undefined" ? true : navigator.onLine;

const listeners = new Set<(state: SyncState) => void>();

export type SyncState = {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSync: string | null;
  lastError: string | null;
};

let currentState: SyncState = {
  online,
  syncing: false,
  pending: 0,
  lastSync: null,
  lastError: null,
};

export function getSyncState(): SyncState {
  return currentState;
}

export function onSyncStateChange(cb: (state: SyncState) => void): () => void {
  listeners.add(cb);
  cb(currentState);
  return () => listeners.delete(cb);
}

function notifySyncState() {
  getQueuedOps().then((ops) => {
    currentState = { ...currentState, pending: ops.length };
    listeners.forEach((cb) => cb(currentState));
  });
}

export function initSyncEngine(handler: SyncHandler): void {
  syncHandler = handler;

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { online = true; currentState = { ...currentState, online: true }; flush(); });
    window.addEventListener("offline", () => { online = false; currentState = { ...currentState, online: false }; listeners.forEach((cb) => cb(currentState)); });
  }

  // Periodic retry every 30 seconds
  setInterval(() => {
    if (online && !syncing) flush();
  }, 30000);

  // Initial flush attempt
  notifySyncState();
  if (online) flush();
}

async function flush(): Promise<void> {
  if (!syncHandler || syncing || !online) return;
  syncing = true;
  currentState = { ...currentState, syncing: true, lastError: null };
  listeners.forEach((cb) => cb(currentState));

  try {
    const ops = await getQueuedOps();
    for (const op of ops) {
      try {
        await syncHandler(op);
        await removeOp(op.id);
      } catch (e) {
        await markOpError(op.id, e instanceof Error ? e.message : String(e));
        currentState = { ...currentState, lastError: e instanceof Error ? e.message : String(e) };
        break; // stop on first error, retry later
      }
    }
    currentState = { ...currentState, lastSync: new Date().toISOString(), syncing: false };
  } finally {
    syncing = false;
    currentState = { ...currentState, syncing: false };
    notifySyncState();
    listeners.forEach((cb) => cb(currentState));
  }
}

export function triggerSync(): void {
  if (online && !syncing) flush();
}
