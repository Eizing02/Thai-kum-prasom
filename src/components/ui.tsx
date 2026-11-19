import { useEffect, useId, useRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ArrowUpRight, X } from 'lucide-react'

export function Button({ look = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { look?: 'primary' | 'secondary' | 'quiet' }) {
  return <button type="button" className={`button button-${look} ${className}`} {...props} />
}

export function Dialog({ title, children, close }: { title: string; children: ReactNode; close?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const label = useId()
  const tap = useRef<{ button: HTMLButtonElement; x: number; y: number; id: number } | null>(null)
  const clickFallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    const dialog = ref.current!
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      clearTimeout(clickFallback.current)
      dialog.close()
      if (returnFocus?.isConnected) returnFocus.focus()
    }
  }, [])
  return <dialog ref={ref} aria-labelledby={label} onCancel={event => { event.preventDefault(); close?.() }}
    onPointerDown={event => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return
      const button = event.target instanceof Element ? event.target.closest('button') : null
      tap.current = button && !button.disabled ? { button, x: event.clientX, y: event.clientY, id: event.pointerId } : null
    }}
    onPointerCancel={() => { tap.current = null }}
    onPointerUp={event => {
      const start = tap.current
      tap.current = null
      if (!start || start.id !== event.pointerId || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 9) return
      if (!start.button.contains(document.elementFromPoint(event.clientX, event.clientY))) return
      // Some Chromium touch sequences omit the compatibility click after a captured drag.
      clearTimeout(clickFallback.current)
      clickFallback.current = setTimeout(() => {
        if (start.button.isConnected && ref.current?.open) start.button.click()
      }, 350)
    }}
    onClickCapture={() => clearTimeout(clickFallback.current)}>
    <div className="dialog-inner">
      <div className="dialog-heading"><h2 id={label}>{title}</h2>{close && <Button look="quiet" aria-label="ปิด" onClick={close}><X size={20} /></Button>}</div>
      {children}
    </div>
  </dialog>
}

export type Navigate = (path: string) => void
export function Shell({ go, children, route }: { go: Navigate; children: ReactNode; route: string }) {
  const base = import.meta.env.BASE_URL
  const link = (path: string) => ({
    href: base + path.slice(1),
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      go(path)
    },
  })
  return <>
    <a className="skip" href="#main">ข้ามไปยังเนื้อหา</a>
    <header className="site-header">
      <div className="container site-bar">
        <a className="brand" aria-label="เกมคำชนคำ กลับหน้าแรก" {...link('/')}>
          <img className="brand-mark" src={base + 'brand/kru-jan-mark.webp'} width={112} height={102} alt="" />
          <span>เกมคำชนคำ</span>
        </a>
        <nav aria-label="เมนูหลัก">
          <a {...link('/help')} aria-current={route === '/help' ? 'page' : undefined}>วิธีเล่น</a>
          <a {...link('/teacher')} aria-current={route === '/teacher' ? 'page' : undefined}>สำหรับครู <ArrowUpRight size={15} /></a>
          <a {...link('/about')} aria-current={route === '/about' ? 'page' : undefined}>เกี่ยวกับ</a>
        </nav>
      </div>
    </header>
    <main id="main" className={route === '/play' ? 'container game-page' : 'container'}>{children}</main>
    <footer className="site-footer container"><span>ภาษาไทย ม.1 <span aria-hidden="true">/</span> ท 4.1 ม.1/2</span><div>
      <a {...link('/diagnostics')}>ตรวจสอบการควบคุม</a>
      {route !== '/' && <a {...link('/settings')}>ตั้งค่า</a>}
    </div></footer>
  </>
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={event => onChange(event.currentTarget.checked)} /> <span>{label}</span></label>
}
