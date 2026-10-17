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
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { HeroTerminalDemo } from '../hero-terminal-demo'

export function HowItWorks() {
  const { t } = useTranslation()
  const steps = [
    {
      title: t('Create your account'),
      desc: t('Sign up and open your console to manage your access.'),
    },
    {
      title: t('Create an API token'),
      desc: t(
        'Generate a key in the console and set the permissions you need.'
      ),
    },
    {
      title: t('Connect and build'),
      desc: t(
        'Set your base URL, choose an enabled model, and send your first request.'
      ),
    },
  ]
  return (
    <section className='border-y px-5 py-20 sm:py-24'>
      <div className='mx-auto max-w-6xl'>
        <div className='mb-12 text-center'>
          <span className='text-muted-foreground rounded-full border px-3 py-1 text-xs'>
            {t('Quick Start')}
          </span>
          <h2 className='mt-5 text-3xl font-semibold tracking-tight sm:text-4xl'>
            {t('A few lines of code to get started')}
          </h2>
          <p className='text-muted-foreground mt-4 text-sm'>
            {t(
              'Familiar protocols. A simpler way to connect your AI applications.'
            )}
          </p>
        </div>
        <div className='grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]'>
          <div className='space-y-8'>
            {steps.map((step, i) => (
              <div key={step.title} className='flex gap-4'>
                <span className='bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium'>
                  {i + 1}
                </span>
                <div>
                  <h3 className='pt-1 text-sm font-semibold'>{step.title}</h3>
                  <p className='text-muted-foreground mt-2 text-sm leading-6'>
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
            <Button
              variant='outline'
              className='rounded-full px-5'
              render={<Link to='/pricing' />}
            >
              {t('Explore models')}
              <ArrowUpRight aria-hidden className='size-4' />
            </Button>
          </div>
          <HeroTerminalDemo />
        </div>
      </div>
    </section>
  )
}
