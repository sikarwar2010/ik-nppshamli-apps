import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common"

import { Public } from "../auth/auth.decorators"
import { getApiRuntimeInfo } from "./api-runtime-info"
import { HealthService } from "./health.service"
import { getRoutesVerifiedState } from "./route-verification-state"

@Public()
@Controller()
export class HealthController {
  @Get()
  root() {
    return "Hello World!"
  }

  @Get("health")
  health() {
    return { status: "ok" }
  }
}

@Public()
@Controller("api/v1")
export class HealthV1Controller {
  constructor(private readonly health: HealthService) {}

  @Get("health")
  healthV1() {
    const runtime = getApiRuntimeInfo()
    return {
      success: true,
      data: {
        status: "ok",
        service: runtime.service,
        version: runtime.buildId,
        buildId: runtime.buildId,
        pid: runtime.pid,
        nodeEnv: runtime.nodeEnv,
        timestamp: new Date().toISOString(),
      },
    }
  }

  /** Liveness: process is up. Does not check dependencies. */
  @Get("health/live")
  live() {
    const runtime = getApiRuntimeInfo()
    return {
      success: true,
      data: {
        status: "live",
        service: runtime.service,
        buildId: runtime.buildId,
        pid: runtime.pid,
        timestamp: new Date().toISOString(),
      },
    }
  }

  /**
   * Readiness: Nest initialized, critical routes registered, Postgres and Redis reachable.
   */
  @Get("health/ready")
  async ready() {
    return this.readyPayload()
  }

  /** Alias kept for existing Docker healthchecks. */
  @Get("ready")
  async readyAlias() {
    return this.readyPayload()
  }

  private async readyPayload() {
    const runtime = getApiRuntimeInfo()
    const deps = await this.health.checkDependencies()

    if (
      !deps.routesRegistered ||
      !deps.postgres ||
      !deps.redis ||
      !deps.storage
    ) {
      throw new ServiceUnavailableException({
        code: "NOT_READY",
        message: "API is not ready",
        details: {
          routesRegistered: deps.routesRegistered,
          postgres: deps.postgres,
          redis: deps.redis,
          storage: deps.storage,
          storageDriver: deps.storageDriver,
        },
      })
    }

    const { routesVerifiedAt, verifiedRoutes } = getRoutesVerifiedState()
    return {
      success: true,
      data: {
        status: "ready",
        service: runtime.service,
        buildId: runtime.buildId,
        pid: runtime.pid,
        nodeEnv: runtime.nodeEnv,
        postgres: true,
        redis: true,
        storage: true,
        storageDriver: deps.storageDriver,
        routesVerifiedAt,
        routesVerified: verifiedRoutes.map((r) => r.route),
        timestamp: new Date().toISOString(),
      },
    }
  }
}
