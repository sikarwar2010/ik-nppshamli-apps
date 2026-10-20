import { INestApplication } from "@nestjs/common"
import { Test, TestingModule } from "@nestjs/testing"
import request from "supertest"
import { App } from "supertest/types"

import { HealthModule } from "./../src/health/health.module"
import { HealthService } from "./../src/health/health.service"
import { PrismaService } from "./../src/prisma/prisma.service"
import {
  markRoutesVerified,
  resetRoutesVerifiedStateForTests,
} from "./../src/health/route-verification-state"

describe("Health (e2e)", () => {
  let app: INestApplication<App>

  beforeEach(async () => {
    resetRoutesVerifiedStateForTests()
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn(async () => [{ "?column?": 1 }]),
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
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

    app = moduleFixture.createNestApplication()
    await app.init()
    markRoutesVerified([
      { route: "GET /api/v1/health", status: 200, ok: true },
    ])
  })

  afterEach(async () => {
    await app.close()
    resetRoutesVerifiedStateForTests()
  })

  it("/ (GET)", () => {
    return request(app.getHttpServer()).get("/").expect(200).expect("Hello World!")
  })

  it("/health (GET)", () => {
    return request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect({ status: "ok" })
  })

  it("/api/v1/health (GET)", () => {
    return request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true)
        expect(res.body.data.status).toBe("ok")
        expect(res.body.data.service).toBe("api")
        expect(res.body.data.buildId).toBeTruthy()
        expect(typeof res.body.data.pid).toBe("number")
      })
  })

  it("/api/v1/health/live (GET)", () => {
    return request(app.getHttpServer())
      .get("/api/v1/health/live")
      .expect(200)
      .expect((res) => {
        expect(res.body.data.status).toBe("live")
        expect(res.body.data.service).toBe("api")
        expect(typeof res.body.data.pid).toBe("number")
      })
  })

  it("/api/v1/ready (GET)", () => {
    return request(app.getHttpServer())
      .get("/api/v1/ready")
      .expect(200)
      .expect((res) => {
        expect(res.body.data.status).toBe("ready")
        expect(res.body.data.routesVerified).toContain("GET /api/v1/health")
      })
  })

  it("/api/v1/health/ready (GET)", () => {
    return request(app.getHttpServer())
      .get("/api/v1/health/ready")
      .expect(200)
      .expect((res) => {
        expect(res.body.data.status).toBe("ready")
      })
  })
})
