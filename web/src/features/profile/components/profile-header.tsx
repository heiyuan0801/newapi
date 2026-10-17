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
import { CalendarDays, Layers3, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import {
  formatNumber,
  formatQuota,
  formatTimestampRelative,
} from '@/lib/format'
import { getRoleLabel } from '@/lib/roles'

import { getDisplayName } from '../lib'
import type { UserProfile } from '../types'

interface ProfileHeaderProps {
  profile: UserProfile | null
  loading: boolean
}

export function ProfileHeader(props: ProfileHeaderProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  if (props.loading) {
    return (
      <section
        role='status'
        aria-label={t('Loading...')}
        className='overflow-hidden rounded-2xl'
      >
        <Skeleton className='h-[90px] w-full rounded-none' />
        <div className='flex items-end gap-4 px-6 pb-5'>
          <Skeleton className='-mt-8 size-24 rounded-full' />
          <div className='space-y-2 py-2'>
            <Skeleton className='h-6 w-40' />
            <Skeleton className='h-5 w-48' />
          </div>
        </div>
      </section>
    )
  }

  const profile = props.profile
  if (!profile) return null

  const displayName = getDisplayName(profile)
  const avatarName = profile.username || displayName
  const stats = [
    { label: t('Account Balance'), value: formatQuota(profile.quota) },
    { label: t('Total Usage'), value: formatQuota(profile.used_quota) },
    {
      label: t('API Requests'),
      value: formatNumber(profile.request_count, locale),
    },
  ]

  return (
    <section
      aria-label={t('Profile overview')}
      className='overflow-hidden rounded-t-[14px]'
    >
      <div
        aria-hidden='true'
        className='h-[90px] bg-linear-to-r from-[#c6edf4] via-[#e5d7ff] to-[#dcf1ff] dark:from-slate-700 dark:via-violet-950 dark:to-slate-800'
      />
      <div className='px-4 sm:px-6'>
        <div className='flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between'>
          <div className='flex min-w-0 items-start gap-4'>
            <Avatar className='ring-background -mt-8 size-20 shrink-0 rounded-full text-2xl ring-4 sm:size-28 sm:text-3xl'>
              <AvatarFallback
                className='rounded-full text-3xl font-semibold text-white sm:text-4xl'
                style={getUserAvatarStyle(avatarName)}
              >
                {getUserAvatarFallback(avatarName)}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0 space-y-2 pt-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 className='max-w-full truncate text-xl font-semibold tracking-tight'>
                  {displayName}
                </h2>
                <Badge
                  variant='secondary'
                  className='gap-1 rounded-full px-2 py-0.5 text-[11px] font-normal'
                >
                  <ShieldCheck className='size-3' aria-hidden='true' />
                  {getRoleLabel(profile.role)}
                </Badge>
                {profile.group && (
                  <Badge
                    variant='outline'
                    className='gap-1 rounded-full px-2 py-0.5 text-[11px] font-normal'
                  >
                    <Layers3 className='size-3' aria-hidden='true' />
                    {profile.group}
                  </Badge>
                )}
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <CopyButton
                  value={profile.username}
                  size='sm'
                  variant='outline'
                  aria-label={t('Copy username')}
                  className='h-7 max-w-full gap-1.5 rounded-full px-2 text-xs font-normal shadow-none'
                  iconClassName='size-3'
                >
                  <span className='truncate font-mono'>{profile.username}</span>
                </CopyButton>
                <CopyButton
                  value={String(profile.id)}
                  size='sm'
                  variant='outline'
                  aria-label={t('Copy user ID')}
                  className='h-7 gap-1.5 rounded-full px-2 text-xs font-normal shadow-none'
                  iconClassName='size-3'
                >
                  <span className='bg-foreground text-background rounded-sm px-1 text-[10px] font-semibold'>
                    ID
                  </span>
                  {profile.id}
                </CopyButton>
              </div>
            </div>
          </div>
          <dl
            aria-label={t('Account statistics')}
            className='grid shrink-0 grid-cols-3 divide-x self-start overflow-hidden rounded-[14px] border sm:self-end'
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className='min-w-20 px-3 py-2 text-center sm:px-4'
              >
                <dd className='text-sm font-semibold tabular-nums'>
                  {stat.value}
                </dd>
                <dt className='text-muted-foreground mt-0.5 text-[11px]'>
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
        {profile.created_time > 0 && (
          <div className='text-muted-foreground flex flex-wrap items-center gap-1.5 border-t py-4 text-xs'>
            <CalendarDays className='size-3.5' aria-hidden='true' />
            <span>{t('Joined')}</span>
            <span>
              {formatTimestampRelative(profile.created_time, 'seconds', locale)}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
