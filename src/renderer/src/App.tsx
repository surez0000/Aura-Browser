import { Sidebar } from '@/components/sidebar/Sidebar'
import { PageCard } from '@/components/PageCard'
import { Palette } from '@/components/palette/Palette'
import { useIpcSync } from '@/state/sync'
import { useUi } from '@/state/ui'

export default function App(): React.JSX.Element {
  useIpcSync()
  const collapsed = useUi((s) => s.sidebarCollapsed)

  return (
    <div className="app-bg flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className={`h-full min-w-0 flex-1 p-2 ${collapsed ? 'pl-2' : 'pl-0'}`}>
        <PageCard />
      </main>
      <Palette />
    </div>
  )
}
