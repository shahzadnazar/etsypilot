import type { ReactNode } from 'react'
import { SettingsNav } from '@/components/layout/settings-nav'

/*
 * Every settings page gets the rail. On a phone it wraps into a chip row above
 * the content rather than eating a third of the width.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      <SettingsNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
