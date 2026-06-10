import { Outlet, Link as RouterLink } from 'react-router-dom'
import { AppBar, Toolbar, Box } from '@mui/material'
import AiLogo from '../components/AiLogo'
import AppFooter from '../components/AppFooter'
import '../components/AiLogo.css'

export default function AppLayout() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: 1,
          borderColor: 'divider',
          zIndex: 10,
        }}
      >
        <Toolbar>
          <RouterLink to="/" className="ai-brand">
            <AiLogo size="sm" />
            <span className="ai-brand__text">DevOps AI</span>
            <span className="ai-brand__badge">
              <span className="ai-brand__dot" />
              Live
            </span>
          </RouterLink>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </Box>
      <AppFooter />
    </Box>
  )
}
