import { Global, Module } from "@nestjs/common"

import { FilesController } from "./files.controller"
import { ImageMigrationService } from "./image-migration.service"
import { ImageMigrationWorker } from "./image-migration.worker"
import { StorageService } from "./storage.service"

@Global()
@Module({
  controllers: [FilesController],
  providers: [StorageService, ImageMigrationService, ImageMigrationWorker],
  exports: [StorageService, ImageMigrationService, ImageMigrationWorker],
})
export class StorageModule {}
