import { Controller, Get, Query, StreamableFile } from "@nestjs/common"
import { IsNotEmpty, IsString } from "class-validator"
import path from "node:path"

import { Public } from "../auth/auth.decorators"
import { StorageService } from "./storage.service"

class FileDownloadQueryDto {
  @IsString()
  @IsNotEmpty()
  key!: string

  @IsString()
  @IsNotEmpty()
  exp!: string

  @IsString()
  @IsNotEmpty()
  sig!: string
}

/** Only these stored content types are rendered inline; everything else downloads. */
const INLINE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
])

@Public()
@Controller("api/v1/files")
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Signed download endpoint. Object ownership is enforced when staff services
   * mint URLs via StorageService.getSignedUrlForUser (assertFileAccess).
   * Works for local disk and the private MinIO bucket alike, so storage
   * endpoints and credentials are never exposed to browsers.
   */
  @Get()
  async download(
    @Query() query: FileDownloadQueryDto
  ): Promise<StreamableFile> {
    this.storage.assertDownloadSignature(query.key, query.exp, query.sig)
    const stat = await this.storage.statObject(query.key)
    const stream = await this.storage.openObjectStream(query.key)
    const type = stat?.contentType || this.storage.guessMime(query.key)
    const filename = (path.basename(query.key) || "download").replaceAll(
      '"',
      ""
    )
    return new StreamableFile(stream, {
      type,
      length: stat?.size,
      disposition: `${INLINE_TYPES.has(type) ? "inline" : "attachment"}; filename="${filename}"`,
    })
  }
}
