/**
 * Redis client + cache helpers
 *
 * All functions fail gracefully — if Redis is unavailable or slow (> 500ms),
 * they fall through silently so callers hit the DB as normal. The UI never
 * breaks due to Redis being down.
 */

import { Redis } from 'ioredis';
import { config } from '../config.js';

let client: Redis | null = null;

export function getRedis(): Redis | null {
  if (!config.redisUrl) return null;

  if (!client) {
    try {
      client = new Redis(config.redisUrl, {
        // Fail fast — don't retry forever
        maxRetriesPerRequest: 1,
        // Queue commands briefly while the socket is connecting/reconnecting.
        // With false, ioredis throws "Stream isn't writeable and enableOfflineQueue
        // is false" on the first request or during brief disconnects (common on Render).
        enableOfflineQueue: true,
        // Don't connect until first command
        lazyConnect: true,
        // If a command takes longer than 500ms, reject it (falls through to DB)
        commandTimeout: 500,
        // Render internal Redis can be slow to accept TCP on cold start
        connectTimeout: 5000,
        // Exponential backoff on reconnect, give up after 3 attempts
        retryStrategy: (times) => {
          if (times > 3) return null; // stop retrying
          return Math.min(times * 200, 1000);
        },
      });

      client.on('error', (err: Error) => {
        console.error('[Redis] Connection error:', err.message);
      });

      client.on('connect', () => {
        console.log('[Redis] Connected');
      });
    } catch (err: any) {
      console.error('[Redis] Failed to initialize client:', err.message);
      client = null;
    }
  }

  return client;
}

/**
 * Cache-aside with hit metadata (for logging / response headers).
 */
export async function cacheGetOrSetMeta<T>(
  key: string,
  ttlSecs: number,
  loader: () => Promise<T>
): Promise<{ value: T; hit: boolean }> {
  const redis = getRedis();

  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) {
        if (config.nodeEnv === 'development') {
          console.log(`[Redis] HIT  ${key}`);
        }
        return { value: JSON.parse(raw) as T, hit: true };
      }
      if (config.nodeEnv === 'development') {
        console.log(`[Redis] MISS ${key}`);
      }
    } catch (err: any) {
      console.error(`[Redis] Read error for key "${key}":`, err.message);
    }
  }

  const value = await loader();

  if (redis) {
    redis
      .setex(key, ttlSecs, JSON.stringify(value))
      .catch((err: Error) =>
        console.error(`[Redis] Write error for key "${key}":`, err.message)
      );
  }

  return { value, hit: false };
}

/**
 * Cache-aside helper. Always falls back to loader() if Redis is unavailable.
 */
export async function cacheGetOrSet<T>(
  key: string,
  ttlSecs: number,
  loader: () => Promise<T>
): Promise<T> {
  const { value } = await cacheGetOrSetMeta(key, ttlSecs, loader);
  return value;
}

/**
 * Delete all keys matching a glob pattern using SCAN (safe for production).
 * Never uses KEYS which blocks the server.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
      cursor = next;
    } while (cursor !== '0');

    if (deleted > 0) {
      console.log(`[Redis] Invalidated ${deleted} key(s) matching "${pattern}"`);
    }
  } catch (err: any) {
    console.error(`[Redis] Pattern delete error for "${pattern}":`, err.message);
  }
}
