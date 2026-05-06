import { useMutation } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, BarChart3, Brain, FileCheck2, Lock, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'



import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { getItem } from '@/lib/api'
import { loginRequest } from '@/lib/queries'
import { authStore } from '@/stores/auth-store'
import type { UserProfile } from '@/types/api'

/* ── AeDWS pyramid logo ── */
function AeDWSLogo({ size = 32, tone = 'dark' }: { size?: number; tone?: 'light' | 'dark' }) {
  const isDark = tone === 'dark'
  const accent = isDark ? '#63dcca' : '#0b57d0'
  const accentSoft = isDark ? '#a5edd9' : '#5e97f6'
  const panelFill = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(11,87,208,0.06)'
  const panelStroke = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(32,33,36,0.2)'
  const midFill = isDark ? 'rgba(99,220,202,0.12)' : 'rgba(26,115,232,0.12)'
  const midStroke = isDark ? 'rgba(99,220,202,0.45)' : 'rgba(11,87,208,0.34)'
  const bright = isDark ? '#ffffff' : '#1f1f1f'
  const brightSoft = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(32,33,36,0.35)'
  const dot = isDark ? '#ffffff' : '#202124'
  const gradientId = `pGrad-${tone}`

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* outer dashed ring */}
      <circle cx="50" cy="50" r="46" stroke={accent} strokeWidth="1.8" strokeDasharray="6 3" opacity="0.6" />
      {/* base slab — white outline */}
      <polygon points="50,88 13,60 28,40 72,40 87,60" fill={panelFill} stroke={panelStroke} strokeWidth="1.2" strokeLinejoin="round" />
      {/* lower layer */}
      <polygon points="50,76 19,59 32,44 68,44 81,59" fill={panelFill} stroke={panelStroke} strokeWidth="1" strokeLinejoin="round" />
      {/* circuit lines */}
      <line x1="29" y1="56" x2="50" y2="56" stroke={accent} strokeWidth="0.9" opacity="0.6" />
      <line x1="50" y1="56" x2="71" y2="56" stroke={accent} strokeWidth="0.9" opacity="0.6" />
      <rect x="33" y="53" width="4" height="4" rx="0.5" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.7" />
      <rect x="63" y="53" width="4" height="4" rx="0.5" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.7" />
      {/* mid layer */}
      <polygon points="50,64 24,49 37,36 63,36 76,49" fill={midFill} stroke={midStroke} strokeWidth="1" strokeLinejoin="round" />
      {/* hex node */}
      <polygon points="50,52 45,49 45,43 50,40 55,43 55,49" fill="none" stroke={brightSoft} strokeWidth="0.9" />
      {/* upper pyramid — bright white fill */}
      <polygon points="50,18 28,42 72,42" fill={`url(#${gradientId})`} />
      {/* pyramid edges */}
      <line x1="50" y1="18" x2="28" y2="42" stroke={bright} strokeWidth="1" opacity="0.7" />
      <line x1="50" y1="18" x2="72" y2="42" stroke={bright} strokeWidth="1" opacity="0.7" />
      <line x1="28" y1="42" x2="72" y2="42" stroke={bright} strokeWidth="0.8" opacity="0.3" />
      {/* apex glow */}
      <circle cx="50" cy="18" r="4" fill={bright} opacity="0.95" />
      <circle cx="50" cy="18" r="8" fill={accent} opacity="0.2" />
      {/* cardinal dots */}
      <circle cx="50" cy="4"  r="2.5" fill={accent} />
      <circle cx="96" cy="50" r="2"   fill={dot} opacity="0.55" />
      <circle cx="4"  cy="50" r="2"   fill={dot} opacity="0.55" />
      <circle cx="50" cy="96" r="2"   fill={dot} opacity="0.4" />
      <defs>
        <linearGradient id={gradientId} x1="50" y1="18" x2="50" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={bright} stopOpacity="0.95" />
          <stop offset="55%"  stopColor={accentSoft} stopOpacity="0.75" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.45" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ── star particle background ── */
interface Star {
  x: number; y: number; vx: number; vy: number
  r: number; alpha: number; pulseOffset: number
}

function StarCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf: number
    let t = 0
    const stars: Star[] = []

    function spawn(W: number, H: number): Star {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.12 + Math.random() * 0.28
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 0.8 + Math.random() * 1.8,
        alpha: 0.15 + Math.random() * 0.55,
        pulseOffset: Math.random() * Math.PI * 2,
      }
    }

    function resize() {
      if (!canvas) return
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx!.scale(window.devicePixelRatio, window.devicePixelRatio)
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      stars.length = 0
      const count = Math.floor((W * H) / 7200)
      for (let i = 0; i < count; i++) stars.push(spawn(W, H))
    }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      if (!canvas || !ctx) return
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      ctx.clearRect(0, 0, W, H)

      // faint grid
      ctx.strokeStyle = 'rgba(99,220,202,0.035)'
      ctx.lineWidth = 1
      const step = 60
      for (let x = 0; x < W + step; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      for (let y = 0; y < H + step; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // draw & move stars
      for (const s of stars) {
        const pulse = 0.7 + 0.3 * Math.sin(t * 1.2 + s.pulseOffset)
        const a = s.alpha * pulse
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99,220,202,${a})`
        ctx.fill()

        // tiny data-stream trail for larger stars
        if (s.r > 2) {
          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14)
          ctx.strokeStyle = `rgba(99,220,202,${a * 0.35})`
          ctx.lineWidth = s.r * 0.6
          ctx.stroke()
        }

        s.x += s.vx
        s.y += s.vy

        if (s.x < -20)  s.x = W + 10
        if (s.x > W + 20) s.x = -10
        if (s.y < -20)  s.y = H + 10
        if (s.y > H + 20) s.y = -10
      }

      // draw connection lines between nearby stars
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x
          const dy = stars[i].y - stars[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 90) {
            const alpha = (1 - dist / 90) * 0.08
            ctx.beginPath()
            ctx.moveTo(stars[i].x, stars[i].y)
            ctx.lineTo(stars[j].x, stars[j].y)
            ctx.strokeStyle = `rgba(99,220,202,${alpha})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }
      }

      t += 0.016
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/60 backdrop-blur-sm">
      <span style={{ color: '#63dcca' }}>{icon}</span>
      {label}
    </div>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [focused, setFocused]   = useState<string | null>(null)

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: async (session) => {
      if (!session) throw new Error(t('auth.error'))
      authStore.getState().setSession(session)
      const profile = await getItem<UserProfile>('/accounts/me')
      if (profile) authStore.getState().setProfile(profile)
      const role = session.roles[0]?.roleName ?? profile?.accountType
      const redirectTarget =
        role === 'DEPOSITOR' ? '/depositor' : role === 'REGULATOR' ? '/regulator' : '/dashboard'
      const next = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
      navigate(next && next !== '/login' ? next : redirectTarget, { replace: true })
    },
    onError: (error) => {
      toast({ title: t('auth.error'), description: error instanceof Error ? error.message : t('auth.error'), variant: 'destructive' })
    },
  })

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #080d1a 0%, #0b1624 45%, #07130e 100%)' }}
    >
      <StarCanvas />

      {/* glow orbs */}
      <div className="pointer-events-none absolute" style={{ width: 700, height: 700, top: '-15%', left: '-12%', background: 'radial-gradient(circle, rgba(99,220,202,0.10) 0%, transparent 65%)', borderRadius: '50%' }} />
      <div className="pointer-events-none absolute" style={{ width: 600, height: 600, bottom: '-15%', right: '28%', background: 'radial-gradient(circle, rgba(230,100,80,0.07) 0%, transparent 65%)', borderRadius: '50%' }} />
      <div className="pointer-events-none absolute" style={{ width: 450, height: 450, top: '15%', right: '-6%', background: 'radial-gradient(circle, rgba(99,220,202,0.08) 0%, transparent 65%)', borderRadius: '50%' }} />

      {/* ── LEFT PANEL ── */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-12 lg:px-20 xl:px-28">
        <div className="mb-10 flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 52, height: 52, background: '#090d14', boxShadow: '0 0 0 2px rgba(99,220,202,0.45), 0 4px 14px rgba(0,0,0,0.55)' }}
          >
            <AeDWSLogo size={32} />
          </div>
          <span className="text-sm font-semibold uppercase tracking-widest text-white/50">AeDWS</span>
        </div>

        <h1 className="mb-5 text-5xl font-bold leading-[1.1] tracking-tight text-white xl:text-6xl">
          AI-Enabled
          <br />
          <span style={{ backgroundImage: 'linear-gradient(90deg, #63dcca 0%, #a5edd9 55%, #63dcca 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Data Warehouse
          </span>
          <br />
          Management System
        </h1>

        <p className="mb-8 max-w-md text-base leading-relaxed text-white/40">
          Intelligent document workflows, real-time AI validation, and end-to-end
          compliance tracking — purpose-built for modern warehouse operations.
        </p>

        <div className="flex flex-wrap gap-2.5">
          <Chip icon={<Brain className="h-3.5 w-3.5" />}      label="AI Document Analysis" />
          <Chip icon={<FileCheck2 className="h-3.5 w-3.5" />}  label="Smart Validation"    />
          <Chip icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Role-based Access"   />
          <Chip icon={<BarChart3 className="h-3.5 w-3.5" />}   label="Real-time Analytics" />
        </div>

        <div className="mt-12 flex items-center gap-8">
          {[['100%', 'Audit Coverage'], ['SSE', 'Live Streaming'], ['6', 'Role Levels']].map(([val, lbl]) => (
            <div key={lbl}>
              <div className="text-2xl font-bold text-white">{val}</div>
              <div className="mt-0.5 text-xs text-white/30">{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* divider */}
      <div className="relative z-10 hidden lg:block" style={{ width: 1, background: 'linear-gradient(to bottom, transparent 5%, rgba(99,220,202,0.12) 35%, rgba(99,220,202,0.12) 65%, transparent 95%)' }} />

      {/* ── RIGHT PANEL ── */}
      <div className="relative z-10 flex w-full max-w-sm flex-col justify-center px-10 lg:max-w-md xl:max-w-lg xl:px-14">
        <div className="w-full rounded-2xl p-8" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(28px)', boxShadow: '0 28px 72px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div className="mb-7">
            <div className="mb-1.5 flex items-center gap-2">
              <Lock className="h-4 w-4" style={{ color: '#63dcca' }} />
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#63dcca' }}>Secure Sign In</span>
            </div>
            <h2 className="text-2xl font-bold text-white">Welcome back</h2>
            <p className="mt-1 text-sm text-white/35">Sign in to access your workspace</p>
          </div>

          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); loginMutation.mutate({ username, password }) }}>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                {t('auth.identifier')}
              </Label>
              <input
                id="username" autoComplete="username" value={username}
                onFocus={() => setFocused('u')} onBlur={() => setFocused(null)}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all duration-200"
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${focused === 'u' ? 'rgba(99,220,202,0.65)' : 'rgba(255,255,255,0.09)'}`, boxShadow: focused === 'u' ? '0 0 0 3px rgba(99,220,202,0.12)' : 'none', caretColor: '#63dcca' }}
                placeholder="Enter your username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
                {t('auth.password')}
              </Label>
              <input
                id="password" type="password" autoComplete="current-password" value={password}
                onFocus={() => setFocused('p')} onBlur={() => setFocused(null)}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all duration-200"
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${focused === 'p' ? 'rgba(99,220,202,0.65)' : 'rgba(255,255,255,0.09)'}`, boxShadow: focused === 'p' ? '0 0 0 3px rgba(99,220,202,0.12)' : 'none', caretColor: '#63dcca' }}
                placeholder="••••••••"
              />
            </div>

            {loginMutation.isError && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(230,100,80,0.12)', border: '1px solid rgba(230,100,80,0.3)', color: '#f87060' }}>
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{t('auth.error')}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending || !username || !password}
              className="group flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-40"
              style={{ background: loginMutation.isPending || !username || !password ? 'rgba(99,220,202,0.25)' : 'linear-gradient(135deg, #63dcca 0%, #48c6b3 100%)', color: '#071510', boxShadow: '0 0 28px rgba(99,220,202,0.18)' }}
            >
              {loginMutation.isPending ? (
                <><span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent" style={{ animation: 'spin 0.7s linear infinite' }} />Signing in…</>
              ) : (
                <>Sign In <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" /></>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-2 text-xs text-white/22">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#63dcca', opacity: 0.45 }} />
            All sessions are encrypted and audited
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-white/18">AI-Enabled Data Warehouse System · {new Date().getFullYear()}</p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.18); }
        input:-webkit-autofill, input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #0b1624 inset !important;
          -webkit-text-fill-color: #fff !important;
        }
      `}</style>
    </div>
  )
}
