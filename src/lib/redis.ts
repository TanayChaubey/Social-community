import { createClient, RedisClientType } from 'redis';

/**
 * Redis client utility for caching, sessions, and WebSocket scaling
 * Security: Connection details should be in environment variables
 */
class RedisClient {
  private client: RedisClientType | null = null;
  private isConnected = false;

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = createClient({
        url: redisUrl,
        // Security: Connection timeouts and retry strategy
        socket: {
          connectTimeout: 5000,
          lazyConnect: true,
        },
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('❌ Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            console.error('❌ Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            console.error('❌ Redis max retry attempts reached');
            return undefined;
          }
          // Retry after 3 seconds
          return Math.min(options.attempt * 100, 3000);
        },
      });

      this.client.on('error', (error) => {
        console.error('❌ Redis client error:', error);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Redis client connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('✅ Redis client ready');
      });

      this.client.on('end', () => {
        console.warn('⚠️ Redis client disconnected');
        this.isConnected = false;
      });

      await this.client.connect();

    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Get Redis client instance
   */
  getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    return this.client;
  }

  /**
   * Check if Redis is connected
   */
  isRedisConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Graceful disconnection
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
        this.isConnected = false;
        console.log('✅ Disconnected from Redis');
      }
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error);
    }
  }

  /**
   * Health check for Redis
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }
      await this.client.ping();
      return true;
    } catch (error) {
      console.error('❌ Redis health check failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const redisClient = new RedisClient();

/**
 * Helper functions for common Redis operations
 */
export const redisHelpers = {
  /**
   * Set a key with expiration
   */
  async setWithExpiry(key: string, value: string, expiryInSeconds: number): Promise<void> {
    const client = redisClient.getClient();
    await client.setEx(key, expiryInSeconds, value);
  },

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    const client = redisClient.getClient();
    return await client.get(key);
  },

  /**
   * Delete a key
   */
  async del(key: string): Promise<number> {
    const client = redisClient.getClient();
    return await client.del(key);
  },

  /**
   * Increment a counter (for rate limiting)
   */
  async increment(key: string, expiryInSeconds?: number): Promise<number> {
    const client = redisClient.getClient();
    const result = await client.incr(key);

    // Set expiry on first increment
    if (result === 1 && expiryInSeconds) {
      await client.expire(key, expiryInSeconds);
    }

    return result;
  },

  /**
   * Add item to a list (for pub/sub)
   */
  async listPush(key: string, value: string): Promise<number> {
    const client = redisClient.getClient();
    return await client.lPush(key, value);
  },

  /**
   * Get list length
   */
  async listLength(key: string): Promise<number> {
    const client = redisClient.getClient();
    return await client.lLen(key);
  },

  /**
   * Publish message to channel (for WebSocket scaling)
   */
  async publish(channel: string, message: string): Promise<number> {
    const client = redisClient.getClient();
    return await client.publish(channel, message);
  },

  /**
   * Subscribe to channel (for WebSocket scaling)
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const client = redisClient.getClient();
    const subscriber = client.duplicate();

    await subscriber.connect();
    await subscriber.subscribe(channel, callback);
  },
};