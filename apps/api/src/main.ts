import { Logger, ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { ExpressAdapter } from "@nestjs/platform-express"
import helmet from "helmet"
import "dotenv/config"
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express"

import { AppModule, ObserveInstrument } from "./app.module"
import { AllExceptionsFilter } from "./common/all-exceptions.filter"
import { OriginValidationMiddleware } from "./common/origin-validation.middleware"
import { RateLimitMiddleware } from "./common/rate-limit.middleware"
import { RequestLoggingInterceptor } from "./common/request-logging.interceptor"
import { assertRequiredEnv } from "./config/validate-env"
import {
  API_BUILD_ID_HEADER,
  API_PID_HEADER,
  getApiRuntimeInfo,
} from "./health/api-runtime-info"
import { markRoutesVerified } from "./health/route-verification-state"
import { verifyCriticalRoutes } from "./health/verify-critical-routes"
import { pingRedis } from "./common/redis.client"
import { ImageMigrationWorker } from "./storage/image-migration.worker"

async function bootstrap() {
  assertRequiredEnv()

  const server = express()
  server.set("trust proxy", 1)

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
    instrument: ObserveInstrument,
  })

  const runtime = getApiRuntimeInfo()
  const bootstrapLogger = new Logger("Bootstrap")

  const bodyLimit = process.env.REQUEST_BODY_LIMIT ?? "25mb"
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader(API_BUILD_ID_HEADER, runtime.buildId)
    res.setHeader(API_PID_HEADER, String(runtime.pid))
    return express.json({ limit: bodyLimit })(req, res, (err?: unknown) => {
      if (err) return next(err as Error)
      return express.urlencoded({ extended: true, limit: bodyLimit })(
        req,
        res,
        next
      )
    })
  })

  app.use(new RateLimitMiddleware().use.bind(new RateLimitMiddleware()))
  app.use(new OriginValidationMiddleware().use.bind(new OriginValidationMiddleware()))

  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim() ?? ""
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts:
        process.env.NODE_ENV === "production" && publicAppUrl.startsWith("https://")
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
    })
  )

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("Referrer-Policy", "no-referrer")
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    )
    next()
  })

  app.enableShutdownHooks()
  app.useGlobalInterceptors(new RequestLoggingInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  )

  const corsOrigin =
    process.env.CORS_ORIGIN ?? "http://localhost:3000,http://localhost:3001"
  app.enableCors({
    origin: corsOrigin.split(",").map((o) => o.trim()),
    credentials: true,
  })

  await app.init()

  const redisOk = await pingRedis()
  if (!redisOk) {
    throw new Error("Redis is required and is not reachable (REDIS_URL)")
  }

  const verifiedRoutes = await verifyCriticalRoutes(app)
  markRoutesVerified(verifiedRoutes)
  bootstrapLogger.log(
    `Critical routes verified: ${verifiedRoutes.map((r) => r.route).join(", ")}`
  )

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: `Cannot ${req.method} ${req.originalUrl}`,
        requestId:
          typeof req.headers["x-request-id"] === "string"
            ? req.headers["x-request-id"]
            : undefined,
      },
    })
  })

  const port = process.env.PORT ? Number(process.env.PORT) : 4000
  await app.listen(port, "0.0.0.0")
  bootstrapLogger.log(
    `API listening on http://0.0.0.0:${port} buildId=${runtime.buildId} pid=${runtime.pid}`
  )

  app.get(ImageMigrationWorker).start()
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  Logger.error(message, undefined, "Bootstrap")
  process.exit(1)
})
