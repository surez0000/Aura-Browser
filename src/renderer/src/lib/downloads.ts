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
