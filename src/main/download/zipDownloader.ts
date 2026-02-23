/**
 * Phase 10: Zip archive download utility.
 *
 * Downloads multiple Drive files and packages them into a .zip archive.
 * Uses the `archiver` library for streaming zip creation.
 */

import { createWriteStream } from 'fs'
import archiver from 'archiver'
import { downloadFileBuffer, isWorkspaceMime, getExportExtension } from '../drive/driveApi'
import { throttledDriveCall } from '../drive/rateLimiter'

export interface ZipDownloadItem {
  fileId: string
  fileName: string
  mimeType: string
}

export interface ZipDownloadProgress {
  current: number
  total: number
  fileName: string
}

/**
 * Download multiple files and package them into a zip archive at `destPath`.
 * Calls `onProgress` for each file downloaded.
 */
export async function downloadAsZip(
  items: ZipDownloadItem[],
  destPath: string,
  onProgress?: (progress: ZipDownloadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(destPath)
    const archive = archiver('zip', { zlib: { level: 5 } })

    output.on('close', () => resolve())
    archive.on('error', (err) => reject(err))
    archive.pipe(output)

    // Use an async IIFE to handle sequential downloads
    ;(async () => {
      // Track used names to avoid duplicates in the zip
      const usedNames = new Map<string, number>()

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!
        onProgress?.({ current: i + 1, total: items.length, fileName: item.fileName })

        try {
          const buffer = await throttledDriveCall(() =>
            downloadFileBuffer(item.fileId, item.mimeType)
          )

          // Determine the final filename
          let name = item.fileName
          if (isWorkspaceMime(item.mimeType)) {
            const ext = getExportExtension(item.mimeType)
            if (ext && !name.endsWith(ext)) {
              name = name + ext
            }
          }

          // Deduplicate names
          const count = usedNames.get(name) ?? 0
          if (count > 0) {
            const dotIdx = name.lastIndexOf('.')
            if (dotIdx > 0) {
              name = `${name.slice(0, dotIdx)} (${count})${name.slice(dotIdx)}`
            } else {
              name = `${name} (${count})`
            }
          }
          usedNames.set(item.fileName, count + 1)

          archive.append(buffer, { name })
        } catch (err) {
          console.warn(`[zipDownloader] Failed to download ${item.fileName}:`, err)
          // Continue with other files instead of failing the whole archive
        }
      }

      await archive.finalize()
    })().catch(reject)
  })
}
