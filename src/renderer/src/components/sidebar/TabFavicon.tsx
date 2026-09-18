import { useState } from 'react'
import { Globe, Loader2 } from 'lucide-react'
import type { TabInfo } from '@shared/models'

/** Favicon, spinner while loading, globe when a site has none. */
export function TabFavicon({ tab, size = 14 }: { tab: TabInfo; size?: number }): React.JSX.Element {
  const [imgFailed, setImgFailed] = useState(false)
  if (tab.isLoading) {
    return (
      <Loader2 size={size} className="shrink-0 animate-spin" style={{ color: 'var(--ink-3)' }} />
    )
  }
  if (tab.faviconUrl && !imgFailed) {
    return (
      <img
        src={tab.faviconUrl}
        alt=""
        className="shrink-0"
        style={{ width: size, height: size }}
        onError={() => setImgFailed(true)}
      />
    )
  }
  return <Globe size={size} className="shrink-0" style={{ color: 'var(--ink-3)' }} />
}
