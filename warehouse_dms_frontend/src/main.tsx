import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppProviders } from '@/app/providers'
import { AppRouter } from '@/app/router'

import './index.css'

const storedTheme = window.localStorage.getItem('aedws-theme')
const resolvedTheme = storedTheme === 'light' || storedTheme === 'dark'
  ? storedTheme
  : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

document.documentElement.dataset.theme = resolvedTheme
document.documentElement.style.colorScheme = resolvedTheme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
)
