import { Injectable } from "@nestjs/common"

import { PrismaService } from "../prisma/prisma.service"
import {
  pickLatestPublishedConfig,
  type TaxConfigForDues,
} from "../public-property-tax/dues.util"
import { StorageService } from "../storage/storage.service"
import { aggregateTaxDemand } from "./dashboard-tax.util"
import { wardSurveyStatus } from "./ward-survey-status"

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async getSummary(wardId?: string) {
    const surveyWhere = {
      deletedAt: null,
      status: { not: "DELETED" as const },
      ...(wardId ? { wardId } : {}),
    }

    const paymentWhere = {
      ...(wardId ? { wardId } : {}),
    }

    const successPaymentWhere = {
      ...paymentWhere,
      status: "SUCCESS" as const,
    }

    const [
      totalProperties,
      draftSurveys,
      activeSurveys,
      archivedSurveys,
      completeQuality,
      needsReviewQuality,
      totalCollectionAgg,
      onlineCollectionAgg,
      offlineCollectionAgg,
      pendingPayments,
      successPayments,
      failedPayments,
      pendingCollectionAgg,
      byWard,
      paymentsByWard,
      pendingByWard,
      recentAttachments,
      wards,
      taxSurveys,
      publishedConfigs,
    ] = await Promise.all([
      this.prisma.survey.count({ where: surveyWhere }),
      this.prisma.survey.count({
        where: { ...surveyWhere, status: "DRAFT" },
      }),
      this.prisma.survey.count({
        where: { ...surveyWhere, status: "ACTIVE" },
      }),
      this.prisma.survey.count({
        where: { ...surveyWhere, status: "ARCHIVED" },
      }),
      this.prisma.survey.count({
        where: { ...surveyWhere, dataQualityStatus: "COMPLETE" },
      }),
      this.prisma.survey.count({
        where: { ...surveyWhere, dataQualityStatus: "NEEDS_REVIEW" },
      }),
      this.prisma.payment.aggregate({
        where: successPaymentWhere,
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...successPaymentWhere, paymentMode: "ONLINE" },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          ...successPaymentWhere,
          paymentMode: { not: "ONLINE" },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({
        where: {
          ...paymentWhere,
          status: { in: ["PENDING", "INITIATED"] },
        },
      }),
      this.prisma.payment.count({
        where: successPaymentWhere,
      }),
      this.prisma.payment.count({
        where: { ...paymentWhere, status: "FAILED" },
      }),
      this.prisma.payment.aggregate({
        where: {
          ...paymentWhere,
          status: { in: ["PENDING", "INITIATED"] },
        },
        _sum: { amount: true },
      }),
      this.prisma.survey.groupBy({
        by: ["wardId"],
        where: surveyWhere,
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ["wardId", "paymentMode"],
        where: { ...successPaymentWhere, wardId: { not: null } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ["wardId"],
        where: {
          ...paymentWhere,
          wardId: { not: null },
          status: { in: ["PENDING", "INITIATED"] },
        },
        _sum: { amount: true },
      }),
      this.prisma.surveyAttachment.findMany({
        // Only images whose binary exists in storage (excludes pending migrations).
        where: wardId
          ? { storageStatus: "AVAILABLE", survey: { wardId, deletedAt: null } }
          : { storageStatus: "AVAILABLE", survey: { deletedAt: null } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          survey: {
            select: { id: true, surveyId: true, ownerName: true },
          },
        },
      }),
      this.prisma.ward.findMany({
        where: { isActive: true, ...(wardId ? { id: wardId } : {}) },
        orderBy: { number: "asc" },
      }),
      this.prisma.survey.findMany({
        where: surveyWhere,
        select: {
          id: true,
          surveyId: true,
          wardId: true,
          propertyUse: true,
          taxRateZone: true,
          hasMunicipalWaterSupply: true,
          plotAreaSqFt: true,
          plinthAreaSqFt: true,
          totalBuiltUpAreaSqFt: true,
          floors: {
            orderBy: { sortOrder: "asc" },
            select: {
              floorLabel: true,
              usageType: true,
              usageFactor: true,
              buildingType: true,
              areaSqFt: true,
            },
          },
        },
      }),
      this.prisma.taxConfig.findMany({
        where: {
          status: "PUBLISHED",
          ...(wardId ? { wardId } : {}),
        },
        include: {
          assessmentYear: {
            select: { id: true, code: true, name: true },
          },
          cells: {
            include: {
              roadWidthEntry: { select: { code: true } },
              constructionEntry: { select: { code: true } },
            },
          },
        },
      }),
    ])

    const countByWard = new Map(byWard.map((w) => [w.wardId, w._count._all]))
    const pendingByWardMap = new Map(
      pendingByWard.map((w) => [w.wardId ?? "", Number(w._sum.amount ?? 0)])
    )

    type WardMoney = { online: number; offline: number; total: number }
    const moneyByWard = new Map<string, WardMoney>()
    for (const row of paymentsByWard) {
      if (!row.wardId) continue
      const current = moneyByWard.get(row.wardId) ?? {
        online: 0,
        offline: 0,
        total: 0,
      }
      const amount = Number(row._sum.amount ?? 0)
      if (row.paymentMode === "ONLINE") {
        current.online += amount
      } else {
        current.offline += amount
      }
      current.total += amount
      moneyByWard.set(row.wardId, current)
    }

    const wardsWithSurveys = wards.filter(
      (w) => (countByWard.get(w.id) ?? 0) > 0
    ).length
    // Wards not yet surveyed (survey work remaining), not "tax not calculated".
    const wardsInProgress = wards.length - wardsWithSurveys

    const onlineCollection = Number(onlineCollectionAgg._sum.amount ?? 0)
    const offlineCollection = Number(offlineCollectionAgg._sum.amount ?? 0)
    const totalCollection = Number(totalCollectionAgg._sum.amount ?? 0)
    const pendingCollection = Number(pendingCollectionAgg._sum.amount ?? 0)

    const configsByWardId = new Map<string, TaxConfigForDues[]>()
    for (const config of publishedConfigs) {
      const list = configsByWardId.get(config.wardId) ?? []
      list.push(config as TaxConfigForDues)
      configsByWardId.set(config.wardId, list)
    }

    const taxDemand = aggregateTaxDemand({
      wardIds: wards.map((w) => w.id),
      surveys: taxSurveys,
      configsByWardId,
    })

    const attachmentsWithUrls = await Promise.all(
      recentAttachments.map(async (a) => {
        let url: string | null = null
        try {
          if (a.mimeType.startsWith("image/")) {
            url = await this.storage.getSignedUrl(a.objectKey, 600)
          }
        } catch {
          url = null
        }
        return {
          id: a.id,
          originalFileName: a.originalFileName,
          mimeType: a.mimeType,
          createdAt: a.createdAt,
          url,
          survey: a.survey,
        }
      })
    )

    const wardBreakdown = wards.map((w) => {
      const surveyCount = countByWard.get(w.id) ?? 0
      const money = moneyByWard.get(w.id) ?? {
        online: 0,
        offline: 0,
        total: 0,
      }
      const pendingCollectionWard = pendingByWardMap.get(w.id) ?? 0
      const demand = taxDemand.byWard.get(w.id)
      const published = configsByWardId.get(w.id) ?? []
      const latest = pickLatestPublishedConfig(published)

      return {
        wardId: w.id,
        number: w.number,
        code: w.code,
        name: w.name,
        surveyCount,
        onlineCollection: money.online,
        offlineCollection: money.offline,
        pendingCollection: pendingCollectionWard,
        totalCollection: money.total,
        propertyTaxDemand: demand?.propertyTaxDemand ?? 0,
        waterTaxDemand: demand?.waterTaxDemand ?? 0,
        drainageTaxDemand: demand?.drainageTaxDemand ?? 0,
        totalTaxDemand: demand?.totalTaxDemand ?? 0,
        propertyTaxPct: demand?.propertyTaxPct ?? 0,
        waterTaxPct: demand?.waterTaxPct ?? 0,
        drainageTaxPct: demand?.drainageTaxPct ?? 0,
        surveyedWithDemand: demand?.surveyedWithDemand ?? 0,
        skippedSurveys: demand?.skippedSurveys ?? 0,
        assessmentYearName: latest?.assessmentYear.name ?? null,
        status: wardSurveyStatus(surveyCount),
      }
    })

    return {
      success: true as const,
      data: {
        totalProperties,
        draftSurveys,
        activeSurveys,
        archivedSurveys,
        completeQuality,
        needsReviewQuality,
        totalWards: wards.length,
        wardsWithSurveys,
        wardsInProgress,
        totalCollection,
        onlineCollection,
        offlineCollection,
        pendingCollection,
        pendingPayments,
        successPayments,
        failedPayments,
        propertyTaxDemand: taxDemand.propertyTaxDemand,
        waterTaxDemand: taxDemand.waterTaxDemand,
        drainageTaxDemand: taxDemand.drainageTaxDemand,
        totalTaxDemand: taxDemand.totalTaxDemand,
        propertyTaxPct: taxDemand.propertyTaxPct,
        waterTaxPct: taxDemand.waterTaxPct,
        drainageTaxPct: taxDemand.drainageTaxPct,
        recentAttachments: attachmentsWithUrls,
        wardBreakdown,
      },
    }
  }
}
