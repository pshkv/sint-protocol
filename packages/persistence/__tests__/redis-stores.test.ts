/**
 * SINT Persistence — Redis Store tests.
 *
 * These tests require a running Redis instance.
 * Set REDIS_URL env var to run them.
 * They are automatically skipped in CI without Redis.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { RedisCache } from "../src/redis-cache.js";
import { RedisRevocationBus } from "../src/redis-revocation-bus.js";

const REDIS_URL = process.env.REDIS_URL;

const describeWithRedis = REDIS_URL ? describe : describe.skip;

describeWithRedis("RedisCache", () => {
  let redis: any;
  let cache: RedisCache;

  beforeAll(async () => {
    const { default: Redis } = await import("ioredis");
    redis = new Redis(REDIS_URL!);
    cache = new RedisCache(redis);
  });

  afterAll(async () => {
    await cache.clear();
    redis.disconnect();
  });

  beforeEach(async () => {
    await cache.clear();
  });

  it("set and get", async () => {
    await cache.set("key1", { value: 42 }, 60_000);
    const result = await cache.get<{ value: number }>("key1");
    expect(result).toEqual({ value: 42 });
  });

  it("get returns undefined on miss", async () => {
    expect(await cache.get("nonexistent")).toBeUndefined();
  });

  it("has returns true for existing key", async () => {
    await cache.set("key1", "value", 60_000);
    expect(await cache.has("key1")).toBe(true);
    expect(await cache.has("nonexistent")).toBe(false);
  });

  it("delete removes key", async () => {
    await cache.set("key1", "value", 60_000);
    const deleted = await cache.delete("key1");
    expect(deleted).toBe(true);
    expect(await cache.get("key1")).toBeUndefined();
  });

  it("TTL expiration works", async () => {
    await cache.set("key1", "value", 100); // 100ms TTL
    await new Promise((r) => setTimeout(r, 200));
    expect(await cache.get("key1")).toBeUndefined();
  });
});

describeWithRedis("RedisRevocationBus", () => {
  let publisher: any;
  let bus: RedisRevocationBus;

  beforeAll(async () => {
    const { default: Redis } = await import("ioredis");
    publisher = new Redis(REDIS_URL!);
    bus = new RedisRevocationBus(publisher, () => new Redis(REDIS_URL!));
    // Allow subscriber to connect
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(async () => {
    await bus.dispose();
    publisher.disconnect();
  });

  it("publish and subscribe", async () => {
    const received: any[] = [];
    bus.subscribe((event) => received.push(event));

    await bus.publish("tok-1", "test revocation", "admin");
    await new Promise((r) => setTimeout(r, 200));

    expect(received).toHaveLength(1);
    expect(received[0].tokenId).toBe("tok-1");
    expect(received[0].reason).toBe("test revocation");
  });

  it("multiple subscribers receive events", async () => {
    const received1: any[] = [];
    const received2: any[] = [];
    bus.subscribe((event) => received1.push(event));
    bus.subscribe((event) => received2.push(event));

    await bus.publish("tok-2", "dual sub test", "system");
    await new Promise((r) => setTimeout(r, 200));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it("unsubscribe stops events", async () => {
    const received: any[] = [];
    const unsub = bus.subscribe((event) => received.push(event));

    await bus.publish("tok-3", "before unsub", "system");
    await new Promise((r) => setTimeout(r, 200));
    expect(received).toHaveLength(1);

    unsub();

    await bus.publish("tok-4", "after unsub", "system");
    await new Promise((r) => setTimeout(r, 200));
    expect(received).toHaveLength(1); // Still 1, didn't receive new event
  });

  it("revocation event includes timestamp", async () => {
    const received: any[] = [];
    bus.subscribe((event) => received.push(event));

    await bus.publish("tok-5", "timestamp test", "admin");
    await new Promise((r) => setTimeout(r, 200));

    expect(received[0].timestamp).toBeDefined();
    expect(received[0].revokedBy).toBe("admin");
  });
});
