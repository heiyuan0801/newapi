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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { SupportTicketsPage } from '..'
import type { SupportTicket } from '../api'
import { CreateTicketDialog } from '../components/create-ticket-dialog'
import { SupportTicketCreateButton } from '../components/support-ticket-create-button'
import { TicketConversationDialog } from '../components/ticket-conversation-dialog'

const harness = vi.hoisted(() => ({
  search: { create: false, request: '', order: '', ticket: 0 },
  navigate: vi.fn(),
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  getRouteApi: () => ({ useSearch: () => harness.search }),
  useNavigate: () => harness.navigate,
}))

let client: QueryClient
const ticket: SupportTicket = {
  id: 1,
  user_id: 7,
  title: 'A failed request',
  status: 'open',
  reference_type: 'request',
  reference_id: 'req-owned',
  model_name: 'same-model',
  group_name: 'vip',
  reference_status: 'failed',
  reference_created_at: 100,
  created_at: 100,
  updated_at: 101,
}
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
  harness.search = { create: false, request: '', order: '', ticket: 0 }
  harness.navigate.mockReset()
  useAuthStore.getState().auth.setUser({ id: 7, username: 'owner', role: 1 })
})
afterEach(() => {
  client.clear()
  useAuthStore.getState().auth.setUser(null)
})
function wrap(children: React.ReactNode) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

it('creating from a failed request sends only the owned reference and user-written content', async () => {
  const user = userEvent.setup()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: ticket } })
  const created = vi.fn()
  render(
    wrap(
      <CreateTicketDialog
        open
        onOpenChange={vi.fn()}
        referenceType='request'
        referenceId='req-owned'
        onCreated={created}
      />
    )
  )
  await user.click(screen.getByRole('button', { name: 'Submit ticket' }))
  expect(post).not.toHaveBeenCalled()
  await user.type(
    screen.getByRole('textbox', { name: 'Subject' }),
    ' Please investigate '
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Issue description' }),
    ' I received an error '
  )
  await user.click(screen.getByRole('button', { name: 'Submit ticket' }))
  await waitFor(() => expect(created).toHaveBeenCalledWith(1))
  expect(post).toHaveBeenCalledWith('/api/support-tickets', {
    title: 'Please investigate',
    body: 'I received an error',
    reference_type: 'request',
    reference_id: 'req-owned',
  })
})

it('a rejected submission keeps the draft and shows the server ownership error', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: false,
      message: 'The associated request or order was not found in your account',
    },
  })
  const created = vi.fn()
  render(
    wrap(
      <CreateTicketDialog
        open
        onOpenChange={vi.fn()}
        referenceType='order'
        referenceId='order-private'
        onCreated={created}
      />
    )
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Subject' }),
    'Payment help'
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Issue description' }),
    'Please check'
  )
  await user.click(screen.getByRole('button', { name: 'Submit ticket' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The associated request or order was not found in your account'
  )
  expect(
    screen.getByRole('textbox', { name: 'Issue description' })
  ).toHaveValue('Please check')
  expect(created).not.toHaveBeenCalled()
})

it('an order source button opens a draft without posting or copying payment details', async () => {
  const user = userEvent.setup()
  const post = vi.spyOn(api, 'post')
  render(
    wrap(
      <SupportTicketCreateButton
        associationType='order'
        associationId='order-owned'
      />
    )
  )
  await user.click(
    screen.getByRole('button', { name: 'Create support ticket' })
  )
  const dialog = await screen.findByRole('dialog', {
    name: 'Create support ticket',
  })
  expect(within(dialog).getByText('Associated order')).toBeVisible()
  expect(within(dialog).getByText('order-owned')).toBeVisible()
  expect(
    within(dialog).getByRole('textbox', { name: 'Issue description' })
  ).toHaveValue('')
  expect(post).not.toHaveBeenCalled()
})

it('a closed ticket renders plaintext safely and must reopen before accepting a reply', async () => {
  const user = userEvent.setup()
  let status = 'closed'
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      success: true,
      data: {
        ticket: { ...ticket, status },
        messages: [
          {
            id: 1,
            ticket_id: 1,
            author_type: 'user',
            body: '<script>alert("x")</script>',
            created_at: 100,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      },
    },
  }))
  const patch = vi.spyOn(api, 'patch').mockImplementation(async () => {
    status = 'open'
    return { data: { success: true, data: { ...ticket, status } } }
  })
  const { container } = render(
    wrap(<TicketConversationDialog id={1} onClose={vi.fn()} />)
  )
  expect(await screen.findByText('<script>alert("x")</script>')).toBeVisible()
  expect(container.querySelector('script')).toBeNull()
  expect(
    screen.queryByRole('textbox', { name: 'Your reply' })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reopen ticket' }))
  expect(
    await screen.findByRole('textbox', { name: 'Your reply' })
  ).toBeVisible()
  expect(patch).toHaveBeenCalledWith('/api/support-tickets/1', {
    status: 'open',
  })
})

it('support replies append to the conversation and advance the visible state', async () => {
  const user = userEvent.setup()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'staff', role: 10 })
  let replied = false
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      success: true,
      data: {
        ticket: { ...ticket, status: replied ? 'awaiting_user' : 'open' },
        messages: replied
          ? [
              {
                id: 2,
                ticket_id: 1,
                author_type: 'support',
                body: 'Please try again',
                created_at: 101,
              },
            ]
          : [],
        total: replied ? 1 : 0,
        page: 1,
        page_size: 20,
      },
    },
  }))
  const post = vi.spyOn(api, 'post').mockImplementation(async () => {
    replied = true
    return {
      data: { success: true, data: { ...ticket, status: 'awaiting_user' } },
    }
  })
  render(wrap(<TicketConversationDialog id={1} onClose={vi.fn()} />))
  await user.type(
    await screen.findByRole('textbox', { name: 'Your reply' }),
    'Please try again'
  )
  await user.click(screen.getByRole('button', { name: 'Send reply' }))
  expect(await screen.findByText('Support team')).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Your reply' })).toHaveValue('')
  expect(post).toHaveBeenCalledWith('/api/support-tickets/1/replies', {
    body: 'Please try again',
  })
  expect(screen.getAllByText('Awaiting your reply').length).toBeGreaterThan(0)
})

it('an administrator can open the all-account queue and changing status resets pagination', async () => {
  const user = userEvent.setup()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'staff', role: 10 })
  const get = vi.spyOn(api, 'get').mockImplementation(async (_url, config) => ({
    data: {
      success: true,
      data: {
        items: [{ ...ticket, id: config?.params?.page ?? 1 }],
        total: 21,
        page: config?.params?.page ?? 1,
        page_size: 20,
      },
    },
  }))
  render(wrap(<SupportTicketsPage />))
  await user.click(screen.getByRole('tab', { name: 'All tickets' }))
  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith('/api/support-tickets', {
      params: { scope: 'all', status: 'all', page: 1, page_size: 20 },
    })
  )
  await user.click(screen.getByRole('button', { name: 'Go to next page' }))
  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith('/api/support-tickets', {
      params: { scope: 'all', status: 'all', page: 2, page_size: 20 },
    })
  )
  await user.click(screen.getByRole('combobox', { name: 'Ticket status' }))
  await user.click(await screen.findByRole('option', { name: 'Closed' }))
  await waitFor(() =>
    expect(get).toHaveBeenLastCalledWith('/api/support-tickets', {
      params: { scope: 'all', status: 'closed', page: 1, page_size: 20 },
    })
  )
})

it('an ordinary account only loads its own queue and sees a useful empty state', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { items: [], total: 0, page: 1, page_size: 20 },
    },
  })
  render(wrap(<SupportTicketsPage />))
  expect(await screen.findByText('No support tickets')).toBeVisible()
  expect(
    screen.queryByRole('tab', { name: 'All tickets' })
  ).not.toBeInTheDocument()
  expect(get).toHaveBeenCalledWith('/api/support-tickets', {
    params: { scope: 'mine', status: 'all', page: 1, page_size: 20 },
  })
})

it('a failed queue load shows retry instead of a successful empty state', async () => {
  const user = userEvent.setup()
  vi.spyOn(api, 'get')
    .mockResolvedValueOnce({ data: { success: false, message: 'Unavailable' } })
    .mockResolvedValue({
      data: {
        success: true,
        data: { items: [], total: 0, page: 1, page_size: 20 },
      },
    })
  render(wrap(<SupportTicketsPage />))
  expect(
    await screen.findByText('Unable to load support tickets')
  ).toBeVisible()
  expect(screen.queryByText('No support tickets')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('No support tickets')).toBeVisible()
})

it('refreshing after the last page shrinks displays the server-selected remaining page', async () => {
  const user = userEvent.setup()
  let shrinking = false
  vi.spyOn(api, 'get').mockImplementation(async (_url, config) => ({
    data: {
      success: true,
      data: {
        items: [ticket],
        total: shrinking ? 1 : 21,
        page: shrinking ? 1 : (config?.params?.page ?? 1),
        page_size: 20,
      },
    },
  }))
  render(wrap(<SupportTicketsPage />))
  await screen.findByRole('button', { name: '#1 · A failed request' })
  await user.click(screen.getByRole('button', { name: 'Go to next page' }))
  expect(await screen.findByText('2 / 2')).toBeVisible()
  shrinking = true
  await user.click(screen.getByRole('button', { name: 'Refresh tickets' }))
  expect(await screen.findByText('1 / 1')).toBeVisible()
  expect(screen.queryByText('No support tickets')).not.toBeInTheDocument()
})

it('support operators assign valid agents and change priority while visible messages are acknowledged', async () => {
  const user = userEvent.setup()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'support', role: 10 })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: {} } })
  const patch = vi
    .spyOn(api, 'patch')
    .mockResolvedValue({ data: { success: true, data: ticket } })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/support-tickets/assignees') {
      return {
        data: {
          success: true,
          data: {
            items: [{ id: 2, display_name: 'Agent Two', username: 'support2' }],
          },
        },
      }
    }
    return {
      data: {
        success: true,
        data: {
          ticket: {
            ...ticket,
            assigned_to_id: 2,
            assigned_to_name: 'Agent Two',
            priority: 'normal',
          },
          messages: [
            {
              id: 5,
              ticket_id: 1,
              author_type: 'user',
              body: 'Question',
              created_at: 100,
            },
          ],
          total: 1,
          page: 1,
          page_size: 20,
          events: [
            {
              id: 1,
              ticket_id: 1,
              actor_type: 'support',
              kind: 'assigned',
              old_value: '0',
              new_value: '2',
              created_at: 101,
            },
          ],
          event_total: 1,
        },
      },
    }
  })
  render(wrap(<TicketConversationDialog id={1} onClose={vi.fn()} />))
  await screen.findByRole('combobox', { name: 'Ticket priority' })
  await user.click(screen.getByRole('combobox', { name: 'Ticket priority' }))
  await user.click(screen.getByRole('option', { name: 'High' }))
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith('/api/support-tickets/1', {
      priority: 'high',
    })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/support-tickets/1/read', {
      message_id: 5,
    })
  )
  expect(
    screen.getByRole('region', { name: 'Processing timeline' })
  ).toHaveTextContent('Assignee changed')
})
it('owners see assignee and priority but cannot access assignment controls', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true, data: {} } })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        ticket: { ...ticket, assigned_to_name: 'Agent Two', priority: 'high' },
        messages: [],
        total: 0,
        page: 1,
        page_size: 20,
        events: [],
        event_total: 0,
      },
    },
  })
  render(wrap(<TicketConversationDialog id={1} onClose={vi.fn()} />))
  expect(await screen.findByText('Assignee: Agent Two')).toBeVisible()
  expect(
    screen.queryByRole('combobox', { name: 'Ticket assignee' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(
      'Earlier ticket activity was not recorded in the timeline.'
    )
  ).toBeVisible()
})

it('a failed read acknowledgement retries once after the next successful refresh and clears unread replies', async () => {
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  let acknowledged = false
  const detail = {
    ticket,
    messages: [
      {
        id: 5,
        ticket_id: 1,
        author_type: 'support',
        body: 'Please try again',
        created_at: 100,
      },
    ],
    total: 1,
    page: 1,
    page_size: 20,
    events: [],
    event_total: 0,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data: {
      success: true,
      data:
        url === '/api/support-tickets'
          ? {
              items: [{ ...ticket, unread_count: acknowledged ? 0 : 1 }],
              total: 1,
              page: 1,
              page_size: 20,
            }
          : detail,
    },
  }))
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValueOnce({
      data: { success: false, message: 'Temporary read failure' },
    })
    .mockImplementation(async () => {
      acknowledged = true
      return { data: { success: true, data: {} } }
    })
  function page() {
    return wrap(
      <>
        <SupportTicketsPage />
        <TicketConversationDialog id={1} onClose={vi.fn()} />
      </>
    )
  }
  const rendered = render(page())
  expect(await screen.findByText('Unread replies: 1')).toBeVisible()
  expect(
    await screen.findByText(
      'Unable to mark replies as read. It will retry after the next refresh.'
    )
  ).toBeVisible()
  rendered.rerender(page())
  expect(post).toHaveBeenCalledTimes(1)
  clock.mockReturnValue(now + 30_000)
  await act(async () => {
    await client.refetchQueries({ queryKey: ['support-tickets', 'detail', 1] })
  })
  await waitFor(() =>
    expect(screen.queryByText('Unread replies: 1')).not.toBeInTheDocument()
  )
  expect(post).toHaveBeenCalledTimes(2)
  expect(
    screen.queryByText(
      'Unable to mark replies as read. It will retry after the next refresh.'
    )
  ).not.toBeInTheDocument()
  clock.mockReturnValue(now + 60_000)
  await act(async () => {
    await client.refetchQueries({ queryKey: ['support-tickets', 'detail', 1] })
  })
  expect(post).toHaveBeenCalledTimes(2)
})
