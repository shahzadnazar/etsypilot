'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

/*
 * One open/closed flag for the operator drawer, shared by the two controls
 * that open it.
 *
 * The drawer lives in the top bar and the bottom tab bar's "More" opens the
 * same one. The alternative was a second drawer, or a button that reached
 * across the DOM for the first one's trigger and clicked it — both of which
 * are how two navigations come to disagree about what is open.
 *
 * It is a context rather than state lifted into OperatorShell because the
 * shell is a SERVER component: it computes the viewer's navigation with the
 * same `can` the pages gate on, so the browser bundle never learns which items
 * this viewer was refused. Making it a client component to hold a boolean
 * would have moved that filtering decision into the bundle.
 */
const OperatorDrawerContext = createContext<{
  open: boolean
  setOpen: (open: boolean) => void
} | null>(null)

export function OperatorDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <OperatorDrawerContext.Provider value={{ open, setOpen }}>
      {children}
    </OperatorDrawerContext.Provider>
  )
}

export function useOperatorDrawer() {
  const context = useContext(OperatorDrawerContext)
  if (!context) throw new Error('useOperatorDrawer outside OperatorDrawerProvider')
  return context
}
