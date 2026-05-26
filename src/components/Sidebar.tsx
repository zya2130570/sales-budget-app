/**
 * Sidebar.tsx — V29
 * Linear-style fixed left sidebar. Collapsible. Keyboard shortcuts.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { loadBindings, MODIFIER_REQUIRED } from './KeyboardShortcutsPanel'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Accounts' | 'Transactions' | 'Scenarios' | 'Targets'

const NAV: { id: Tab; label: string; shortcut: string; icon: React.ReactNode }[] = [
  {
    id: 'Dashboard', label: 'Dashboard', shortcut: '1',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>,
  },
  {
    id: 'Income', label: 'Income', shortcut: '2',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v7M6 6.5c0-.83.67-1.5 2-1.5s2 .67 2 1.5-.67 1.5-2 1.5-2 .67-2 1.5.67 1.5 2 1.5 2-.67 2-1.5"/></svg>,
  },
  {
    id: 'Budget', label: 'Budget', shortcut: '3',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12V6l4-3 4 3v6"/><path d="M6 12V9h4v3"/><rect x="1" y="12" width="14" height="1.5" rx="0.5"/></svg>,
  },
  {
    id: 'Accounts', label: 'Accounts', shortcut: '4',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 6.5h14"/><path d="M4 9.5h2M10 9.5h2"/></svg>,
  },
  {
    id: 'Transactions', label: 'Transactions', shortcut: '5',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h12M2 8h8M2 12h10"/><path d="M12 10l2 2-2 2"/></svg>,
  },
  {
    id: 'Scenarios', label: 'Scenarios', shortcut: '6',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2H5L3 8h4l-2 6 8-8H9l2-4z"/></svg>,
  },
  {
    id: 'Targets', label: 'Savings Goals', shortcut: '7',
    icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="0.75" fill="currentColor" stroke="none"/></svg>,
  },
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

export function Sidebar({ currentTab, onNavigate, onOpenSettings, onOpenProfile, onOpenKeyboardShortcuts, collapsed, onToggle, theme = 'dark', onToggleTheme, onSync, onOpenAIChat, onOpenCloud, onOpenVersion, onWidthChange }: Props) {

  // V42 — keyboard shortcuts read from saved bindings (rebindable via KeyboardShortcutsPanel)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const b = loadBindings()
      const k = e.key.toLowerCase()

      // Modifier shortcuts (Ctrl/Cmd+key) — work even in input fields
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        if (k === b.cloud.toLowerCase()) { e.preventDefault(); onOpenCloud?.(); return }
      }

      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // Single-key shortcuts
      if (k === b.sidebar.toLowerCase()) { onToggle(); return }
      if (k === b.settings.toLowerCase()) { e.preventDefault(); onOpenSettings(); return }
      if (k === b.ai.toLowerCase()) { e.preventDefault(); onOpenAIChat?.(); return }
      if (k === b.version.toLowerCase()) { e.preventDefault(); onOpenVersion?.(); return }
      if (k === b.profile.toLowerCase()) { e.preventDefault(); onOpenProfile?.(); return }
      if ((k === b.help.toLowerCase() || e.key === '/') && onOpenKeyboardShortcuts) { e.preventDefault(); onOpenKeyboardShortcuts(); return }
      if (k === b.theme.toLowerCase() && onToggleTheme) { e.preventDefault(); onToggleTheme(); return }

      // Nav shortcuts 1-7
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

  const W = collapsed ? 64 : customWidth

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
      <div style={{ padding: collapsed ? '18px 0' : '18px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {collapsed
          ? <div style={{ width: 64, display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg,#5B6AF0,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'white', fontSize: 14, fontWeight: 700, letterSpacing: '-0.5px' }}>F</span>
              </div>
            </div>
          : <>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg,#5B6AF0,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>F</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>Flow</span>
            </>
        }
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map(item => {
          const isActive = currentTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? `${item.label} (${item.shortcut})` : undefined}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                gap: 12, padding: collapsed ? '10px 0' : '10px 18px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                borderLeft: isActive ? '2px solid #5B6AF0' : '2px solid transparent',
                color: isActive ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.42)',
                fontSize: 15, fontWeight: isActive ? 600 : 500,
                cursor: 'pointer', border: 'none', outline: 'none',
                transition: 'all 0.12s ease',
                whiteSpace: 'nowrap',
                borderRadius: 0,
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.72)'; (e.currentTarget as HTMLElement).style.background = isActive ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = isActive ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.42)'; (e.currentTarget as HTMLElement).style.background = isActive ? 'rgba(255,255,255,0.07)' : 'transparent' }}
            >
              <span style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>{item.icon}</span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                  <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', flexShrink: 0 }}>{item.shortcut}</kbd>
                </>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom: Settings + Collapse */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 0', flexShrink: 0 }}>

        {/* Theme toggle */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            title={collapsed ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '8px 0' : '7px 16px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: 'rgba(255,255,255,0.35)', fontSize: 15,
              background: 'transparent', border: 'none', cursor: 'pointer',
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="3.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.8 2.8l1.4 1.4M11.8 11.8l1.4 1.4M2.8 13.2l1.4-1.4M11.8 4.2l1.4-1.4"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.5 10.5A6 6 0 0 1 5.5 2.5 6.5 6.5 0 1 0 13.5 10.5z"/>
              </svg>
            )}
            {!collapsed && <><span style={{ flex: 1, textAlign: 'left' }}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span><kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', flexShrink: 0 }}>T</kbd></>}
          </button>
        )}

        {/* Keyboard shortcuts */}
        {onOpenKeyboardShortcuts && (
          <button
            onClick={onOpenKeyboardShortcuts}
            title={collapsed ? 'Keyboard shortcuts (?)' : undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '8px 0' : '7px 16px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: 'rgba(255,255,255,0.35)', fontSize: 15,
              background: 'transparent', border: 'none', cursor: 'pointer',
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M4 6h.01M6.5 6h.01M9 6h.01M11.5 6h.01M4 8.5h.01M6.5 8.5h.01M9 8.5h.01M5 11h6"/>
            </svg>
            {!collapsed && <><span style={{ flex: 1, textAlign: 'left' }}>Keyboard shortcuts</span><kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', flexShrink: 0 }}>?</kbd></>}
          </button>
        )}

        {/* V33 — AI Chat */}
        {onOpenAIChat && (
          <button
            onClick={onOpenAIChat}
            title={collapsed ? 'AI Assistant' : undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '8px 0' : '7px 16px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: 'rgba(255,255,255,0.45)', fontSize: 15,
              background: 'transparent', border: 'none', cursor: 'pointer',
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.75)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'}
          >
            <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>✦</span>
            {!collapsed && (
              <>
                <span style={{ flex: 1, textAlign: 'left' }}>AI Assistant</span>
                <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', flexShrink: 0 }}>8</kbd>
              </>
            )}
          </button>
        )}

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          title={collapsed ? 'Settings' : undefined}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: collapsed ? '8px 0' : '7px 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            color: 'rgba(255,255,255,0.35)', fontSize: 15,
            background: 'transparent', border: 'none', cursor: 'pointer',
            transition: 'color 0.12s ease',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
          </svg>
          {!collapsed && <><span style={{ flex: 1, textAlign: 'left' }}>Settings</span><kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', flexShrink: 0 }}>0</kbd></>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: collapsed ? '8px 0' : '7px 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            color: 'rgba(255,255,255,0.25)', fontSize: 15,
            background: 'transparent', border: 'none', cursor: 'pointer',
            transition: 'color 0.12s ease',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.55)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {collapsed
              ? <path d="M6 3l5 5-5 5M2 8h9"/>
              : <path d="M10 3L5 8l5 5M14 8H5"/>
            }
          </svg>
          {!collapsed && <span style={{ fontSize: 12, letterSpacing: '0.02em' }}>Collapse <kbd style={{ fontSize: 10, padding: '0 4px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'monospace' }}>[</kbd></span>}
        </button>
      </div>
      {/* V41 — drag handle on right edge */}
      {!collapsed && (
        <div
          onMouseDown={onMouseDown}
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 5,
            cursor: 'col-resize', zIndex: 10,
            background: 'transparent',
          }}
          title="Drag to resize sidebar"
        />
      )}
    </aside>
  )
}
