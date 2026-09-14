/**
 * ProductImageUploader.tsx — admin product form's image field.
 *
 * Reuses `products.online_image_url` (migration 034) via the dedicated
 * POST/DELETE /products/:id/image pair (routes/products.js) — no new
 * schema, no new storage provider (see that route's docblock).
 *
 * Two modes, controlled by whether `productId` is provided:
 *   - EDIT (productId set): every action hits the real endpoint
 *     immediately — there's a row to attach the image to.
 *   - CREATE (productId undefined): there's no product row yet (the
 *     upload endpoint needs an id), so a selected file is staged
 *     locally (an object URL preview only) via `onStage`, and the
 *     parent (ProductsPage.tsx) uploads it as a non-fatal follow-up
 *     once the product is actually created — the same pattern already
 *     used there for opening-stock/inventory-planning.
 */
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, ImageOff, X, Loader2 } from 'lucide-react'
import { Button, ConfirmDialog } from '@/components/ui'
import { useUploadProductImage, useRemoveProductImage } from '@/hooks/useQuery'
import { resolveImageUrl } from '@/utils'

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

function validateClientSide(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Please choose a JPG, PNG, or WEBP image.'
  if (file.size > MAX_BYTES) return 'Image must be smaller than 5MB.'
  return null
}

export default function ProductImageUploader({
  productId, currentImageUrl, stagedFile, onStage,
}: {
  /** Edit mode when set — upload/remove act on the real product immediately. */
  productId?: string
  /** Existing saved image (edit mode only). */
  currentImageUrl?: string | null
  /** Create mode only — a file already staged for upload after the product is created. */
  stagedFile?: File | null
  /** Create mode only — called with the picked File, or null to clear staging. */
  onStage?: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const uploadMut = useUploadProductImage()
  const removeMut = useRemoveProductImage()

  const isCreateMode = !productId
  const busy = uploadMut.isPending || removeMut.isPending

  const stagedPreview = useStagedPreview(isCreateMode ? stagedFile : null)
  const previewUrl = isCreateMode ? stagedPreview : resolveImageUrl(currentImageUrl)

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the exact same file later
    if (!file) return
    const validationError = validateClientSide(file)
    if (validationError) { setError(validationError); return }
    setError(null)

    if (isCreateMode) {
      onStage?.(file)
    } else {
      uploadMut.mutate({ id: productId!, file }, { onError: (e: any) => setError(e?.message || 'Upload failed.') })
    }
  }

  function handleRemove() {
    if (isCreateMode) { onStage?.(null); return }
    removeMut.mutate(productId!, { onError: (e: any) => setError(e?.message || 'Could not remove image.') })
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide block">Product Image</label>

      {previewUrl ? (
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden flex items-center justify-center flex-shrink-0">
            <img src={previewUrl} alt="Product preview" className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy && uploadMut.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
              Change Image
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(true)}>
              <X size={13} className="mr-1" />Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button" disabled={busy} onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed border-[var(--border)] text-[var(--text-3)] hover:border-brand hover:text-brand transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
          <span className="text-xs font-semibold">{busy ? 'Uploading…' : 'Choose Image'}</span>
          <span className="text-[10px] text-[var(--text-4)]">JPG, PNG, or WEBP — up to 5MB</span>
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePick} />

      {error && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-600 font-medium">
          <ImageOff size={12} />{error}
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={handleRemove}
        title="Remove product image?"
        confirmLabel="Remove"
        danger
        message="The product will keep showing without an image until you upload a new one."
      />
    </div>
  )
}

function useStagedPreview(file: File | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setUrl(null); return }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return url
}
