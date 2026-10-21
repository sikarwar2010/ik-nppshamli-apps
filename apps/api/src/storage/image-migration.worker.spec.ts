import { getRedisClient } from "../common/redis.client"
import {
  ImageMigrationWorker,
  resolveImageMigrationWorkerConfig,
} from "./image-migration.worker"

jest.mock("../common/redis.client", () => ({ getRedisClient: jest.fn() }))

function fakeRedis(lockFree = true) {
  const store = new Map<string, string>()
  return {
    store,
    set: jest.fn(async (key: string, value: string) => {
      if (!lockFree || store.has(key)) return null
      store.set(key, value)
      return "OK"
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    pexpire: jest.fn(async () => 1),
    del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  }
}

function setup(driverName = "minio", lockFree = true) {
  const redis = fakeRedis(lockFree)
  ;(getRedisClient as jest.Mock).mockReturnValue(redis)
  const migration = {
    sweepPending: jest.fn(async () => ({ processed: 2, outcomes: { migrated: 2 } })),
  }
  const worker = new ImageMigrationWorker(migration as never, { driverName } as never)
  return { worker, migration, redis }
}

const config = { intervalSeconds: 300, batchSize: 25, concurrency: 4 }

describe("ImageMigrationWorker", () => {
  afterEach(() => jest.useRealTimers())

  it("reads interval, batch size and concurrency from the environment", () => {
    expect(resolveImageMigrationWorkerConfig({})).toEqual(config)
    expect(
      resolveImageMigrationWorkerConfig({
        IMAGE_MIGRATION_INTERVAL_SECONDS: "0",
        IMAGE_MIGRATION_BATCH_SIZE: "10",
        IMAGE_MIGRATION_CONCURRENCY: "abc",
      })
    ).toEqual({ intervalSeconds: 0, batchSize: 10, concurrency: 4 })
  })

  it("does not schedule sweeps for local storage or when disabled", () => {
    jest.useFakeTimers()
    for (const [driver, interval] of [["local", 300], ["minio", 0]] as const) {
      const { worker, migration } = setup(driver)
      worker.start({ ...config, intervalSeconds: interval })
      jest.advanceTimersByTime(60_000)
      expect(migration.sweepPending).not.toHaveBeenCalled()
      worker.onModuleDestroy()
    }
  })

  it("sweeps under a Redis lock and releases it afterwards", async () => {
    const { worker, migration, redis } = setup()
    await worker.runSweep(config)

    expect(redis.set).toHaveBeenCalledWith("image-migration:sweep", expect.any(String), "PX", 600000, "NX")
    expect(migration.sweepPending).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 25, concurrency: 4 })
    )
    expect(redis.store.size).toBe(0)
  })

  it("skips the sweep when another container holds the lock", async () => {
    const { worker, migration } = setup("minio", false)
    await worker.runSweep(config)
    expect(migration.sweepPending).not.toHaveBeenCalled()
  })

  it("keeps the API running when Redis or storage errors", async () => {
    const { worker, migration } = setup()
    migration.sweepPending.mockRejectedValueOnce(new Error("storage down"))
    await expect(worker.runSweep(config)).resolves.toBeUndefined()
  })
})
