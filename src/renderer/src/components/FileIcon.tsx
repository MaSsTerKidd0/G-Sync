/**
 * Centralized file-type icon component.
 *
 * Uses PNG/SVG assets from `assets/file-icons/` for common file types,
 * with a generic fallback icon rendered inline.
 *
 * Asset naming convention:
 *   icon-{type}.png   (e.g. icon-pdf.png, icon-excel.png, icon-word.png)
 *
 * Supports two render modes:
 *   - <FileIcon />       — renders an <img> at the given size (for list/grid views)
 *   - getFileIconSrc()   — returns just the asset URL (for advanced use)
 */

// ── Asset imports (Vite resolves these to hashed URLs) ──
import iconFolder from '../assets/file-icons/icon-folder.png'
import iconPdf from '../assets/file-icons/icon-pdf.png'
import iconExcel from '../assets/file-icons/icon-excel.png'
import iconWord from '../assets/file-icons/icon-word.png'
import iconPowerpoint from '../assets/file-icons/icon-powerpoint.png'
import iconImage from '../assets/file-icons/icon-image.png'
import iconVideo from '../assets/file-icons/icon-video.png'
import iconAudio from '../assets/file-icons/icon-audio.png'
import iconArchive from '../assets/file-icons/icon-archive.png'
import iconCode from '../assets/file-icons/icon-code.png'
import iconText from '../assets/file-icons/icon-text.png'
import iconGeneric from '../assets/file-icons/icon-generic.png'

// ── Type → asset mapping ──

type DriveItemType = 'folder' | 'file' | 'shortcut'

/**
 * Resolve a file's mimeType + type to an icon asset URL.
 */
export function getFileIconSrc(mimeType: string, type: DriveItemType): string {
  // Folders
  if (type === 'folder') return iconFolder

  const mt = mimeType.toLowerCase()

  // PDF
  if (mt === 'application/pdf') return iconPdf

  // Excel / Spreadsheets
  if (
    mt.includes('spreadsheet') ||
    mt.includes('excel') ||
    mt === 'text/csv' ||
    mt === 'text/tab-separated-values' ||
    mt === 'application/vnd.google-apps.spreadsheet'
  ) return iconExcel

  // Word / Documents
  if (
    mt.includes('wordprocessing') ||
    mt.includes('msword') ||
    mt === 'application/vnd.google-apps.document' ||
    mt === 'application/rtf'
  ) return iconWord

  // PowerPoint / Presentations
  if (
    mt.includes('presentation') ||
    mt.includes('powerpoint') ||
    mt === 'application/vnd.google-apps.presentation'
  ) return iconPowerpoint

  // Images
  if (mt.startsWith('image/')) return iconImage

  // Videos
  if (mt.startsWith('video/')) return iconVideo

  // Audio
  if (mt.startsWith('audio/')) return iconAudio

  // Archives
  if (
    mt === 'application/zip' ||
    mt === 'application/x-rar-compressed' ||
    mt === 'application/x-7z-compressed' ||
    mt === 'application/gzip' ||
    mt === 'application/x-tar' ||
    mt === 'application/x-bzip2'
  ) return iconArchive

  // Code / scripts
  if (
    mt === 'application/javascript' ||
    mt === 'application/json' ||
    mt === 'application/xml' ||
    mt === 'text/html' ||
    mt === 'text/css' ||
    mt === 'text/javascript' ||
    mt === 'text/xml' ||
    mt === 'application/x-python' ||
    mt === 'text/x-python' ||
    mt === 'application/typescript'
  ) return iconCode

  // Plain text
  if (mt.startsWith('text/')) return iconText

  // Google Apps types without better match
  if (mt === 'application/vnd.google-apps.drawing') return iconImage
  if (mt === 'application/vnd.google-apps.form') return iconGeneric
  if (mt === 'application/vnd.google-apps.site') return iconGeneric

  return iconGeneric
}

// ── React Component ──

interface FileIconProps {
  mimeType: string
  type: DriveItemType
  /** Icon size in pixels (width & height). Default 24. */
  size?: number
  className?: string
}

export default function FileIcon({ mimeType, type, size = 24, className = '' }: FileIconProps) {
  const src = getFileIconSrc(mimeType, type)

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`flex-shrink-0 object-contain ${className}`}
      draggable={false}
    />
  )
}
