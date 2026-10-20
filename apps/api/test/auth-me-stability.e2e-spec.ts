import { INestApplication, ValidationPipe } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { App } from "supertest/types"

import { AuditModule } from "../src/audit/audit.module"
import { AuthGuard } from "../src/auth/auth.guard"
import { AuthModule } from "../src/auth/auth.module"
import { PermissionGuard } from "../src/auth/permission.guard"
import { RolesGuard } from "../src/auth/roles.guard"
import { CsrfController } from "../src/common/csrf.controller"
import { CsrfGuard } from "../src/common/csrf.guard"
import { AllExceptionsFilter } from "../src/common/all-exceptions.filter"
import { HealthModule } from "../src/health/health.module"
import { HealthService } from "../src/health/health.service"
import {
  markRoutesVerified,
  resetRoutesVerifiedStateForTests,
} from "../src/health/route-verification-state"
import { verifyCriticalRoutes } from "../src/health/verify-critical-routes"
import { SESSION_CACHE } from "../src/auth/session-cache"
import { MemorySessionCache } from "./helpers/memory-session.cache"
import { PrismaModule } from "../src/prisma/prisma.module"
import { PrismaService } from "../src/prisma/prisma.service"
import { closeRedisClient } from "../src/common/redis.client"

describe("GET /api/v1/auth/me stability (e2e)", () => {
  let app: INestApplication<App>

  const prisma = {
    user: { findUnique: jest.fn(async () => null) },
    $queryRaw: jest.fn(async () => [{ "?column?": 1 }]),
    session: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  }

  beforeAll(async () => {
    resetRoutesVerifiedStateForTests()
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditModule, AuthModule, HealthModule],
      controllers: [CsrfController],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(SESSION_CACHE)
      .useValue(new MemorySessionCache())
      .overrideProvider(HealthService)
      .useValue({
        checkDependencies: async () => ({
          postgres: true,
          redis: true,
          storage: true,
          storageDriver: "local",
          routesRegistered: true,
        }),
      })
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalFilters(new AllExceptionsFilter())
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true })
    )
    await app.init()
    markRoutesVerified(await verifyCriticalRoutes(app))
  })

  afterAll(async () => {
    await app.close()
    resetRoutesVerifiedStateForTests()
    await closeRedisClient()
  })

  it("returns 401 (not 404) for unauthenticated GET /api/v1/auth/me", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me")
    expect(res.status).toBe(401)
    expect(res.body.error?.code).toBe("AUTH_SESSION_MISSING")
  })

  it("keeps GET /api/v1/auth/me registered across 20 consecutive requests", async () => {
    for (let i = 0; i < 20; i++) {
      const res = await request(app.getHttpServer()).get("/api/v1/auth/me")
      expect(res.status).toBe(401)
      expect(res.status).not.toBe(404)
      expect(res.body.error?.code).toBe("AUTH_SESSION_MISSING")
    }
  })

  it("GET /api/v1/ready reports routes verified after bootstrap", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/ready")
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("ready")
    expect(res.body.data.routesVerified).toContain("GET /api/v1/auth/me")
  })

  it("does not expose /api/auth/me (legacy Better Auth path)", async () => {
    const res = await request(app.getHttpServer()).get("/api/auth/me")
    expect(res.status).toBe(404)
  })
})
