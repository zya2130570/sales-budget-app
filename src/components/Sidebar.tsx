/**
 * Sidebar.tsx — V46
 * Linear-style fixed left sidebar. Collapsible. Keyboard shortcuts.
 * V46: overhauled icons — clearer at 16–18px, settings now a proper gear,
 *      active tab gets brand-blue icon color (not just brighter white).
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { loadBindings, MODIFIER_REQUIRED } from './KeyboardShortcutsPanel'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Accounts' | 'Transactions' | 'Scenarios' | 'Targets'

// ── Icons ─────────────────────────────────────────────────────────────────────
// All at 18×18 viewBox for crispness. Stroke-based, 1.6px weight.

const Icon = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="6" height="6" rx="1.2"/>
      <rect x="10.5" y="1.5" width="6" height="6" rx="1.2"/>
      <rect x="1.5" y="10.5" width="6" height="6" rx="1.2"/>
      <rect x="10.5" y="10.5" width="6" height="6" rx="1.2"/>
    </svg>
  ),
  income: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2.5v13M6 5.5C6 4.4 7.3 3.5 9 3.5s3 .9 3 2-.9 1.8-3 2c-2.1.2-3 1-3 2.1s1.3 2 3 2 3-.9 3-2"/>
    </svg>
  ),
  budget: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 15V9M6.5 15V5.5M11 15V8M15.5 15V3"/>
      <path d="M1 15h16"/>
    </svg>
  ),
  accounts: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="3.5" width="15" height="11" rx="1.5"/>
      <path d="M1.5 7.5h15"/>
      <circle cx="5" cy="11" r="1" fill="currentColor" stroke="none"/>
      <path d="M9 11h4"/>
    </svg>
  ),
  transactions: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5.5h12M12 2.5l3 3-3 3"/>
      <path d="M15 12.5H3M6 9.5l-3 3 3 3"/>
    </svg>
  ),
  scenarios: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2H6L4 9h5l-3 7 10-10h-5l2-4z"/>
    </svg>
  ),
  targets: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="7"/>
      <circle cx="9" cy="9" r="3.5"/>
      <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  // Bottom bar icons
  sun: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
    </svg>
  ),
  moon: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 10.5A6 6 0 0 1 5.5 2.5 6.5 6.5 0 1 0 13.5 10.5z"/>
    </svg>
  ),
  keyboard: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="3" width="13" height="10" rx="1.5"/>
      <path d="M4 6h.01M6.5 6h.01M9 6h.01M11.5 6h.01M4 8.5h.01M6.5 8.5h.01M9 8.5h.01M5 11h6"/>
    </svg>
  ),
  // PROPER GEAR — outer ring with 8 teeth, inner hole
  gear: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.2"/>
      <path d="M8 1.5 L8.8 1.6 L9.4 3.1 A5.2 5.2 0 0 1 10.9 3.9 L12.4 3.3 L13.6 4.5 L13.0 6.0 A5.2 5.2 0 0 1 13.5 7.5 L13.5 8.5 L13.0 9.8 A5.2 5.2 0 0 1 12.4 10.7 L13.6 11.5 L12.4 12.7 L10.9 12.1 A5.2 5.2 0 0 1 9.4 12.9 L8.8 14.4 L7.2 14.4 L6.6 12.9 A5.2 5.2 0 0 1 5.1 12.1 L3.6 12.7 L2.4 11.5 L3.0 10.0 A5.2 5.2 0 0 1 2.5 8.5 L2.5 7.5 L3.0 6.0 A5.2 5.2 0 0 1 3.6 4.5 L2.4 3.3 L3.6 2.1 L5.1 2.7 A5.2 5.2 0 0 1 6.6 1.9 L7.2 0.4"/>
    </svg>
  ),
  collapseLeft: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3L5 8l5 5M14 8H5"/>
    </svg>
  ),
  collapseRight: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3l5 5-5 5M2 8h9"/>
    </svg>
  ),
}

const NAV: { id: Tab; label: string; shortcut: string; icon: React.ReactNode }[] = [
  { id: 'Dashboard',    label: 'Dashboard',      shortcut: '1', icon: Icon.dashboard    },
  { id: 'Income',       label: 'Income',          shortcut: '2', icon: Icon.income       },
  { id: 'Budget',       label: 'Budget',          shortcut: '3', icon: Icon.budget       },
  { id: 'Accounts',     label: 'Accounts',        shortcut: '4', icon: Icon.accounts     },
  { id: 'Transactions', label: 'Transactions',    shortcut: '5', icon: Icon.transactions },
  { id: 'Scenarios',    label: 'Scenarios',       shortcut: '6', icon: Icon.scenarios    },
  { id: 'Targets',      label: 'Savings Goals',   shortcut: '7', icon: Icon.targets      },
]

const SIDEBAR_WIDTH_KEY = 'flow_sidebar_width'
const DEFAULT_WIDTH = 260
const MIN_WIDTH = 180
const MAX_WIDTH = 400

function loadSidebarWidth(): number {
  try { return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? String(DEFAULT_WIDTH)))) }
  catch { return DEFAULT_WIDTH }
}

type Props = {
  currentTab: Tab
  onNavigate: (tab: Tab) => void
  onOpenSettings: () => void
  onOpenProfile?: () => void
  onOpenKeyboardShortcuts?: () => void
  collapsed: boolean
  onToggle: () => void
  theme?: 'dark' | 'light'
  onToggleTheme?: () => void
  onSync?: () => void
  onOpenAIChat?: () => void
  onOpenCloud?: () => void
  onOpenVersion?: () => void
  onWidthChange?: (w: number) => void
}

// Reusable bottom-bar button
function BottomBtn({
  onClick, title, icon, label, shortcutLabel, collapsed: c, accent,
}: {
  onClick: () => void; title?: string; icon: React.ReactNode; label: string
  shortcutLabel?: string; collapsed: boolean; accent?: boolean
}) {
  const [hover, setHover] = useState(false)
  const base = accent ? 'rgba(94,106,210,0.8)' : 'rgba(255,255,255,0.35)'
  const hovered = accent ? 'rgba(124,140,255,1)' : 'rgba(255,255,255,0.65)'
  return (
    <button
      onClick={onClick}
      title={c ? `${title ?? label}` : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: c ? '8px 0' : '7px 16px',
        justifyContent: c ? 'center' : 'flex-start',
        color: hover ? hovered : base,
        fontSize: 13, background: 'transparent', border: 'none',
        cursor: 'pointer', transition: 'color 0.12s ease',
      }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {!c && (
        <>
          <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
          {shortcutLabel && (
            <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', flexShrink: 0 }}>
              {shortcutLabel}
            </kbd>
          )}
        </>
      )}
    </button>
  )
}

export function Sidebar({ currentTab, onNavigate, onOpenSettings, onOpenProfile, onOpenKeyboardShortcuts, collapsed, onToggle, theme = 'dark', onToggleTheme, onSync, onOpenAIChat, onOpenCloud, onOpenVersion, onWidthChange }: Props) {

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const b = loadBindings()
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        if (k === b.cloud.toLowerCase()) { e.preventDefault(); onOpenCloud?.(); return }
      }
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (k === b.sidebar.toLowerCase()) { onToggle(); return }
      if (k === b.settings.toLowerCase()) { e.preventDefault(); onOpenSettings(); return }
      if (k === b.ai.toLowerCase()) { e.preventDefault(); onOpenAIChat?.(); return }
      if (k === b.version.toLowerCase()) { e.preventDefault(); onOpenVersion?.(); return }
      if (k === b.profile.toLowerCase()) { e.preventDefault(); onOpenProfile?.(); return }
      if ((k === b.help.toLowerCase() || e.key === '/') && onOpenKeyboardShortcuts) { e.preventDefault(); onOpenKeyboardShortcuts(); return }
      if (k === b.theme.toLowerCase() && onToggleTheme) { e.preventDefault(); onToggleTheme(); return }
      const navIds: Array<keyof typeof b> = ['nav1','nav2','nav3','nav4','nav5','nav6','nav7']
      const navIdx = navIds.findIndex(id => !MODIFIER_REQUIRED.has(id as never) && k === b[id].toLowerCase())
      if (navIdx >= 0 && navIdx < NAV.length) onNavigate(NAV[navIdx].id)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNavigate, onOpenSettings, onOpenProfile, onOpenKeyboardShortcuts, onToggle, onToggleTheme, onSync, onOpenAIChat, onOpenCloud, onOpenVersion])

  const [customWidth, setCustomWidth] = useState<number>(loadSidebarWidth)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (collapsed) return
    e.preventDefault()
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartW.current = customWidth
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = ev.clientX - dragStartX.current
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartW.current + delta))
      setCustomWidth(next)
      onWidthChange?.(next)
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(next)))
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [collapsed, customWidth, onWidthChange])

  const W = collapsed ? 56 : customWidth

  return (
    <aside
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: W, zIndex: 40,
        background: '#0D0D11',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        transition: dragging.current ? 'none' : 'width 0.2s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div style={{ padding: collapsed ? '16px 0' : '16px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {collapsed
          ? <div style={{ width: W, display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#5E6AD2,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white', fontSize: 14, fontWeight: 800 }}>F</span>
              </div>
            </div>
          : <>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#5E6AD2,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: 'white', fontSize: 14, fontWeight: 800 }}>F</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>Flow</span>
            </>
        }
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '6px 0', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map(item => {
          const isActive = currentTab === item.id
          const [hover, setHover] = useState(false)
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? `${item.label}  [${item.shortcut}]` : undefined}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                gap: 11, padding: collapsed ? '9px 0' : '9px 16px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: isActive
                  ? 'rgba(94,106,210,0.12)'
                  : hover ? 'rgba(255,255,255,0.03)' : 'transparent',
                borderLeft: isActive ? '2px solid #5E6AD2' : '2px solid transparent',
                color: isActive
                  ? '#818CF8'
                  : hover ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.38)',
                fontSize: 14, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', border: 'none', outline: 'none',
                transition: 'color 0.1s, background 0.1s',
                whiteSpace: 'nowrap', borderRadius: 0,
              }}
            >
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                  <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.22)', fontFamily: 'monospace', flexShrink: 0 }}>{item.shortcut}</kbd>
                </>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '4px 0', flexShrink: 0 }}>
        {onToggleTheme && (
          <BottomBtn onClick={onToggleTheme} collapsed={collapsed}
            icon={theme === 'dark' ? Icon.sun : Icon.moon}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            shortcutLabel="T"
          />
        )}
        {onOpenKeyboardShortcuts && (
          <BottomBtn onClick={onOpenKeyboardShortcuts} collapsed={collapsed}
            icon={Icon.keyboard} label="Keyboard shortcuts" shortcutLabel="?"
          />
        )}
        {onOpenAIChat && (
          <BottomBtn onClick={onOpenAIChat} collapsed={collapsed}
            icon={<span style={{ fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center' }}>✦</span>}
            label="AI Assistant" shortcutLabel="8"
          />
        )}
        {/* Settings — proper gear icon, not a sun */}
        <BottomBtn onClick={onOpenSettings} collapsed={collapsed}
          icon={Icon.gear} label="Settings" shortcutLabel="0"
          title="Settings"
        />
        <BottomBtn
          onClick={onToggle} collapsed={collapsed}
          icon={collapsed ? Icon.collapseRight : Icon.collapseLeft}
          label="Collapse"
          shortcutLabel="["
        />
      </div>

      {/* Drag handle */}
      {!collapsed && (
        <div
          onMouseDown={onMouseDown}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10, background: 'transparent' }}
          title="Drag to resize sidebar"
        />
      )}
    </aside>
  )
}
