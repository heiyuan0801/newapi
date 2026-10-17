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
import { Megaphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib'
import type { AnnouncementItem } from '@/features/dashboard/types'
import { formatDateTimeObject } from '@/lib/time'

import { AnnouncementDetailModal } from './announcement-detail-dialog'

const NOTICE_TABS = [
  { value: 'all', label: 'Announcements' },
  { value: 'pricing', label: 'Pricing notices' },
] as const

export function AnnouncementsPanel() {
  const { t } = useTranslation()
  const { items: list, loading } = useAnnouncements()
  const [activeTab, setActiveTab] = useState('all')
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementItem | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  // The status contract has no notice category. Keep every notice in the main
  // list and offer a content-based view of existing pricing notices.
  const pricingNotices = useMemo(
    () =>
      list.filter((item) =>
        /调价|价格|计费|费用|\b(?:pricing|prices?|billing|rates?)\b/i.test(
          item.content
        )
      ),
    [list]
  )

  return (
    <section
      aria-label={t('Announcements')}
      className='bg-card flex min-w-0 flex-col rounded-2xl border p-4 sm:p-5'
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(String(value))}
        className='flex-1'
      >
        <TabsList
          aria-label={t('Announcements')}
          className='max-w-full rounded-full border bg-transparent group-data-horizontal/tabs:h-9'
        >
          {NOTICE_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className='data-active:bg-foreground data-active:text-background rounded-full px-3 text-xs data-active:shadow-none'
            >
              {t(tab.label)}
            </TabsTrigger>
          ))}
        </TabsList>
        {NOTICE_TABS.map((tab) => {
          const notices = tab.value === 'pricing' ? pricingNotices : list
          return (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className='mt-4 min-h-[340px] sm:min-h-[460px]'
            >
              {loading ? <Skeleton className='h-[340px] w-full' /> : null}
              {!loading && !notices.length ? (
                <EmptyState
                  icon={Megaphone}
                  title={
                    tab.value === 'pricing'
                      ? t('No pricing notices at this time')
                      : t('No announcements at this time')
                  }
                  className='min-h-[340px] sm:min-h-[420px]'
                />
              ) : null}
              {!loading && notices.length > 0 ? (
                <ScrollArea className='h-[360px] sm:h-[460px]'>
                  <div className='flex flex-col gap-2 pr-1'>
                    {notices.map((item, index) => (
                      <Button
                        key={item.id ?? index}
                        variant='ghost'
                        onClick={() => {
                          setSelectedAnnouncement(item)
                          setIsDialogOpen(true)
                        }}
                        className='hover:bg-muted/40 h-auto w-full flex-col items-stretch justify-start gap-3 rounded-xl border p-3.5 text-left whitespace-normal'
                      >
                        <span className='flex items-center gap-2'>
                          <span className='bg-muted shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium'>
                            {t('Notice')}
                          </span>
                          <span className='min-w-0 flex-1 truncate text-xs font-medium'>
                            {getPreviewText(item.content, 70)}
                          </span>
                          {item.publishDate && (
                            <time className='text-muted-foreground shrink-0 text-[10px] font-normal'>
                              {formatDateTimeObject(new Date(item.publishDate))}
                            </time>
                          )}
                        </span>
                        {index === 0 && (
                          <span className='text-muted-foreground line-clamp-4 text-xs leading-6 font-normal'>
                            {getPreviewText(item.content, 240)}
                          </span>
                        )}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              ) : null}
            </TabsContent>
          )
        })}
      </Tabs>
      <AnnouncementDetailModal
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        announcement={selectedAnnouncement}
      />
    </section>
  )
}
