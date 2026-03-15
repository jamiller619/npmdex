import { createClient } from 'redis'

export function createRedisClient() {
  const host = process.env.REDIS_HOST ?? 'localhost'
  const port = parseInt(process.env.REDIS_PORT ?? '6379', 10)

  return createClient({ socket: { host, port } })
}

export type RedisClient = ReturnType<typeof createRedisClient>
