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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { Plus, RefreshCw, Ticket } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsAdmin } from '@/hooks/use-admin'
import { toIntlLocale } from '@/i18n/languages'

import { listSupportTickets, type SupportStatus } from './api'
import { CreateTicketDialog } from './components/create-ticket-dialog'
import { SupportTicketStatus } from './components/support-ticket-status'
import { TicketConversationDialog } from './components/ticket-conversation-dialog'
import { TicketPagination } from './components/ticket-pagination'
import { supportStatusLabels } from './constants'

const route = getRouteApi('/_authenticated/support-tickets')

export function SupportTicketsPage() {
  const search = route.useSearch()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const admin = useIsAdmin()
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [status, setStatus] = useState<SupportStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['support-tickets', 'list', scope, status, page],
    queryFn: () =>
      listSupportTickets({
        scope: admin ? scope : 'mine',
        status,
        page,
        page_size: 20,
      }),
    retry: false,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })
  const items = query.data?.items ?? []
  let referenceType: '' | 'request' | 'order' = ''
  if (search.request) referenceType = 'request'
  else if (search.order) referenceType = 'order'
  const statusItems = [
    { value: 'all', label: t('All statuses') },
    ...Object.entries(supportStatusLabels).map(([value, label]) => ({
      value,
      label: t(label),
    })),
  ]
  function openTicket(id: number) {
    void navigate({
      to: '/support-tickets',
      search: { create: false, request: '', order: '', ticket: id },
    })
  }
  return (
    <>
      <SectionPageLayout stackActionsOnMobile>
        <SectionPageLayout.Title>
          <span className='flex items-center gap-2'>
            <Ticket className='size-5' aria-hidden='true' />
            {t('Support tickets')}
          </span>
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('Refresh tickets')}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className='size-4' />
          </Button>
          <Button
            onClick={() =>
              void navigate({
                to: '/support-tickets',
                search: { create: true, request: '', order: '', ticket: 0 },
              })
            }
          >
            <Plus className='size-4' aria-hidden='true' />
            {t('Create support ticket')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <p className='text-muted-foreground mb-6 text-sm'>
            {t(
              'Track issues, associate failed requests or orders, and follow support replies.'
            )}
          </p>
          <section
            className='rounded-2xl border p-4 sm:p-5'
            aria-label={t('Support tickets')}
          >
            <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
              {admin ? (
                <Tabs
                  value={scope}
                  onValueChange={(value) => {
                    setScope(value as 'mine' | 'all')
                    setPage(1)
                  }}
                >
                  <TabsList aria-label={t('Ticket scope')}>
                    <TabsTrigger value='mine'>{t('My tickets')}</TabsTrigger>
                    <TabsTrigger value='all'>{t('All tickets')}</TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : (
                <h3 className='text-sm font-semibold'>{t('My tickets')}</h3>
              )}
              <Select
                items={statusItems}
                value={status}
                onValueChange={(value) => {
                  if (value) {
                    setStatus(value as SupportStatus | 'all')
                    setPage(1)
                  }
                }}
              >
                <SelectTrigger className='w-48' aria-label={t('Ticket status')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {query.isPending && <LoadingState />}
            {query.isError && !query.data && (
              <ErrorState
                title={t('Unable to load support tickets')}
                onRetry={() => void query.refetch()}
              />
            )}
            {query.isError && query.data && (
              <Alert variant='destructive' className='mb-4'>
                <AlertDescription>
                  {t(
                    'Unable to refresh tickets. Displayed information may be outdated.'
                  )}
                </AlertDescription>
              </Alert>
            )}
            {query.isSuccess && items.length === 0 && (
              <EmptyState
                icon={Ticket}
                title={t('No support tickets')}
                description={t(
                  'Create a ticket when you need help. You can also start from a failed request or recharge order.'
                )}
              />
            )}
            {items.length > 0 && (
              <ul className='mb-4 divide-y'>
                {items.map((ticket) => (
                  <li key={ticket.id} className='py-4 first:pt-1'>
                    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                      <div className='min-w-0 flex-1'>
                        <Button
                          variant='link'
                          className='h-auto max-w-full justify-start p-0 text-left text-sm font-semibold [overflow-wrap:anywhere] whitespace-normal'
                          onClick={() => openTicket(ticket.id)}
                        >
                          #{ticket.id} · {ticket.title}
                        </Button>
                        <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs'>
                          <span>
                            {t('Updated')}:{' '}
                            <time
                              dateTime={new Date(
                                ticket.updated_at * 1000
                              ).toISOString()}
                            >
                              {new Date(
                                ticket.updated_at * 1000
                              ).toLocaleString(locale)}
                            </time>
                          </span>
                          {admin && scope === 'all' && (
                            <span>
                              {t('User ID')}: {ticket.user_id}
                            </span>
                          )}
                          {ticket.reference_id && (
                            <span className='max-w-full break-all'>
                              {ticket.reference_type === 'request'
                                ? t('Associated request')
                                : t('Associated order')}
                              : {ticket.reference_id}
                            </span>
                          )}
                        </div>
                      </div>
                      <SupportTicketStatus status={ticket.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {query.data && (
              <TicketPagination
                items={items}
                page={query.data.page}
                total={query.data.total}
                disabled={query.isFetching}
                onPageChange={setPage}
              />
            )}
          </section>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {search.create && (
        <CreateTicketDialog
          key={`${search.request}:${search.order}`}
          open
          onOpenChange={(open) => {
            if (!open) {
              void navigate({
                to: '/support-tickets',
                search: { ...search, create: false, request: '', order: '' },
              })
            }
          }}
          referenceType={referenceType}
          referenceId={search.request || search.order}
          onCreated={openTicket}
        />
      )}
      {search.ticket > 0 && (
        <TicketConversationDialog
          key={search.ticket}
          id={search.ticket}
          onClose={() =>
            void navigate({
              to: '/support-tickets',
              search: { ...search, ticket: 0 },
            })
          }
        />
      )}
    </>
  )
}
