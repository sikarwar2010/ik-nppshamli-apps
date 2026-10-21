import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { Prisma, type Survey } from "@prisma/client"
import { createHash } from "node:crypto"
import { parseGisSurveyId } from "@workspace/types"

import { AuditService } from "../audit/audit.service"
import type { AuthUser } from "../auth/auth.decorators"
import { assertSurveyAccess } from "../auth/resource-access"
import { PrismaService } from "../prisma/prisma.service"
import { ImageMigrationService } from "../storage/image-migration.service"
import { StorageService } from "../storage/storage.service"
import {
  CreateSurveyDto,
  ListSurveysQueryDto,
  UpdateSurveyDto,
} from "./dto/survey.dto"
import { computeDataQuality, parseFloorsRaw } from "./floors.util"
import {
  diffSurveyChanges,
  surveyToAuditSnapshot,
} from "./survey-audit.util"
import {
  assertSurveyIdAvailable,
  repairSurveyIdIfNeeded,
  resolveSurveyIdentity,
  verifySurveyIdMatchesRecord,
} from "./survey-id.util"
import { buildSurveySearchOr } from "./survey-search.util"

type SurveyIdentityDto = Pick<
  CreateSurveyDto,
  "surveyId" | "wardId" | "parcelNo" | "propertyNo" | "gisUseCode"
>

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly imageMigration: ImageMigrationService
  ) {}

  async create(dto: CreateSurveyDto, user: AuthUser) {
    assertSurveyAccess(
      user,
      { id: "", wardId: dto.wardId ?? "", createdById: user.id },
      "create"
    )

    if (!dto.wardId) {
      throw new BadRequestException({
        code: "WARD_REQUIRED",
        message: "Ward is required",
      })
    }
    this.assertCreateIdentityFields(dto)

    const ward = await this.prisma.ward.findUnique({
      where: { id: dto.wardId },
    })
    if (!ward) {
      throw new NotFoundException({
        code: "WARD_NOT_FOUND",
        message: "Ward not found",
      })
    }

    const identity = resolveSurveyIdentity(ward, dto)
    if (
      dto.surveyId &&
      dto.surveyId.trim() !== identity.surveyId
    ) {
      throw new BadRequestException({
        code: "SURVEY_ID_MISMATCH",
        message: `Survey ID must match generated value ${identity.surveyId}`,
      })
    }

    const existing = await this.prisma.survey.findUnique({
      where: { surveyId: identity.surveyId },
    })
    if (existing && !existing.deletedAt) {
      throw new ConflictException({
        code: "SURVEY_EXISTS",
        message:
          "A survey already exists for this ULB, ward, parcel, property and GIS use code.",
      })
    }

    const floors = parseFloorsRaw(dto.floorsRaw)
    const dataQualityStatus =
      dto.dataQualityStatus ??
      computeDataQuality({
        mobile: dto.mobile,
        propertyNo: identity.propertyNo,
        parcelNo: identity.parcelNo,
        plotAreaSqFt: dto.plotAreaSqFt,
        totalBuiltUpAreaSqFt: dto.totalBuiltUpAreaSqFt,
      })

    const survey = await this.prisma.survey.create({
      data: {
        ...this.toPrismaCreateData(dto, identity),
        dataQualityStatus,
        createdById: user.id,
        updatedById: user.id,
        floors: {
          create: floors.map((f) => ({
            floorLabel: f.floorLabel,
            areaSqFt: f.areaSqFt,
            areaSqMeter: f.areaSqMeter,
            usageType: f.usageType,
            usageFactor: f.usageFactor,
            buildingType: f.buildingType,
            sortOrder: f.sortOrder,
            rawSegment: f.rawSegment,
          })),
        },
      },
      include: this.defaultInclude(),
    })

    await this.audit.log({
      action: "SURVEY_CREATED",
      entity: "Survey",
      entityId: survey.id,
      actorId: user.id,
      newValue: {
        changes: [
          { field: "surveyId", old: null, new: survey.surveyId },
          { field: "parcelNo", old: null, new: survey.parcelNo },
          { field: "propertyNo", old: null, new: survey.propertyNo },
          { field: "gisUseCode", old: null, new: identity.gisUseCode },
        ],
      },
    })

    return survey
  }

  async findAll(query: ListSurveysQueryDto, user: AuthUser) {
    assertSurveyAccess(
      user,
      { id: "", wardId: query.wardId ?? "", createdById: user.id },
      "read"
    )
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const where = this.buildWhere(query)

    const sortable = new Set([
      "createdAt",
      "surveyedAt",
      "surveyId",
      "ownerName",
      "mobile",
      "status",
      "parcelNo",
      "propertyNo",
    ])
    const sortBy = sortable.has(query.sortBy ?? "")
      ? (query.sortBy as string)
      : "parcelNo"
    const sortOrder: Prisma.SortOrder =
      query.sortOrder === "desc" ? "desc" : "asc"

    const orderBy: Prisma.SurveyOrderByWithRelationInput[] =
      sortBy === "parcelNo"
        ? [
            { ward: { number: "asc" } },
            { surveyId: sortOrder },
            { parcelNo: sortOrder },
          ]
        : [{ [sortBy]: sortOrder }]

    const [total, items] = await this.prisma.$transaction([
      this.prisma.survey.count({ where }),
      this.prisma.survey.findMany({
        where,
        include: {
          ward: true,
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const canonicalItems = await this.ensureCanonicalSurveyIds(items)

    return {
      items: canonicalItems,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    }
  }

  async findOne(id: string, user: AuthUser) {
    const survey = await this.prisma.survey.findFirst({
      where: { OR: [{ id }, { surveyId: id }], deletedAt: null },
      include: this.defaultInclude(),
    })
    if (!survey) {
      throw new NotFoundException({
        code: "SURVEY_NOT_FOUND",
        message: "Survey not found",
      })
    }
    assertSurveyAccess(user, survey, "read")
    return this.ensureCanonicalSurveyId(survey)
  }

  async findNeighbors(survey: {
    id: string
    wardId: string
    surveyId: string
  }) {
    const whereBase = {
      wardId: survey.wardId,
      deletedAt: null,
      status: { not: "DELETED" as const },
      id: { not: survey.id },
    }

    const [previous, next] = await Promise.all([
      this.prisma.survey.findFirst({
        where: { ...whereBase, surveyId: { lt: survey.surveyId } },
        orderBy: { surveyId: "desc" },
        select: { id: true, surveyId: true },
      }),
      this.prisma.survey.findFirst({
        where: { ...whereBase, surveyId: { gt: survey.surveyId } },
        orderBy: { surveyId: "asc" },
        select: { id: true, surveyId: true },
      }),
    ])

    return { previous, next }
  }

  async update(id: string, dto: UpdateSurveyDto, user: AuthUser) {
    const current = await this.findOne(id, user)
    assertSurveyAccess(user, current, "update")
    const beforeAudit = this.buildAuditState(current)

    const targetWardId = dto.wardId ?? current.wardId
    const ward = await this.prisma.ward.findUnique({
      where: { id: targetWardId },
    })
    if (!ward) {
      throw new NotFoundException({
        code: "WARD_NOT_FOUND",
        message: "Ward not found",
      })
    }

    const identityInput = this.mergeIdentityInput(dto, current)
    const identity = resolveSurveyIdentity(ward, identityInput, current)

    if (
      dto.surveyId !== undefined &&
      dto.surveyId.trim() !== identity.surveyId
    ) {
      throw new BadRequestException({
        code: "SURVEY_ID_READ_ONLY",
        message: "Survey ID is system-generated and cannot be edited directly",
      })
    }

    const floorsRaw =
      dto.floorsRaw !== undefined ? dto.floorsRaw : current.floorsRaw
    const floors = parseFloorsRaw(floorsRaw)

    const survey = await this.prisma.$transaction(async (tx) => {
      if (identity.surveyId !== current.surveyId) {
        await assertSurveyIdAvailable(tx, identity.surveyId, current.id)
      }

      if (dto.floorsRaw !== undefined) {
        await tx.surveyFloor.deleteMany({ where: { surveyId: current.id } })
      }

      const updateData = this.toPrismaUpdateData(dto, current, identity)

      return tx.survey.update({
        where: { id: current.id },
        data: {
          ...updateData,
          dataQualityStatus:
            dto.dataQualityStatus ??
            computeDataQuality({
              mobile:
                dto.mobile !== undefined ? dto.mobile : current.mobile,
              propertyNo: identity.propertyNo,
              parcelNo: identity.parcelNo,
              plotAreaSqFt:
                dto.plotAreaSqFt ??
                (current.plotAreaSqFt
                  ? Number(current.plotAreaSqFt)
                  : null),
              totalBuiltUpAreaSqFt:
                dto.totalBuiltUpAreaSqFt ??
                (current.totalBuiltUpAreaSqFt
                  ? Number(current.totalBuiltUpAreaSqFt)
                  : null),
            }),
          updatedById: user.id,
          ...(dto.floorsRaw !== undefined
            ? {
                floors: {
                  create: floors.map((f) => ({
                    floorLabel: f.floorLabel,
                    areaSqFt: f.areaSqFt,
                    areaSqMeter: f.areaSqMeter,
                    usageType: f.usageType,
                    usageFactor: f.usageFactor,
                    buildingType: f.buildingType,
                    sortOrder: f.sortOrder,
                    rawSegment: f.rawSegment,
                  })),
                },
              }
            : {}),
        },
        include: this.defaultInclude(),
      })
    })

    const afterAudit = this.buildAuditState(survey)
    const auditDiff = diffSurveyChanges(beforeAudit, afterAudit)

    if (auditDiff.changes.length > 0) {
      await this.audit.log({
        action: "SURVEY_UPDATED",
        entity: "Survey",
        entityId: survey.id,
        actorId: user.id,
        oldValue: {
          changes: auditDiff.changes.map((c) => ({
            field: c.field,
            value: c.old,
          })),
        } as Prisma.InputJsonValue,
        newValue: { changes: auditDiff.changes } as Prisma.InputJsonValue,
      })
    }

    return survey
  }

  async remove(id: string, user: AuthUser) {
    const current = await this.findOne(id, user)
    assertSurveyAccess(user, current, "delete")
    const survey = await this.prisma.survey.update({
      where: { id: current.id },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        updatedById: user.id,
      },
    })

    await this.audit.log({
      action: "SURVEY_DELETED",
      entity: "Survey",
      entityId: survey.id,
      actorId: user.id,
      oldValue: { surveyId: current.surveyId },
    })

    return survey
  }

  private assertCreateIdentityFields(dto: CreateSurveyDto) {
    if (!dto.parcelNo?.trim()) {
      throw new BadRequestException({
        code: "PARCEL_REQUIRED",
        message: "Parcel number is required",
      })
    }
    if (!dto.propertyNo?.trim()) {
      throw new BadRequestException({
        code: "PROPERTY_REQUIRED",
        message: "Property number is required",
      })
    }
    if (!dto.gisUseCode?.trim()) {
      throw new BadRequestException({
        code: "GIS_USE_CODE_REQUIRED",
        message: "GIS use code is required",
      })
    }
  }

  private mergeIdentityInput(
    dto: UpdateSurveyDto,
    current: Survey
  ): SurveyIdentityDto {
    const parsed = parseGisSurveyId(current.surveyId)
    return {
      surveyId: current.surveyId,
      wardId: dto.wardId ?? current.wardId,
      parcelNo: dto.parcelNo ?? current.parcelNo ?? undefined,
      propertyNo: dto.propertyNo ?? current.propertyNo ?? undefined,
      gisUseCode: dto.gisUseCode ?? parsed?.gisUseCode,
    }
  }

  private buildAuditState(
    survey: Survey & { wardId: string }
  ): Record<string, unknown> {
    const parsed = parseGisSurveyId(survey.surveyId)
    return surveyToAuditSnapshot(
      survey as unknown as Record<string, unknown>,
      { gisUseCode: parsed?.gisUseCode ?? null }
    )
  }

  private buildWhere(query: ListSurveysQueryDto): Prisma.SurveyWhereInput {
    const where: Prisma.SurveyWhereInput = {
      deletedAt: null,
      status: query.status ?? { not: "DELETED" },
    }

    if (query.wardId) where.wardId = query.wardId
    if (query.propertyUse) where.propertyUse = query.propertyUse
    if (query.propertyOwnership)
      where.propertyOwnership = query.propertyOwnership
    if (query.taxRateZone) where.taxRateZone = query.taxRateZone
    if (query.locality)
      where.locality = { contains: query.locality, mode: "insensitive" }
    if (query.colony)
      where.colony = { contains: query.colony, mode: "insensitive" }
    if (typeof query.isSlum === "boolean") where.isSlum = query.isSlum
    if (query.commercial) where.commercial = query.commercial
    if (query.dataQualityStatus)
      where.dataQualityStatus = query.dataQualityStatus

    if (query.surveyedFrom || query.surveyedTo) {
      where.surveyedAt = {}
      if (query.surveyedFrom)
        where.surveyedAt.gte = new Date(query.surveyedFrom)
      if (query.surveyedTo) where.surveyedAt.lte = new Date(query.surveyedTo)
    }

    if (query.search?.trim()) {
      where.OR = buildSurveySearchOr(query.search)
    }

    return where
  }

  private toPrismaCreateData(
    dto: CreateSurveyDto,
    identity: ReturnType<typeof resolveSurveyIdentity>
  ): Prisma.SurveyUncheckedCreateInput {
    return {
      surveyId: identity.surveyId,
      wardId: dto.wardId!,
      parcelNo: identity.parcelNo,
      propertyNo: identity.propertyNo,
      surveyedAt: dto.surveyedAt ? new Date(dto.surveyedAt) : undefined,
      ownerName: dto.ownerName,
      ownerFatherName: dto.ownerFatherName,
      mobile: dto.mobile,
      ownerAadhaar: dto.ownerAadhaar,
      isSlum: dto.isSlum ?? false,
      remark: dto.remark,
      electricityId: dto.electricityId,
      khasraNo: dto.khasraNo,
      registryNo: dto.registryNo,
      constructedDate: dto.constructedDate,
      respondentName: dto.respondentName,
      respondentRelationship: dto.respondentRelationship,
      city: dto.city,
      pincode: dto.pincode,
      houseNo: dto.houseNo,
      streetName: dto.streetName,
      locality: dto.locality,
      colony: dto.colony,
      presentHouseNo: dto.presentHouseNo,
      presentStreetName: dto.presentStreetName,
      presentLocality: dto.presentLocality,
      presentColony: dto.presentColony,
      presentCity: dto.presentCity,
      presentPincode: dto.presentPincode,
      isSameAsProperty: dto.isSameAsProperty,
      taxRateZone: dto.taxRateZone,
      propertyOwnership: dto.propertyOwnership,
      propertyUse: dto.propertyUse,
      commercial: dto.commercial,
      yearOfConstruction: dto.yearOfConstruction,
      exemptionType: dto.exemptionType,
      exemptionApplicable: dto.exemptionApplicable,
      situation: dto.situation,
      roadType: dto.roadType,
      floorsRaw: dto.floorsRaw,
      plotAreaSqFt: dto.plotAreaSqFt,
      plotAreaSqMeter: dto.plotAreaSqMeter,
      plinthAreaSqFt: dto.plinthAreaSqFt,
      plinthAreaSqMeter: dto.plinthAreaSqMeter,
      totalBuiltUpAreaSqFt: dto.totalBuiltUpAreaSqFt,
      totalBuiltUpAreaSqMeter: dto.totalBuiltUpAreaSqMeter,
      hasMunicipalWaterSupply: dto.hasMunicipalWaterSupply,
      hasAlternateWater: dto.hasAlternateWater,
      waterSourceType: dto.waterSourceType,
      totalWaterConnections: dto.totalWaterConnections,
      waterConnectionIdType: dto.waterConnectionIdType,
      toiletType: dto.toiletType,
      hasMunicipalWasteService: dto.hasMunicipalWasteService,
      status: dto.status,
    }
  }

  private toPrismaUpdateData(
    dto: UpdateSurveyDto,
    current: Survey,
    identity: ReturnType<typeof resolveSurveyIdentity>
  ): Prisma.SurveyUncheckedUpdateInput {
    const data: Prisma.SurveyUncheckedUpdateInput = {
      surveyId: identity.surveyId,
      parcelNo: identity.parcelNo,
      propertyNo: identity.propertyNo,
    }

    const assign = <K extends keyof UpdateSurveyDto>(
      key: K,
      transform?: (v: NonNullable<UpdateSurveyDto[K]>) => unknown
    ) => {
      if (dto[key] === undefined) return
      const value = dto[key]
      ;(data as Record<string, unknown>)[key as string] = transform
        ? transform(value as NonNullable<UpdateSurveyDto[K]>)
        : value
    }

    assign("wardId")
    assign("surveyedAt", (v) => new Date(v))
    assign("ownerName")
    assign("ownerFatherName")
    assign("mobile")
    assign("ownerAadhaar")
    assign("isSlum")
    assign("remark")
    assign("electricityId")
    assign("khasraNo")
    assign("registryNo")
    assign("constructedDate")
    assign("respondentName")
    assign("respondentRelationship")
    assign("city")
    assign("pincode")
    assign("houseNo")
    assign("streetName")
    assign("locality")
    assign("colony")
    assign("presentHouseNo")
    assign("presentStreetName")
    assign("presentLocality")
    assign("presentColony")
    assign("presentCity")
    assign("presentPincode")
    assign("isSameAsProperty")
    assign("taxRateZone")
    assign("propertyOwnership")
    assign("propertyUse")
    assign("commercial")
    assign("yearOfConstruction")
    assign("exemptionType")
    assign("exemptionApplicable")
    assign("situation")
    assign("roadType")
    assign("floorsRaw")
    assign("plotAreaSqFt")
    assign("plotAreaSqMeter")
    assign("plinthAreaSqFt")
    assign("plinthAreaSqMeter")
    assign("totalBuiltUpAreaSqFt")
    assign("totalBuiltUpAreaSqMeter")
    assign("hasMunicipalWaterSupply")
    assign("hasAlternateWater")
    assign("waterSourceType")
    assign("totalWaterConnections")
    assign("waterConnectionIdType")
    assign("toiletType")
    assign("hasMunicipalWasteService")
    assign("status")

    void current
    return data
  }

  private defaultInclude() {
    return {
      ward: true,
      floors: { orderBy: { sortOrder: "asc" as const } },
      attachments: {
        orderBy: { createdAt: "asc" as const },
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      createdBy: { select: { id: true, name: true, email: true } },
      updatedBy: { select: { id: true, name: true, email: true } },
    }
  }

  maskPii<T extends Survey>(survey: T, canReadPii: boolean): T {
    if (canReadPii) return survey
    return {
      ...survey,
      ownerAadhaar: survey.ownerAadhaar
        ? `XXXX-XXXX-${survey.ownerAadhaar.slice(-4)}`
        : survey.ownerAadhaar,
    }
  }

  async withAttachmentUrls<
    T extends {
      id: string
      wardId: string
      createdById?: string | null
      attachments?: Array<{
        objectKey: string
        mimeType: string
        uploadedById?: string | null
        storageStatus?: string
      }>
    },
  >(survey: T, user: AuthUser) {
    if (!survey.attachments?.length) return survey
    const attachments = await Promise.all(
      survey.attachments.map(async (a) => {
        // Imported images awaiting MinIO migration have no stored object yet.
        if (a.storageStatus && a.storageStatus !== "AVAILABLE") {
          return { ...a, url: null }
        }
        const url = await this.storage
          .getSignedUrlForUser(user, a.objectKey, {
            surveyId: survey.id,
            uploadedById: a.uploadedById,
            survey,
          })
          .catch(() => null)
        return { ...a, url }
      })
    )
    return { ...survey, attachments }
  }

  async addAttachment(
    surveyId: string,
    file: Express.Multer.File,
    user: AuthUser
  ) {
    const current = await this.findOne(surveyId, user)
    assertSurveyAccess(user, current, "update")
    const safeName = file.originalname.replace(/[^\w.-]+/g, "_").slice(0, 180)
    const objectKey = `surveys/${current.id}/${Date.now()}-${safeName}`
    const checksumSha256 = createHash("sha256")
      .update(file.buffer)
      .digest("hex")
    await this.storage.putObject(objectKey, file.buffer, file.mimetype, {
      sha256: checksumSha256,
    })
    const attachment = await this.prisma.surveyAttachment.create({
      data: {
        surveyId: current.id,
        objectKey,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        bucket: this.storage.bucketName,
        checksumSha256,
        uploadedById: user.id,
      },
    })
    await this.audit.log({
      action: "SURVEY_ATTACHMENT_ADDED",
      entity: "Survey",
      entityId: current.id,
      actorId: user.id,
      newValue: { fileName: file.originalname, mimeType: file.mimetype },
    })
    const url = await this.storage
      .getSignedUrlForUser(user, objectKey, {
        surveyId: current.id,
        uploadedById: user.id,
        survey: current,
      })
      .catch(() => null)
    return { ...attachment, url }
  }

  /**
   * Copy this survey's imported images that are still PENDING_MIGRATION or
   * FAILED into object storage now (the background sweep does the same for
   * PENDING rows; this is the manual retry). Rows only become AVAILABLE after
   * the stored object is verified.
   */
  async migrateAttachments(surveyId: string, user: AuthUser) {
    const current = await this.findOne(surveyId, user)
    assertSurveyAccess(user, current, "update")
    const results = await this.imageMigration.migrateSurveyImages(current.id)
    const failed = results.filter((r) => r.outcome === "failed").length
    const summary = {
      attempted: results.length,
      available: results.length - failed,
      failed,
    }
    if (results.length > 0) {
      await this.audit.log({
        action: "SURVEY_ATTACHMENTS_MIGRATED",
        entity: "Survey",
        entityId: current.id,
        actorId: user.id,
        newValue: summary,
      })
    }
    return {
      ...summary,
      results: results.map((r) => ({
        attachmentId: r.attachmentId,
        imageType: r.imageType,
        outcome: r.outcome,
        error: r.error ?? null,
      })),
    }
  }

  async removeAttachment(
    surveyId: string,
    attachmentId: string,
    user: AuthUser
  ) {
    const current = await this.findOne(surveyId, user)
    assertSurveyAccess(user, current, "update")
    const attachment = await this.prisma.surveyAttachment.findFirst({
      where: { id: attachmentId, surveyId: current.id },
    })
    if (!attachment) {
      throw new NotFoundException({
        code: "ATTACHMENT_NOT_FOUND",
        message: "Attachment not found",
      })
    }
    await this.prisma.surveyAttachment.delete({ where: { id: attachmentId } })
    // Remove the binary only when no other attachment row still references it.
    const stillReferenced = await this.prisma.surveyAttachment.count({
      where: { objectKey: attachment.objectKey, bucket: attachment.bucket },
    })
    if (
      stillReferenced === 0 &&
      attachment.storageStatus === "AVAILABLE" &&
      attachment.bucket === this.storage.bucketName
    ) {
      await this.storage.deleteObject(attachment.objectKey).catch((err) => {
        this.logger.warn(
          `Attachment ${attachmentId} removed; object ${attachment.objectKey} not deleted: ${String(err)}`
        )
      })
    }
    await this.audit.log({
      action: "SURVEY_ATTACHMENT_REMOVED",
      entity: "Survey",
      entityId: current.id,
      actorId: user.id,
      oldValue: { fileName: attachment.originalFileName },
    })
    return { id: attachmentId }
  }

  private async ensureCanonicalSurveyIds<
    T extends {
      id: string
      surveyId: string
      parcelNo: string | null
      propertyNo: string | null
      ward: { number: number }
    },
  >(surveys: T[]): Promise<T[]> {
    const repaired: T[] = []
    for (const survey of surveys) {
      repaired.push(await this.ensureCanonicalSurveyId(survey))
    }
    return repaired
  }

  private async ensureCanonicalSurveyId<
    T extends {
      id: string
      surveyId: string
      parcelNo: string | null
      propertyNo: string | null
      ward: { number: number }
    },
  >(survey: T): Promise<T> {
    const surveyId = await repairSurveyIdIfNeeded(
      this.prisma,
      survey,
      survey.ward.number
    )
    if (surveyId === survey.surveyId) return survey
    const parsed = parseGisSurveyId(surveyId)
    return {
      ...survey,
      surveyId,
      parcelNo: parsed?.parcelNo ?? survey.parcelNo,
      propertyNo: parsed?.propertyNo ?? survey.propertyNo,
    }
  }
}

/** Exported for tests and import repair. */
export { verifySurveyIdMatchesRecord }
