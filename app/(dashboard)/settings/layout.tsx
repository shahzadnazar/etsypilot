import type { ReactNode } from 'react'
import { SettingsNav } from '@/components/layout/settings-nav'
import { SETTINGS_NAV } from '@/components/layout/navigation'

/*
 * Every settings page gets the rail. On a phone it wraps into a chip row above
 * the content rather than eating a third of the width.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/*
        * The whole rail, unfiltered. It was filtered here while the browser
        * extension was switched off — a server component, because the flag was
        * not public and SettingsNav runs in the browser. D95 removed the
        * extension, so there is nothing to filter.
        */}
      <SettingsNav groups={SETTINGS_NAV} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
