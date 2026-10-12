import type { ReactNode } from 'react'
import { SettingsNav } from '@/components/layout/settings-nav'
import { settingsNavFor } from '@/components/layout/navigation'
import { extensionEnabled } from '@/lib/extension/availability'

/*
 * Every settings page gets the rail. On a phone it wraps into a chip row above
 * the content rather than eating a third of the width.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/*
        * The rail is filtered here, in a server component, because the flag
        * is not public and SettingsNav runs in the browser. While the
        * extension is off there is no entry for it — not a greyed one.
        */}
      <SettingsNav groups={settingsNavFor({ extension: extensionEnabled() })} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
