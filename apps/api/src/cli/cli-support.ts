/**
 * Shared helpers for operational CLIs compiled to dist/cli/*.js.
 * Run locally:   pnpm --filter api build && node apps/api/dist/cli/<name>.js …
 * Run in prod:   docker compose exec api node dist/cli/<name>.js …
 */
import "dotenv/config"

import { type INestApplicationContext, Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs, type ParseArgsConfig } from "node:util"

import { AppModule } from "../app.module"
import type { AuthUser } from "../auth/auth.decorators"
import { PrismaService } from "../prisma/prisma.service"

export function cliArgs<T extends NonNullable<ParseArgsConfig["options"]>>(
  options: T,
  usage: string
) {
  try {
    const parsed = parseArgs({ options, allowPositionals: false, strict: true })
    if ((parsed.values as Record<string, unknown>).help) {
      console.log(usage)
      process.exit(0)
    }
    return parsed.values
  } catch (err) {
    console.error(`${(err as Error).message}\n\n${usage}`)
    process.exit(2)
  }
}

export async function withAppContext<T>(
  fn: (app: INestApplicationContext) => Promise<T>
): Promise<T> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  })
  try {
    return await fn(app)
  } finally {
    await app.close()
  }
}

/** Resolve the staff user recorded as actor in audit logs and import jobs. */
export async function resolveActor(
  app: INestApplicationContext,
  email: string | undefined
): Promise<AuthUser> {
  if (!email) {
    throw new Error("--actor <staff email> is required for audited writes")
  }
  const prisma = app.get(PrismaService)
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || user.status !== "ACTIVE") {
    throw new Error(`No active staff user with email ${email}`)
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    permissions: [],
    roles: [],
  }
}

/** Write a JSON + Markdown report pair; returns the JSON path. */
export async function writeReport(
  outDir: string,
  baseName: string,
  json: unknown,
  markdown: string
): Promise<string> {
  await mkdir(outDir, { recursive: true })
  const jsonPath = path.join(outDir, `${baseName}.json`)
  await writeFile(jsonPath, JSON.stringify(json, null, 2))
  await writeFile(path.join(outDir, `${baseName}.md`), markdown)
  return jsonPath
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-")
}

export function runCli(name: string, main: () => Promise<number | void>) {
  const logger = new Logger(name)
  main()
    .then((code) => process.exit(code ?? 0))
    .catch((err: unknown) => {
      logger.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    })
}

/** Markdown table helper. */
export function mdTable(headers: string[], rows: Array<Array<unknown>>): string {
  const esc = (v: unknown) =>
    String(v ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>")
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n")
}
