"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CloudOff,
  ExternalLink,
  ImageOff,
  ImagePlus,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { api } from "@/lib/api"
import {
  imageTileState,
  summarizeSurveyImages,
  type ImageLoadState,
  type SurveyImageStorageStatus,
} from "@/lib/survey-image-state"

export type SurveyImage = {
  id: string
  originalFileName: string
  mimeType: string
  imageType: string | null
  storageStatus?: SurveyImageStorageStatus
  migrationError?: string | null
  createdAt: string
  url: string | null
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf"

/** Responsive image gallery for a survey (signed, short-lived API links). */
export function SurveyImages({
  surveyId,
  images,
  canEdit,
}: {
  surveyId: string
  images: SurveyImage[]
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pendingDelete, setPendingDelete] = React.useState<SurveyImage | null>(null)

  // The detail page keys its query by the route param (db id or property
  // id), so refresh every cached survey detail rather than guessing the key.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["survey"] })

  const migrate = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ attempted: number; available: number; failed: number }>(
          `/api/v1/surveys/${surveyId}/attachments/migrate`
        )
      ).data,
    onSuccess: async (result) => {
      if (result.failed) {
        toast.error(`${result.failed} image${result.failed === 1 ? "" : "s"} could not be migrated`)
      } else if (result.available) {
        toast.success(`${result.available} image${result.available === 1 ? "" : "s"} migrated`)
      } else {
        toast.info("No images are waiting for migration")
      }
      await refresh()
    },
    onError: (err: Error) => toast.error(err.message || "Migration failed"),
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      return api.postForm(`/api/v1/surveys/${surveyId}/attachments`, form)
    },
    onSuccess: async () => {
      toast.success("Image uploaded")
      await refresh()
    },
    onError: (err: Error) => toast.error(err.message || "Upload failed"),
  })

  const remove = useMutation({
    mutationFn: async (imageId: string) =>
      api.delete(`/api/v1/surveys/${surveyId}/attachments/${imageId}`),
    onSuccess: async () => {
      toast.success("Image removed")
      setPendingDelete(null)
      await refresh()
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{summarizeSurveyImages(images)}</p>
        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label="Upload property image"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) upload.mutate(file)
                e.target.value = ""
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="min-h-10 cursor-pointer"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {upload.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
              {upload.isPending ? "Uploading…" : "Add image"}
            </Button>
          </>
        ) : null}
      </div>

      {images.length ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((image) => (
            <li key={image.id} className="overflow-hidden rounded-xl border bg-muted/20">
              <ImageTile
                image={image}
                canMigrate={canEdit}
                migrating={migrate.isPending}
                onMigrate={() => migrate.mutate()}
                onLinkExpired={refresh}
              />
              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{image.imageType || "Image"}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground" title={image.originalFileName}>
                    {image.originalFileName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {image.url ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-10 cursor-pointer"
                      render={<a href={image.url} target="_blank" rel="noreferrer" />}
                      aria-label={`Open ${image.imageType ?? "image"} in a new tab`}
                    >
                      <ExternalLink />
                    </Button>
                  ) : null}
                  {canEdit ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-10 cursor-pointer text-destructive"
                      aria-label={`Remove ${image.imageType ?? "image"}`}
                      onClick={() => setPendingDelete(image)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={pendingDelete != null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this image?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.imageType ?? "Image"} ({pendingDelete?.originalFileName}) will be
              removed from this survey and from storage. This is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              disabled={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              {remove.isPending ? "Removing…" : "Remove image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ImageTile({
  image,
  canMigrate,
  migrating,
  onMigrate,
  onLinkExpired,
}: {
  image: SurveyImage
  canMigrate: boolean
  migrating: boolean
  onMigrate: () => void
  onLinkExpired: () => void
}) {
  const [load, setLoad] = React.useState<ImageLoadState>({ failedUrl: null, retried: false })
  const state = imageTileState(image, load)
  const frame = "flex aspect-[4/3] w-full items-center justify-center bg-muted text-muted-foreground"

  if (state === "pending" || state === "failed") {
    const failed = state === "failed"
    return (
      <div className={`${frame} flex-col gap-2 p-4 text-center`}>
        {migrating ? (
          <Loader2 className="size-8 animate-spin" aria-hidden />
        ) : (
          <CloudOff className="size-8" aria-hidden />
        )}
        <Badge variant={failed && !migrating ? "destructive" : "secondary"}>
          {migrating ? "Migrating…" : failed ? "Migration failed" : "Awaiting migration"}
        </Badge>
        {failed && image.migrationError && !migrating ? (
          <p className="line-clamp-2 text-xs">{image.migrationError}</p>
        ) : null}
        {canMigrate ? (
          <Button
            size="sm"
            variant="outline"
            className="min-h-10 cursor-pointer"
            disabled={migrating}
            onClick={onMigrate}
          >
            <RefreshCw />
            {failed ? "Retry migration" : "Migrate now"}
          </Button>
        ) : null}
      </div>
    )
  }
  if (state === "refreshing") {
    return (
      <div className={frame} aria-busy>
        <Loader2 className="size-8 animate-spin" aria-label="Refreshing image link" />
      </div>
    )
  }
  if (state === "unavailable") {
    return (
      <div className={`${frame} flex-col gap-2`}>
        <ImageOff className="size-8" aria-hidden />
        <span className="text-xs">{load.failedUrl ? "Image could not be loaded" : "Not available"}</span>
      </div>
    )
  }
  if (state === "document") {
    return (
      <a href={image.url!} target="_blank" rel="noreferrer" className={`${frame} text-sm underline`}>
        Open document
      </a>
    )
  }
  return (
    // Signed, expiring API URLs — next/image optimization would cache them.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.url!}
      alt={`${image.imageType ?? "Property image"} — ${image.originalFileName}`}
      loading="lazy"
      decoding="async"
      className="aspect-[4/3] w-full bg-muted object-cover"
      onError={() => {
        // Lazy images can load after the 5-minute link expired: re-sign once.
        const retry = !load.retried
        setLoad({ failedUrl: image.url, retried: true })
        if (retry) onLinkExpired()
      }}
    />
  )
}
