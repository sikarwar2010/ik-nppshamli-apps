import { Module } from "@nestjs/common"

import { AuthModule } from "../auth/auth.module"
import { ImportWorker } from "./import.worker"
import { ExportsController, ImportsController } from "./imports.controller"
import { ImportsService } from "./imports.service"
import { ShamliImportService } from "./shamli-import.service"

@Module({
  imports: [AuthModule],
  controllers: [ImportsController, ExportsController],
  providers: [ImportsService, ShamliImportService, ImportWorker],
  exports: [ImportsService, ShamliImportService],
})
export class ImportsModule {}
