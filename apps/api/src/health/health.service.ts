import { Injectable } from "@nestjs/common"

import { pingRedis } from "../common/redis.client"
import { PrismaService } from "../prisma/prisma.service"
import { StorageService } from "../storage/storage.service"
import { getRoutesVerifiedState } from "./route-verification-state"

export type DependencyHealth = {
  postgres: boolean
  redis: boolean
  /** Object storage reachable (MinIO bucket exists / local dir writable). */
  storage: boolean
  storageDriver: string
  routesRegistered: boolean
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async checkDependencies(): Promise<DependencyHealth> {
    const { routesVerifiedAt, verifiedRoutes } = getRoutesVerifiedState()
    const [postgres, redis, storage] = await Promise.all([
      this.postgresReady(),
      pingRedis(),
      this.storage.isHealthy(),
    ])
    return {
      postgres,
      redis,
      storage,
      storageDriver: this.storage.driverName,
      routesRegistered: Boolean(routesVerifiedAt && verifiedRoutes.length > 0),
    }
  }

  async postgresReady(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }
}
