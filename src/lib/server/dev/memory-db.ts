import "server-only";
import { randomBytes } from "node:crypto";
import { FieldPath, Timestamp } from "firebase-admin/firestore";

/**
 * In-memory stand-in for Firestore, used ONLY in DEMO_MODE (never in production).
 * Implements just the surface the server code uses. Transactions are optimistic like Firestore's:
 * every read records a document version and a commit whose reads went stale is retried.
 * It does not prove anything about real Firestore behaviour, cost or indexes.
 */

type Data = Record<string, unknown>;
interface Row {
  data: Data;
  version: number;
}

const MAX_RETRIES = 5;

function clone<T>(v: T): T {
  if (v instanceof Timestamp || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(clone) as T;
  return Object.fromEntries(Object.entries(v as Data).map(([k, x]) => [k, clone(x)])) as T;
}

const compareValue = (a: unknown, b: unknown): number => {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

class Store {
  readonly cols = new Map<string, Map<string, Row>>();
  col(name: string): Map<string, Row> {
    let c = this.cols.get(name);
    if (!c) this.cols.set(name, (c = new Map()));
    return c;
  }
}

// Survives dev hot-reloads of this module.
const g = globalThis as unknown as { __memStore?: Store };
const store = (g.__memStore ??= new Store());

class Snap {
  readonly exists: boolean;
  constructor(
    readonly ref: Ref,
    private readonly row: Row | undefined,
  ) {
    this.exists = row !== undefined;
  }
  get id() {
    return this.ref.id;
  }
  data(): Data | undefined {
    return this.row ? clone(this.row.data) : undefined;
  }
  get(field: string): unknown {
    return this.row?.data[field];
  }
}

class Ref {
  constructor(
    readonly col: string,
    readonly id: string,
  ) {}
  get path() {
    return `${this.col}/${this.id}`;
  }
  async get(): Promise<Snap> {
    return new Snap(this, store.col(this.col).get(this.id));
  }
}

type Order = { field: string | FieldPath; dir: "asc" | "desc" };

class Query {
  constructor(
    private readonly col: string,
    private readonly filters: [string, unknown][] = [],
    private readonly orders: Order[] = [],
    private readonly max = Infinity,
    private readonly after: unknown[] | null = null,
  ) {}
  where(field: string, op: string, value: unknown) {
    if (op !== "==") throw new Error("memory-db: only == supported");
    return new Query(this.col, [...this.filters, [field, value]], this.orders, this.max, this.after);
  }
  orderBy(field: string | FieldPath, dir: "asc" | "desc" = "asc") {
    return new Query(this.col, this.filters, [...this.orders, { field, dir }], this.max, this.after);
  }
  limit(n: number) {
    return new Query(this.col, this.filters, this.orders, n, this.after);
  }
  startAfter(...vals: unknown[]) {
    return new Query(this.col, this.filters, this.orders, this.max, vals);
  }
  async get() {
    const val = (id: string, row: Row, f: string | FieldPath) => (f instanceof FieldPath ? id : row.data[f]);
    let rows = [...store.col(this.col).entries()].filter(([, r]) => this.filters.every(([f, v]) => compareValue(r.data[f], v) === 0));
    const cmp = (aId: string, a: Row, bVals: unknown[] | null, bId: string, b: Row | null) => {
      for (const [i, o] of this.orders.entries()) {
        const x = val(aId, a, o.field);
        const y = bVals ? bVals[i] : val(bId, b as Row, o.field);
        const c = compareValue(x, y) * (o.dir === "desc" ? -1 : 1);
        if (c !== 0) return c;
      }
      return 0;
    };
    rows.sort(([aId, a], [bId, b]) => cmp(aId, a, null, bId, b));
    const cursor = this.after;
    if (cursor) rows = rows.filter(([id, r]) => cmp(id, r, cursor, "", null) > 0);
    return { docs: rows.slice(0, this.max).map(([id, r]) => new Snap(new Ref(this.col, id), r)) };
  }
}

class Collection extends Query {
  constructor(private readonly name: string) {
    super(name);
  }
  doc(id?: string) {
    return new Ref(this.name, id ?? randomBytes(15).toString("base64url"));
  }
}

class Tx {
  private reads = new Map<string, number>();
  private writes: { ref: Ref; kind: "create" | "set" | "update"; data: Data; merge?: boolean }[] = [];

  async get(ref: Ref): Promise<Snap> {
    const row = store.col(ref.col).get(ref.id);
    this.reads.set(ref.path, row?.version ?? 0);
    return new Snap(ref, row);
  }
  create(ref: Ref, data: Data) {
    this.writes.push({ ref, kind: "create", data: clone(data) });
  }
  set(ref: Ref, data: Data, opts?: { merge?: boolean }) {
    this.writes.push({ ref, kind: "set", data: clone(data), merge: opts?.merge });
  }
  update(ref: Ref, data: Data) {
    this.writes.push({ ref, kind: "update", data: clone(data) });
  }

  /** Returns false when a document read by this transaction changed meanwhile. */
  commit(): boolean {
    for (const [path, version] of this.reads) {
      const [col, id] = path.split("/") as [string, string];
      if ((store.col(col).get(id)?.version ?? 0) !== version) return false;
    }
    for (const w of this.writes) {
      const exists = store.col(w.ref.col).has(w.ref.id);
      if (w.kind === "create" && exists) throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 });
      if (w.kind === "update" && !exists) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
    }
    for (const w of this.writes) {
      const c = store.col(w.ref.col);
      const prev = c.get(w.ref.id);
      const data = w.kind === "update" || (w.kind === "set" && w.merge) ? { ...(prev?.data ?? {}), ...w.data } : w.data;
      c.set(w.ref.id, { data, version: (prev?.version ?? 0) + 1 });
    }
    return true;
  }
}

export function createMemoryDb() {
  return {
    collection: (name: string) => new Collection(name),
    getAll: async (...refs: Ref[]) => Promise.all(refs.map((r) => r.get())),
    async runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const tx = new Tx();
        const result = await fn(tx);
        if (tx.commit()) return result;
      }
      throw Object.assign(new Error("ABORTED"), { code: 10 });
    },
  };
}
