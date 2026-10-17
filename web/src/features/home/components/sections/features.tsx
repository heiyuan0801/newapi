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
import {
  BookOpen,
  Code2,
  Globe2,
  Layers3,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function Features() {
  const { t } = useTranslation()
  const features = [
    {
      Icon: BookOpen,
      title: t('Simple to get started'),
      desc: t(
        'Create an account, generate an API key, and connect your favorite application.'
      ),
      color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300',
    },
    {
      Icon: Wallet,
      title: t('Transparent Billing'),
      desc: t(
        'Compare model prices and keep track of your usage and balance in the console.'
      ),
      color:
        'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-300',
    },
    {
      Icon: Layers3,
      title: t('More models, more possibilities'),
      desc: t(
        'Explore language, image, and multimodal models from a growing ecosystem of providers.'
      ),
      color:
        'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300',
    },
    {
      Icon: Globe2,
      title: t('Flexible access'),
      desc: t(
        'Connect the upstream services you need and manage them through one gateway.'
      ),
      color: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300',
    },
    {
      Icon: Code2,
      title: t('Seamless Integration'),
      desc: t(
        'Use familiar API formats. Update your base URL and API key to get started.'
      ),
      color:
        'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300',
    },
    {
      Icon: ShieldCheck,
      title: t('Stay in control'),
      desc: t(
        'Manage API keys, access permissions, and usage limits from a single console.'
      ),
      color: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300',
    },
  ]
  return (
    <section className='px-5 py-20 sm:py-24'>
      <div className='mx-auto max-w-6xl'>
        <div className='mb-12 text-center'>
          <span className='text-muted-foreground rounded-full border px-3 py-1 text-xs'>
            {t('Built around your workflow')}
          </span>
          <h2 className='mt-5 text-3xl font-semibold tracking-tight sm:text-4xl'>
            {t('Everything you need to connect')}
          </h2>
          <p className='text-muted-foreground mt-4 text-sm'>
            {t(
              'We simplify model integration, so you can focus on what you are building.'
            )}
          </p>
        </div>
        <div className='grid gap-4 md:grid-cols-3'>
          {features.map(({ Icon, title, desc, color }) => (
            <article
              key={title}
              className='bg-background hover:bg-muted/20 rounded-[20px] border p-7 transition-colors'
            >
              <div
                className={`mb-6 flex size-11 items-center justify-center rounded-full ${color}`}
              >
                <Icon aria-hidden className='size-5' strokeWidth={1.5} />
              </div>
              <h3 className='text-base font-semibold'>{title}</h3>
              <p className='text-muted-foreground mt-3 text-sm leading-6'>
                {desc}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
