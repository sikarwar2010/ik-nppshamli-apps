import { Module } from "@nestjs/common"

import { PrismaModule } from "../prisma/prisma.module"
import { StorageModule } from "../storage/storage.module"
import { HealthController, HealthV1Controller } from "./health.controller"
import { HealthService } from "./health.service"

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [HealthController, HealthV1Controller],
  providers: [HealthService],
})
export class HealthModule {}
