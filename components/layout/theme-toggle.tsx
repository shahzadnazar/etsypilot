'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'

type Mode = 'light' | 'dark' | 'system'
const MODES: Mode[] = ['light', 'dark', 'system']

/** All three states are first-class; none is a fallback for another (D1). */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system')

  useEffect(() => {
    const stored = (localStorage.getItem('etsypilot-theme') as Mode | null) ?? 'system'
    setMode(stored)
  }, [])

  function apply(next: Mode) {
    setMode(next)
    localStorage.setItem('etsypilot-theme', next)
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-full border border-line bg-surface p-[3px]"
    >
      {MODES.map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => apply(m)}
          className={cn(
            'rounded-full px-2.5 py-1.5 text-[11px] font-semibold capitalize transition-colors duration-150',
            mode === m ? 'bg-brand text-white' : 'text-ink-2 hover:bg-canvas-soft',
          )}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
