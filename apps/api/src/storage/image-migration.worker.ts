import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common"
import { randomUUID } from "node:crypto"

import { getRedisClient } from "../common/redis.client"
import { ImageMigrationService } from "./image-migration.service"
import { StorageService } from "./storage.service"

const LOCK_KEY = "image-migration:sweep"
const LOCK_TTL_MS = 10 * 60 * 1000
const FIRST_SWEEP_DELAY_MS = 15_000

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw?.trim())
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

export type ImageMigrationWorkerConfig = {
  /** Seconds between sweeps; 0 disables the worker. */
  intervalSeconds: number
  batchSize: number
  concurrency: number
}

export function resolveImageMigrationWorkerConfig(
  env: NodeJS.ProcessEnv = process.env
): ImageMigrationWorkerConfig {
  return {
    intervalSeconds: positiveInt(env.IMAGE_MIGRATION_INTERVAL_SECONDS, 300),
    batchSize: Math.max(1, positiveInt(env.IMAGE_MIGRATION_BATCH_SIZE, 25)),
    concurrency: Math.max(1, positiveInt(env.IMAGE_MIGRATION_CONCURRENCY, 4)),
  }
}

/**
 * Background migration of imported images (PENDING_MIGRATION → AVAILABLE)
 * so production does not depend on someone running the CLI after an import.
 * Started from main.ts only — CLI processes share AppModule but never sweep.
 * A Redis lock keeps one sweep running across API containers.
 */
@Injectable()
export class ImageMigrationWorker implements OnModuleDestroy {
  private readonly logger = new Logger(ImageMigrationWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false
  private stopped = false

  constructor(
    private readonly migration: ImageMigrationService,
    private readonly storage: StorageService
  ) {}

  start(config = resolveImageMigrationWorkerConfig()): void {
    if (this.storage.driverName !== "minio") {
      this.logger.log("Image migration worker off (STORAGE_DRIVER is not minio)")
      return
    }
    if (config.intervalSeconds === 0) {
      this.logger.log("Image migration worker off (IMAGE_MIGRATION_INTERVAL_SECONDS=0)")
      return
    }
    this.logger.log(
      `Image migration worker every ${config.intervalSeconds}s (batch ${config.batchSize}, concurrency ${config.concurrency})`
    )
    const tick = () => {
      void this.runSweep(config).finally(() => {
        if (this.stopped) return
        this.timer = setTimeout(tick, config.intervalSeconds * 1000)
        this.timer.unref()
      })
    }
    this.timer = setTimeout(tick, FIRST_SWEEP_DELAY_MS)
    this.timer.unref()
  }

  async runSweep(config = resolveImageMigrationWorkerConfig()): Promise<void> {
    if (this.running || this.stopped) return
    this.running = true
    const redis = getRedisClient()
    const token = randomUUID()
    try {
      const acquired = await redis.set(LOCK_KEY, token, "PX", LOCK_TTL_MS, "NX")
      if (acquired !== "OK") return
      try {
        const summary = await this.migration.sweepPending({
          batchSize: config.batchSize,
          concurrency: config.concurrency,
          shouldContinue: async () => {
            if (this.stopped) return false
            // Extend the lock only while we still own it.
            if ((await redis.get(LOCK_KEY)) !== token) return false
            await redis.pexpire(LOCK_KEY, LOCK_TTL_MS)
            return true
          },
        })
        if (summary.processed > 0) {
          this.logger.log(
            `Image migration sweep: ${summary.processed} image(s) ${JSON.stringify(summary.outcomes)}`
          )
        }
      } finally {
        if ((await redis.get(LOCK_KEY)) === token) await redis.del(LOCK_KEY)
      }
    } catch (err) {
      this.logger.warn(
        `Image migration sweep skipped: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      this.running = false
    }
  }

  onModuleDestroy() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
