import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Menu } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SystemUpdateAction } from '@/features/system-update/system-update-action'
import { useNotifications } from '@/hooks/use-notifications'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { HeaderLogo } from './header-logo'

const AUTH_PROMPT_SECONDS = 5

type AuthPromptTarget = {
  title: string
  href: string
}

export interface PublicHeaderProps {
  navLinks?: TopNavLink[]
  mobileLinks?: TopNavLink[]
  navContent?: React.ReactNode
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  showNavigation?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  className?: string
}

export function PublicHeader(props: PublicHeaderProps) {
  const {
    navLinks = defaultTopNavLinks,
    showThemeSwitch = true,
    showLanguageSwitcher = true,
    logo: customLogo,
    siteName: customSiteName,
    homeUrl = '/',
    showAuthButtons = true,
    showNotifications = true,
  } = props

  const { t } = useTranslation()
  const navigate = useNavigate()
  const { status } = useStatus()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authPromptTarget, setAuthPromptTarget] =
    useState<AuthPromptTarget | null>(null)
  const [authPromptSecondsLeft, setAuthPromptSecondsLeft] =
    useState(AUTH_PROMPT_SECONDS)
  const { auth } = useAuthStore()
  const {
    systemName,
    logo: systemLogo,
    loading,
    logoLoaded,
  } = useSystemConfig()
  const dynamicLinks = useTopNavLinks()
  const notifications = useNotifications()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const user = auth.user
  const isAuthenticated = !!user
  const displaySiteName = customSiteName || systemName
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks

  let logoContent: ReactNode = (
    <HeaderLogo
      src={systemLogo}
      loading={loading}
      logoLoaded={logoLoaded}
      className='size-full rounded-lg object-contain'
    />
  )
  if (customLogo) logoContent = customLogo
  if (loading) logoContent = <Skeleton className='size-full rounded-lg' />

  let authContent = (
    <div className='flex items-center gap-2'>
      <Button
        size='sm'
        variant='outline'
        className='h-8 rounded-full px-4 text-xs'
        render={<Link to='/sign-in' />}
      >
        {t('Sign in')}
      </Button>
      {!status?.self_use_mode_enabled && status?.register_enabled !== false && (
        <Button
          size='sm'
          className='h-8 rounded-full px-4 text-xs'
          render={<Link to='/sign-up' />}
        >
          {t('Sign up')}
        </Button>
      )}
    </div>
  )
  if (isAuthenticated) authContent = <ProfileDropdown />
  if (loading) authContent = <Skeleton className='h-8 w-20 rounded-lg' />

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false)
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!authPromptTarget) return

    const intervalId = window.setInterval(() => {
      setAuthPromptSecondsLeft((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    const timeoutId = window.setTimeout(() => {
      const redirect = authPromptTarget.href
      setAuthPromptTarget(null)
      navigate({ to: '/sign-in', search: { redirect } })
    }, AUTH_PROMPT_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [authPromptTarget, navigate])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptTarget(null)
    setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
  }, [])

  const navigateToSignIn = useCallback(() => {
    const redirect = authPromptTarget?.href || '/'
    setAuthPromptTarget(null)
    navigate({ to: '/sign-in', search: { redirect } })
  }, [authPromptTarget?.href, navigate])

  const handleNavLinkClick = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      link: TopNavLink,
      closeMobile = false
    ) => {
      if (link.disabled) {
        event.preventDefault()
        return
      }

      if (link.requiresAuth) {
        event.preventDefault()
        if (closeMobile) {
          setMobileOpen(false)
        }
        setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
        setAuthPromptTarget({
          title: t(link.title),
          href: link.href,
        })
        return
      }

      if (closeMobile) {
        setMobileOpen(false)
      }
    },
    [t]
  )

  return (
    <>
      <header
        className={cn(
          'bg-background/95 fixed inset-x-0 top-0 z-50 border-b border-border/50 backdrop-blur-xl',
          props.className
        )}
      >
        <div className='mx-auto max-w-[1600px] px-4 sm:px-7'>
          <nav
            aria-label={t('Main navigation')}
            className='flex h-16 items-center justify-between gap-4'
          >
            {/* Logo */}
            <div className='@container/system-brand flex min-w-0 flex-1 items-center gap-1 lg:min-w-36'>
              <Link
                to={homeUrl}
                className='group flex min-w-0 items-center gap-2.5'
              >
                <div className='flex size-7 shrink-0 items-center justify-center transition-all duration-300 group-hover:scale-105'>
                  {logoContent}
                </div>
                <span
                  className='max-w-48 truncate text-xl font-bold tracking-tight'
                  title={displaySiteName}
                >
                  {loading ? (
                    <Skeleton className='h-4 w-16' />
                  ) : (
                    displaySiteName
                  )}
                </span>
              </Link>
              <SystemUpdateAction presentation='version' />
            </div>

            {/* Desktop nav */}
            <div className='hidden lg:contents'>
              <div className='flex min-w-0 items-center gap-0.5'>
                {links.map((link) => {
                  const isActive = pathname === link.href
                  if (link.external) {
                    return (
                      <a
                        key={`${link.title}:${link.href}`}
                        href={link.href}
                        title={t(link.title)}
                        target='_blank'
                        rel='noopener noreferrer'
                        aria-disabled={link.disabled}
                        tabIndex={link.disabled ? -1 : undefined}
                        onClick={(event) => handleNavLinkClick(event, link)}
                        className={cn(
                          'text-muted-foreground hover:text-foreground min-w-0 truncate rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200',
                          link.disabled && 'pointer-events-none opacity-50'
                        )}
                      >
                        {t(link.title)}
                      </a>
                    )
                  }
                  return (
                    <Link
                      key={`${link.title}:${link.href}`}
                      to={link.href}
                      title={t(link.title)}
                      disabled={link.disabled}
                      onClick={(event) => handleNavLinkClick(event, link)}
                      className={cn(
                        'min-w-0 truncate rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200',
                        isActive
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                        link.disabled && 'pointer-events-none opacity-50'
                      )}
                    >
                      {t(link.title)}
                    </Link>
                  )
                })}
              </div>
              <div className='flex flex-1 items-center justify-end gap-1'>
                {(showLanguageSwitcher ||
                  showThemeSwitch ||
                  showNotifications) && (
                  <div className='bg-border/40 mx-2 h-4 w-px' />
                )}

                {showLanguageSwitcher && <LanguageSwitcher />}
                {showThemeSwitch && <ThemeSwitch />}
                {showNotifications && (
                  <NotificationPopover
                    open={notifications.popoverOpen}
                    onOpenChange={notifications.setPopoverOpen}
                    unreadCount={notifications.unreadCount}
                    activeTab={notifications.activeTab}
                    onTabChange={notifications.setActiveTab}
                    notice={notifications.notice}
                    announcements={notifications.announcements}
                    loading={notifications.loading}
                  />
                )}

                {showAuthButtons && (
                  <>
                    <div className='bg-border/40 mx-1 h-4 w-px' />
                    {authContent}
                  </>
                )}
              </div>
            </div>

            {/* Mobile: compact actions + hamburger */}
            <div className='flex shrink-0 items-center gap-2 lg:hidden'>
              {showThemeSwitch && <ThemeSwitch />}
              {showAuthButtons && !loading && isAuthenticated && (
                <ProfileDropdown />
              )}
              <Dialog
                open={mobileOpen}
                onOpenChange={setMobileOpen}
                title={t('Main navigation')}
                contentClassName='public-surface max-w-md rounded-3xl'
                trigger={
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-9'
                    aria-label={t('Toggle navigation menu')}
                  >
                    <Menu aria-hidden className='size-5' />
                  </Button>
                }
              >
                <nav className='flex flex-col gap-1'>
                  {links.map((link) => {
                    const className = cn(
                      'rounded-xl px-3 py-3 text-sm font-medium hover:bg-muted',
                      pathname === link.href && 'bg-muted',
                      link.disabled && 'pointer-events-none opacity-50'
                    )
                    if (link.external) {
                      return (
                        <a
                          key={link.href}
                          href={link.href}
                          target='_blank'
                          rel='noopener noreferrer'
                          aria-disabled={link.disabled}
                          tabIndex={link.disabled ? -1 : undefined}
                          className={className}
                          onClick={(event) =>
                            handleNavLinkClick(event, link, true)
                          }
                        >
                          {t(link.title)}
                        </a>
                      )
                    }
                    return (
                      <Link
                        key={link.href}
                        to={link.href}
                        disabled={link.disabled}
                        className={className}
                        onClick={(event) =>
                          handleNavLinkClick(event, link, true)
                        }
                      >
                        {t(link.title)}
                      </Link>
                    )
                  })}
                </nav>
                {showAuthButtons && (
                  <div className='mt-5 flex flex-col gap-2 border-t pt-5'>
                    <Button
                      className='h-10 rounded-full'
                      render={
                        <Link
                          to={isAuthenticated ? '/dashboard' : '/sign-in'}
                          onClick={() => setMobileOpen(false)}
                        />
                      }
                    >
                      {isAuthenticated ? t('Go to Dashboard') : t('Sign in')}
                    </Button>
                    {!isAuthenticated &&
                      !status?.self_use_mode_enabled &&
                      status?.register_enabled !== false && (
                        <Button
                          variant='outline'
                          className='h-10 rounded-full'
                          render={
                            <Link
                              to='/sign-up'
                              onClick={() => setMobileOpen(false)}
                            />
                          }
                        >
                          {t('Sign up')}
                        </Button>
                      )}
                  </div>
                )}
              </Dialog>
            </div>
          </nav>
        </div>
      </header>

      <Dialog
        open={!!authPromptTarget}
        onOpenChange={(open) => {
          if (!open) {
            closeAuthPrompt()
          }
        }}
        title={t('Sign in required')}
        description={t('Please sign in to view {{module}}.', {
          module: authPromptTarget?.title || '',
        })}
        contentClassName='sm:max-w-md'
        contentHeight='auto'
        footer={
          <>
            <Button variant='outline' onClick={closeAuthPrompt}>
              {t('Cancel')}
            </Button>
            <Button onClick={navigateToSignIn}>{t('Sign in now')}</Button>
          </>
        }
      >
        <div className='bg-muted/40 text-muted-foreground rounded-lg px-3 py-2 text-sm'>
          {t('Redirecting to sign in in {{seconds}} seconds.', {
            seconds: authPromptSecondsLeft,
          })}
        </div>
      </Dialog>
    </>
  )
}
