import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisClient;

export const getRedisClient = () => {
  if (redisClient) return redisClient;

  redisClient = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  redisClient.on("error", (err) => {
    console.error("Redis error:", err);
  });

  redisClient.on("connect", () => {
    console.log("Connected to Redis");
  });

  redisClient.connect().catch((err) => {
    console.error("Redis connection failed:", err);
  });

  return redisClient;
};

export const closeRedisClient = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = undefined;
  }
};
