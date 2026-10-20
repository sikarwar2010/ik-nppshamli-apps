import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { DuplicateStrategy } from "@prisma/client"

import {
  CurrentUser,
  RequirePermission,
  type AuthUser,
} from "../auth/auth.decorators"
import { ImportsService } from "./imports.service"

@Controller("api/v1/imports")
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post("upload")
  @RequirePermission("import:create")
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
    @Body("duplicateStrategy") duplicateStrategy?: DuplicateStrategy
  ) {
    const data = await this.importsService.createUpload(
      file,
      user,
      duplicateStrategy ?? "UPDATE"
    )
    return { success: true, data }
  }

  @Post(":id/start")
  @RequirePermission("import:create")
  async start(@Param("id") id: string) {
    const data = await this.importsService.start(id)
    return { success: true, data }
  }

  @Get()
  @RequirePermission("import:read")
  async list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
    @Query("q") q?: string
  ) {
    const { items, meta } = await this.importsService.list(
      Number(page ?? 1),
      Number(pageSize ?? 20),
      { status, q }
    )
    return { success: true, data: items, meta }
  }

  /** Dry-run validation and create/update/conflict classification (no writes). */
  @Get(":id/preview")
  @RequirePermission("import:read")
  async preview(@Param("id") id: string) {
    const data = await this.importsService.preview(id)
    return { success: true, data }
  }

  @Get(":id")
  @RequirePermission("import:read")
  async get(@Param("id") id: string) {
    const data = await this.importsService.getJob(id)
    return { success: true, data }
  }
}

@Controller("api/v1/exports")
export class ExportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post("surveys")
  @RequirePermission("export:create")
  async exportSurveys(
    @Body() body: { wardId?: string; status?: string; format?: "shamli" | "chhata" },
    @CurrentUser() user: AuthUser
  ) {
    const data = await this.importsService.exportSurveys(body, user)
    return { success: true, data }
  }
}
