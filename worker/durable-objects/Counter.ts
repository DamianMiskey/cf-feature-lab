import { DurableObject } from "cloudflare:workers";

// One Counter instance exists per name, anywhere in the world. Every request for
// "global" reaches the same instance, and it handles them one at a time, so
// increments can never race. That's the guarantee KV can't give you.
export class Counter extends DurableObject<Env> {
  // Public methods can be called straight from the Worker over RPC:
  //   await env.COUNTER.getByName("global").increment()
  increment(by = 1): number {
    // ctx.storage.kv is the synchronous key-value API of SQLite-backed objects.
    // It's synchronous because the database lives in the same thread as this code.
    const value = (this.ctx.storage.kv.get<number>("count") ?? 0) + by;
    this.ctx.storage.kv.put("count", value);
    return value;
  }

  get(): { name: string | undefined; id: string; count: number } {
    return {
      name: this.ctx.id.name,
      id: this.ctx.id.toString(),
      count: this.ctx.storage.kv.get<number>("count") ?? 0,
    };
  }

  reset(): number {
    this.ctx.storage.kv.delete("count");
    return 0;
  }
}
