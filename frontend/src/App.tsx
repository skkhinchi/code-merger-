import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import Home from './Home'
import EmailSummary from './screens/EmailSummary'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/emails" element={<EmailSummary />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
