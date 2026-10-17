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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useIsAdmin } from '@/hooks/use-admin'
import { toIntlLocale } from '@/i18n/languages'
import { getServerErrorMessage } from '@/lib/server-error-message'

import {
  getSupportTicket,
  markSupportTicketRead,
  updateSupportTicketOperations,
  type TicketChange,
  replySupportTicket,
  updateSupportTicket,
  type SupportStatus,
} from '../api'
import { supportStatusLabels } from '../constants'
import { SupportTicketStatus } from './support-ticket-status'
import { TicketOperations } from './ticket-operations'
import { TicketPagination } from './ticket-pagination'
import { TicketTimeline } from './ticket-timeline'

const schema = z.object({ body: z.string().trim().min(1).max(4000) })
const statuses: SupportStatus[] = [
  'open',
  'in_progress',
  'awaiting_user',
  'closed',
]

export function TicketConversationDialog(props: {
  id: number
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const admin = useIsAdmin()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [eventPage, setEventPage] = useState(1)
  const lastRead = useRef(0)
  const readAttempt = useRef(0)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { body: '' },
  })
  const query = useQuery({
    queryKey: ['support-tickets', 'detail', props.id, page, eventPage],
    queryFn: () => getSupportTicket(props.id, page, eventPage),
    retry: false,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  })
  const operations = useMutation({
    mutationFn: (change: TicketChange) =>
      updateSupportTicketOperations(props.id, change),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['support-tickets'] })
    },
  })
  const read = useMutation({
    mutationFn: (messageID: number) =>
      markSupportTicketRead(props.id, messageID),
    onSuccess: (_, messageID) => {
      lastRead.current = Math.max(lastRead.current, messageID)
      void client.invalidateQueries({ queryKey: ['support-tickets', 'list'] })
    },
  })
  const markRead = read.mutate
  useEffect(() => {
    const messageID = Math.max(
      0,
      ...(query.data?.messages ?? []).map((message) => message.id)
    )
    if (
      query.isFetching ||
      !query.isSuccess ||
      read.isPending ||
      messageID <= lastRead.current ||
      query.dataUpdatedAt === readAttempt.current
    ) {
      return
    }
    readAttempt.current = query.dataUpdatedAt
    markRead(messageID)
  }, [
    query.data?.messages,
    query.dataUpdatedAt,
    query.isFetching,
    query.isSuccess,
    read.isPending,
    markRead,
  ])
  const update = useMutation({
    mutationFn: (status: SupportStatus) =>
      updateSupportTicket(props.id, status),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['support-tickets'] })
    },
  })
  const reply = useMutation({
    mutationFn: (body: string) => replySupportTicket(props.id, body),
    onSuccess: () => {
      form.reset()
      setPage(Math.max(1, Math.ceil(((query.data?.total ?? 0) + 1) / 20)))
      void client.invalidateQueries({ queryKey: ['support-tickets'] })
    },
  })
  const ticket = query.data?.ticket
  const pending = update.isPending || reply.isPending || operations.isPending
  const statusItems = statuses.map((value) => ({
    value,
    label: t(supportStatusLabels[value]),
  }))
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) props.onClose()
      }}
      title={ticket ? ticket.title : t('Support ticket')}
      description={t('Ticket conversation and progress')}
      contentClassName='rounded-2xl sm:max-w-2xl'
      titleClassName='min-w-0 whitespace-normal [overflow-wrap:anywhere]'
      bodyClassName='space-y-4'
    >
      {query.isPending && <LoadingState />}
      {query.isError && !ticket && (
        <ErrorState
          title={t('Unable to load support tickets')}
          onRetry={() => void query.refetch()}
        />
      )}
      {ticket && query.data && (
        <>
          {(reply.isError || update.isError || operations.isError) && (
            <Alert variant='destructive'>
              <AlertDescription>
                {getServerErrorMessage(
                  reply.error || update.error || operations.error,
                  t('Unable to update support tickets')
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-muted-foreground text-sm'>
                #{ticket.id}
              </span>
              <SupportTicketStatus status={ticket.status} />
            </div>
            {admin ? (
              <Select
                items={statusItems}
                value={ticket.status}
                onValueChange={(value) => {
                  if (value) update.mutate(value as SupportStatus)
                }}
                disabled={pending}
              >
                <SelectTrigger aria-label={t('Ticket status')} className='w-48'>
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
            ) : (
              <Button
                size='sm'
                variant='outline'
                disabled={pending}
                onClick={() =>
                  update.mutate(ticket.status === 'closed' ? 'open' : 'closed')
                }
              >
                {ticket.status === 'closed'
                  ? t('Reopen ticket')
                  : t('Close ticket')}
              </Button>
            )}
          </div>
          <TicketOperations
            ticket={ticket}
            admin={admin}
            pending={pending}
            onChange={(change) => operations.mutate(change)}
          />
          <TicketTimeline
            events={query.data.events ?? []}
            total={query.data.event_total ?? 0}
            page={eventPage}
            pending={query.isFetching}
            onPageChange={setEventPage}
          />
          {ticket.reference_id && (
            <dl className='bg-muted/30 space-y-2 rounded-xl border p-3 text-sm'>
              <div className='flex flex-wrap items-center gap-2'>
                <dt className='text-muted-foreground'>
                  {ticket.reference_type === 'request'
                    ? t('Associated request')
                    : t('Associated order')}
                </dt>
                <dd className='flex min-w-0 items-center gap-1 font-mono text-xs break-all'>
                  {ticket.reference_id}
                  <CopyButton
                    value={ticket.reference_id}
                    className='size-7 shrink-0'
                  />
                </dd>
              </div>
              {ticket.model_name && (
                <div className='flex flex-wrap gap-2'>
                  <dt className='text-muted-foreground'>{t('Model')}</dt>
                  <dd className='break-all'>{ticket.model_name}</dd>
                  <dt className='text-muted-foreground'>{t('Group')}</dt>
                  <dd className='break-all'>{ticket.group_name || '-'}</dd>
                </div>
              )}
            </dl>
          )}
          {query.isError && (
            <Alert variant='destructive'>
              <AlertDescription>
                {t(
                  'Unable to refresh tickets. Displayed information may be outdated.'
                )}
              </AlertDescription>
            </Alert>
          )}
          {read.isError && (
            <p role='status' className='text-muted-foreground text-xs'>
              {t(
                'Unable to mark replies as read. It will retry after the next refresh.'
              )}
            </p>
          )}
          <ol aria-label={t('Ticket conversation')} className='space-y-3'>
            {query.data.messages.map((message) => (
              <li
                key={message.id}
                className={
                  message.author_type === 'support'
                    ? 'rounded-xl border border-sky-200/70 bg-sky-50/50 p-4 dark:border-sky-800 dark:bg-sky-950/30'
                    : 'bg-muted/20 rounded-xl border p-4'
                }
              >
                <div className='text-muted-foreground mb-2 flex flex-wrap items-center justify-between gap-2 text-xs'>
                  <span className='text-foreground font-medium'>
                    {message.author_type === 'support'
                      ? t('Support team')
                      : t('Account owner')}
                  </span>
                  <time
                    dateTime={new Date(message.created_at * 1000).toISOString()}
                  >
                    {new Date(message.created_at * 1000).toLocaleString(locale)}
                  </time>
                </div>
                <p className='text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap'>
                  {message.body}
                </p>
              </li>
            ))}
          </ol>
          <TicketPagination
            items={query.data.messages}
            page={page}
            total={query.data.total}
            disabled={query.isFetching}
            onPageChange={setPage}
          />
          {ticket.status === 'closed' ? (
            <p className='text-muted-foreground bg-muted/40 rounded-lg p-3 text-sm'>
              {t('Reopen the ticket before replying')}
            </p>
          ) : (
            <Form {...form}>
              <form
                className='space-y-3 border-t pt-4'
                onSubmit={form.handleSubmit((values) =>
                  reply.mutate(values.body)
                )}
              >
                <FormField
                  control={form.control}
                  name='body'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Your reply')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={4}
                          maxLength={4000}
                          disabled={pending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Do not include API keys, passwords or payment credentials.'
                  )}
                </p>
                <div className='flex justify-end'>
                  <Button type='submit' disabled={pending}>
                    {reply.isPending ? t('Sending...') : t('Send reply')}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </>
      )}
    </Dialog>
  )
}
