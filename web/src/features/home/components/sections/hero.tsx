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
import { Anthropic, DeepSeek, Gemini, OpenAI, Qwen } from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'
  const canRegister =
    !status?.self_use_mode_enabled && status?.register_enabled !== false
  let startRoute = '/sign-in'
  if (canRegister) startRoute = '/sign-up'
  if (props.isAuthenticated) startRoute = '/dashboard'
  const providers = [
    { name: 'OpenAI', Icon: OpenAI },
    { name: 'Claude', Icon: Anthropic },
    { name: 'Gemini', Icon: Gemini },
    { name: 'DeepSeek', Icon: DeepSeek },
    { name: 'Qwen', Icon: Qwen },
  ]

  return (
    <section className='landing-hero relative isolate overflow-hidden px-5 pt-40 pb-16 sm:pt-48 sm:pb-24'>
      <div
        aria-hidden
        className='landing-grid pointer-events-none absolute inset-0 -z-10'
      />
      <div className='mx-auto flex max-w-5xl flex-col items-center text-center'>
        <Link
          to='/pricing'
          className='bg-background/80 hover:bg-muted mb-8 inline-flex items-center gap-3 rounded-full border px-3 py-1.5 text-xs transition-colors'
        >
          <span className='bg-foreground text-background rounded-full px-2 py-0.5 text-[10px] font-medium'>
            {t('Model Square')}
          </span>
          <span>{t('Explore your next AI model')}</span>
          <ArrowUpRight aria-hidden className='size-3.5' />
        </Link>
        <h1 className='font-bold tracking-[-0.045em]'>
          <span className='block text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.12]'>
            {t('One API. Endless possibilities.')}
          </span>
          <span className='mt-4 block text-[clamp(2rem,5vw,3.75rem)] leading-[1.15]'>
            {t("Connect to the world's leading models")}
          </span>
        </h1>
        <p className='text-muted-foreground mt-7 max-w-2xl text-sm leading-7 sm:text-base'>
          {t(
            'Bring your AI models together with a unified API. Clear pricing, flexible access, and one place to manage every request.'
          )}
        </p>
        <div className='mt-9 flex flex-wrap justify-center gap-3'>
          <Button
            className='bg-foreground text-background hover:bg-foreground/85 h-12 rounded-full px-7 sm:h-14 sm:px-9'
            render={<Link to={startRoute} />}
          >
            {props.isAuthenticated ? t('Go to Dashboard') : t('Get Started')}
            <ArrowRight aria-hidden className='ml-2 size-4' />
          </Button>
          <Button
            variant='outline'
            className='bg-background/70 h-12 rounded-full px-7 sm:h-14 sm:px-9'
            render={
              docsUrl.startsWith('http') ? (
                <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
              ) : (
                <Link to={docsUrl} />
              )
            }
          >
            {t('Docs')}
            <ArrowUpRight aria-hidden className='ml-2 size-4' />
          </Button>
        </div>
        <div className='mt-20 w-full'>
          <p className='text-muted-foreground mb-7 text-xs'>
            {t('Your favorite models. One familiar API.')}
          </p>
          <div className='flex flex-wrap items-center justify-center gap-x-9 gap-y-6 sm:gap-x-14'>
            {providers.map(({ name, Icon }) => (
              <div
                key={name}
                className='text-foreground/75 flex items-center gap-2.5 text-lg font-semibold'
              >
                <Icon size={25} aria-hidden />
                <span>{name}</span>
              </div>
            ))}
          </div>
          <p className='text-muted-foreground mt-7 text-xs leading-relaxed'>
            {t(
              'Supports one-click configuration and perfectly adapts to NewAPI multi-protocol configuration.'
            )}
          </p>
        </div>
      </div>
    </section>
  )
}
