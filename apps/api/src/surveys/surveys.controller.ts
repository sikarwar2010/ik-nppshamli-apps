import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"

import {
  CurrentUser,
  RequirePermission,
  type AuthUser,
} from "../auth/auth.decorators"
import { canReadSurveyPii } from "../auth/auth-permissions"
import { sniffFileType } from "../storage/file-signature"
import {
  CreateSurveyDto,
  ListSurveysQueryDto,
  UpdateSurveyDto,
} from "./dto/survey.dto"
import { SurveysService } from "./surveys.service"

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
])

@Controller("api/v1/surveys")
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Post()
  @RequirePermission("survey:create")
  async create(@Body() dto: CreateSurveyDto, @CurrentUser() user: AuthUser) {
    const data = await this.surveysService.create(dto, user)
    return { success: true, data }
  }

  @Get()
  @RequirePermission("survey:read")
  async findAll(
    @Query() query: ListSurveysQueryDto,
    @CurrentUser() user: AuthUser
  ) {
    const { items, meta } = await this.surveysService.findAll(query, user)
    return { success: true, data: items, meta }
  }

  @Get(":id")
  @RequirePermission("survey:read")
  async findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const survey = await this.surveysService.findOne(id, user)
    const neighbors = await this.surveysService.findNeighbors(survey)
    const masked = this.surveysService.maskPii(survey, canReadSurveyPii(user))
    const data = await this.surveysService.withAttachmentUrls(masked, user)
    return { success: true, data: { ...data, neighbors } }
  }

  @Post(":id/attachments")
  @RequirePermission("survey:update")
  @UseInterceptors(FileInterceptor("file"))
  async uploadAttachment(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser
  ) {
    if (!file) {
      throw new BadRequestException({
        code: "FILE_REQUIRED",
        message: "Image or PDF file is required",
      })
    }
    if (!IMAGE_MIME.has(file.mimetype)) {
      throw new BadRequestException({
        code: "INVALID_FILE_TYPE",
        message: "Only JPEG, PNG, WebP, GIF, or PDF allowed",
      })
    }
    const maxMb = Number(process.env.IMPORT_MAX_FILE_SIZE_MB ?? 50)
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException({
        code: "FILE_TOO_LARGE",
        message: `File must be under ${maxMb}MB`,
      })
    }
    // Trust the bytes, not the client-declared type.
    const sniffed = sniffFileType(file.buffer)
    if (!sniffed || !IMAGE_MIME.has(sniffed)) {
      throw new BadRequestException({
        code: "INVALID_FILE_CONTENT",
        message: "File content is not a valid JPEG, PNG, WebP, GIF, or PDF",
      })
    }
    const data = await this.surveysService.addAttachment(
      id,
      { ...file, mimetype: sniffed },
      user
    )
    return { success: true, data }
  }

  @Post(":id/attachments/migrate")
  @RequirePermission("survey:update")
  async migrateAttachments(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser
  ) {
    const data = await this.surveysService.migrateAttachments(id, user)
    return { success: true, data }
  }

  @Delete(":id/attachments/:attachmentId")
  @RequirePermission("survey:update")
  async removeAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthUser
  ) {
    const data = await this.surveysService.removeAttachment(
      id,
      attachmentId,
      user
    )
    return { success: true, data }
  }

  @Patch(":id")
  @RequirePermission("survey:update")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateSurveyDto,
    @CurrentUser() user: AuthUser
  ) {
    const data = await this.surveysService.update(id, dto, user)
    return { success: true, data }
  }

  @Delete(":id")
  @RequirePermission("survey:delete")
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const data = await this.surveysService.remove(id, user)
    return { success: true, data }
  }
}
