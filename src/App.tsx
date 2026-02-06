import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { CalendarPage } from './pages/CalendarPage'
import { TodoPage } from './pages/TodoPage'
import { useCalendarStore } from './store/useCalendarStore'

export default function App() {
  const init = useCalendarStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/todo" element={<TodoPage />} />
          <Route path="/insights" element={<Navigate to="/todo" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
