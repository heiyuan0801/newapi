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
import { Link, useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useSidebarView } from '@/hooks/use-sidebar-view'

import { checkIsActive } from '../lib/url-utils'

export function ConsoleBreadcrumb() {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })
  const { navGroups } = useSidebarView()
  const items = navGroups.flatMap((group) =>
    group.items.flatMap((item) => item.items ?? [item])
  )
  const current = items.find((item) => checkIsActive(pathname, item))
  const parent = navGroups
    .flatMap((group) => group.items)
    .find((item) => item.items?.some((child) => checkIsActive(pathname, child)))
  const title = current?.title || t('Console')
  const isOverview = pathname.replace(/\/$/, '') === '/dashboard/overview'

  return (
    <div className='flex h-14 min-w-0 shrink-0 items-center gap-4 px-4 sm:px-8'>
      <SidebarTrigger variant='ghost' className='size-7 shrink-0' />
      <span aria-hidden className='bg-border h-4 w-px shrink-0' />
      <Breadcrumb className='min-w-0'>
        <BreadcrumbList className='flex-nowrap text-xs sm:text-sm'>
          <BreadcrumbItem>
            {isOverview ? (
              <BreadcrumbPage>{t('Dashboard')}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink
                render={
                  <Link
                    to='/dashboard/$section'
                    params={{ section: 'overview' }}
                  />
                }
              >
                {t('Dashboard')}
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {!isOverview && (
            <>
              <BreadcrumbSeparator />
              {parent && (
                <>
                  <BreadcrumbItem className='shrink-0'>
                    <span>{parent.title}</span>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem className='min-w-0'>
                <BreadcrumbPage className='truncate'>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}
