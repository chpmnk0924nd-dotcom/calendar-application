import { NavLink, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '../lib/cn'
import { useCalendarStore } from '../store/useCalendarStore'
import { DigitalNow } from '../components/DigitalNow'
import { TodayTimeline } from '../components/TodayTimeline'
import { TimeZoneSwitcher } from '../components/TimeZoneSwitcher'
import { RemindersHost } from '../components/RemindersHost'

const tabBase = 'rounded-xl px-4 py-2 text-sm font-semibold transition'

function AuthPanel({ className }: { className?: string }) {
  const authStatus = useCalendarStore((s) => s.authStatus)
  const userEmail = useCalendarStore((s) => s.userEmail)
  const authError = useCalendarStore((s) => s.authError)
  const signInWithEmail = useCalendarStore((s) => s.signInWithEmail)
  const signOut = useCalendarStore((s) => s.signOut)
  const refreshFromDb = useCalendarStore((s) => s.refreshFromDb)
  const clearLocalData = useCalendarStore((s) => s.clearLocalData)

  const [email, setEmail] = useState('')
  const statusLabel = useMemo(() => {
    switch (authStatus) {
      case 'unconfigured':
        return 'Database: not configured'
      case 'loading':
        return 'Database: checking session…'
      case 'signedOut':
        return 'Database: signed out'
      case 'signedIn':
        return 'Database: signed in'
      default:
        return 'Database'
    }
  }, [authStatus])

  return (
    <div className={cn('rounded-2xl border border-slate-800/60 bg-slate-950/60 p-3 backdrop-blur', className)}>
      <div className="text-xs font-semibold text-slate-300">{statusLabel}</div>

      {authStatus === 'unconfigured' ? (
        <div className="mt-2 space-y-2 text-xs text-slate-400">
          <p>Set <span className="font-semibold text-slate-300">VITE_SUPABASE_URL</span> and <span className="font-semibold text-slate-300">VITE_SUPABASE_ANON_KEY</span>.</p>
          <p className="text-[11px] text-slate-500">Tip: create <span className="font-semibold text-slate-400">.env.local</span> (see <span className="font-semibold text-slate-400">.env.example</span>).</p>
        </div>
      ) : null}

      {authStatus === 'signedOut' ? (
        <div className="mt-2 space-y-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500"
            inputMode="email"
            autoComplete="email"
          />
          <button
            type="button"
            onClick={() => void signInWithEmail(email)}
            className="w-full rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
          >
            Send magic link
          </button>
          <p className="text-[11px] text-slate-500">Check your email, then return here.</p>
        </div>
      ) : null}

      {authStatus === 'signedIn' ? (
        <div className="mt-2 space-y-2">
          <div className="text-xs text-slate-300">{userEmail ?? 'Signed in'}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refreshFromDb()}
              className="flex-1 rounded-xl border border-slate-800/60 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
            >
              Sync
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex-1 rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      {authError ? <div className="mt-2 text-xs text-rose-300">{authError}</div> : null}

      <div className="mt-3 border-t border-slate-800/60 pt-3">
        <button
          type="button"
          onClick={() => {
            const ok = window.confirm(
              'Clear local data? This removes locally saved events/categories from this browser only. It does not delete Supabase events.',
            )
            if (!ok) return
            clearLocalData()
          }}
          className="w-full rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
        >
          Clear local data
        </button>
        <div className="mt-2 text-[11px] text-slate-500">
          This affects only this browser/device.
        </div>
      </div>
    </div>
  )
}

export function AppShell() {
  const authStatus = useCalendarStore((s) => s.authStatus)
  const userEmail = useCalendarStore((s) => s.userEmail)
  const [authOpen, setAuthOpen] = useState(false)
  const timeZone = useCalendarStore((s) => s.timeZone)
  const setTimeZone = useCalendarStore((s) => s.setTimeZone)

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const authPill = useMemo(() => {
    if (authStatus === 'signedIn') return userEmail ?? 'Signed in'
    if (authStatus === 'signedOut') return 'Sign in'
    if (authStatus === 'loading') return 'Loading…'
    return 'DB'
  }, [authStatus, userEmail])

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -bottom-40 right-20 h-[520px] w-[520px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-4 py-4">
        <header className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-800/60 bg-slate-900/25 p-3 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400">Visual calendar</div>
            <div className="rounded-full bg-slate-800/60 px-2 py-1 text-[11px] text-slate-300">v0</div>
          </div>

          <div className="flex flex-col gap-2 md:min-w-[420px] md:flex-1 md:px-2">
            <DigitalNow now={now} timeZone={timeZone} />
            <TimeZoneSwitcher value={timeZone} onChange={setTimeZone} />
            <RemindersHost />
            <TodayTimeline now={now} showClock={false} timeZone={timeZone} />

            <nav className="flex items-center gap-2">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  cn(
                    tabBase,
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/25'
                      : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100',
                  )
                }
              >
                Calendar
              </NavLink>

              <NavLink
                to="/todo"
                className={({ isActive }) =>
                  cn(
                    tabBase,
                    isActive
                      ? 'bg-fuchsia-500/15 text-fuchsia-100 ring-1 ring-fuchsia-400/25'
                      : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100',
                  )
                }
              >
                Todo
              </NavLink>
            </nav>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAuthOpen((v) => !v)}
              className="rounded-xl border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900/60"
            >
              {authPill}
            </button>

            {authOpen ? (
              <div className="absolute right-0 mt-2 w-[340px] max-w-[calc(100vw-2rem)]">
                <AuthPanel className="shadow-2xl" />
              </div>
            ) : null}
          </div>
        </header>

        <main className="min-w-0">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="rounded-2xl border border-slate-800/60 bg-slate-900/25 p-4 backdrop-blur md:p-6"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  )
}
