import type { DownloadInfo } from '@shared/models'

/**
 * How far along everything in flight is, 0–1, or null when nothing is running.
 *
 * Downloads whose size the server never declared are left out of the total
 * rather than counted as complete: including them at zero would drag a nearly
 * finished ring backwards, and counting them as done would show a full ring
 * over an unfinished download. When *every* running download is unsized there
 * is no honest fraction to show, so it reports 0 and the ring simply spins
 * empty until something better is known.
 */
export function overallProgress(downloads: readonly DownloadInfo[]): number | null {
  const running = downloads.filter((d) => d.state === 'progressing')
  if (running.length === 0) return null
  const sized = running.filter((d) => d.totalBytes > 0)
  if (sized.length === 0) return 0
  const received = sized.reduce((sum, d) => sum + d.receivedBytes, 0)
  const total = sized.reduce((sum, d) => sum + d.totalBytes, 0)
  return total > 0 ? Math.min(1, received / total) : 0
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

/** How far one download is, 0–1, or null when its size is unknown. */
export function downloadFraction(d: DownloadInfo): number | null {
  if (d.state === 'completed') return 1
  return d.totalBytes > 0 ? Math.min(1, d.receivedBytes / d.totalBytes) : null
}

/**
 * Roughly how long is left, from the average speed so far. Nothing for the
 * first second (the first chunk says little about the speed), or when the
 * size is unknown.
 */
export function timeLeft(d: DownloadInfo, now: number): string | null {
  if (d.state !== 'progressing' || d.totalBytes <= 0 || d.receivedBytes <= 0) return null
  const elapsed = (now - d.startedAt) / 1000
  if (elapsed < 1) return null
  const seconds = Math.ceil((d.totalBytes - d.receivedBytes) / (d.receivedBytes / elapsed))
  if (!Number.isFinite(seconds) || seconds < 0) return null
  if (seconds < 60) return `${Math.max(1, seconds)} s left`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min left`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min left`
}

/** One line on where a download is: size so far, time left, or how it ended. */
export function downloadStatus(d: DownloadInfo, now: number = Date.now()): string {
  switch (d.state) {
    case 'progressing': {
      if (d.receivedBytes === 0) return 'Starting…'
      const size =
        d.totalBytes > 0
          ? `${formatBytes(d.receivedBytes)} of ${formatBytes(d.totalBytes)}`
          : formatBytes(d.receivedBytes)
      const left = timeLeft(d, now)
      return left ? `${size} · ${left}` : size
    }
    case 'completed':
      return `Downloaded · ${formatBytes(d.receivedBytes)}`
    case 'cancelled':
      return 'Cancelled'
    case 'interrupted':
      return 'Failed: the download was interrupted'
  }
}

/** What the file manager is called here, for "Show in …". */
export function revealLabel(platform: string): string {
  if (platform === 'darwin') return 'Show in Finder'
  if (platform === 'win32') return 'Show in Explorer'
  return 'Show in Folder'
}
