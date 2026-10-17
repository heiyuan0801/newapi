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
import {
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import type { MidjourneyLog, TaskLog } from '../../types'
import { useDrawingLogsColumns } from '../columns/drawing-logs-columns'
import { useTaskLogsColumns } from '../columns/task-logs-columns'
import { UsageLogsMobileList } from '../usage-logs-mobile-card'
import { UsageLogsProvider } from '../usage-logs-provider'

const longId = `task-production-${'1234567890'.repeat(12)}`
const drawing: MidjourneyLog = {
  id: 1,
  user_id: 2,
  channel_id: 372,
  code: 1,
  mj_id: longId,
  action: 'IMAGINE',
  submit_time: 1788840000000,
  progress: '37%',
  prompt: 'A production image prompt that is deliberately long '.repeat(20),
  status: 'IN_PROGRESS',
}
const task: TaskLog = {
  id: 2,
  user_id: 2,
  channel_id: 372,
  task_id: longId,
  platform: 'document-parser',
  action: 'GENERATE',
  group: 'admin-group',
  quota: 100,
  submit_time: 1788840000,
  progress: '37%',
  status: 'FAILURE',
  fail_reason: 'A recoverable upstream failure '.repeat(20),
  admin_info: {
    task_plugin: { key: 'private-plugin', name: 'Private Plugin' },
  },
  root_info: {
    node_name: 'private-node',
    upstream_task_id: 'private-upstream',
  },
}

interface FixtureProps {
  admin?: boolean
  visibility?: VisibilityState
}
function DrawingFixture(props: FixtureProps) {
  const table = useReactTable({
    data: [drawing],
    columns: useDrawingLogsColumns(props.admin ?? true),
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility: props.visibility ?? {} },
  })
  return <UsageLogsMobileList table={table} logCategory='drawing' />
}
function TaskFixture(props: FixtureProps) {
  const table = useReactTable({
    data: [task],
    columns: useTaskLogsColumns(props.admin ?? true, false),
    getCoreRowModel: getCoreRowModel(),
    state: { columnVisibility: props.visibility ?? {} },
  })
  return <UsageLogsMobileList table={table} logCategory='task' />
}
function renderCard(category: 'drawing' | 'task', props: FixtureProps = {}) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <UsageLogsProvider>
        {category === 'drawing' ? (
          <DrawingFixture {...props} />
        ) : (
          <TaskFixture {...props} />
        )}
      </UsageLogsProvider>
    </QueryClientProvider>
  )
}
afterEach(() => vi.restoreAllMocks())

it.each(['drawing', 'task'] as const)(
  'copies the complete long %s task ID with the keyboard inside a bounded card',
  async (category) => {
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderCard(category)
    const button = screen.getByRole('button', {
      name: 'Copy to clipboard: Task ID',
    })
    button.focus()
    await user.keyboard('{Enter}')

    expect(copy).toHaveBeenCalledWith(longId)
    expect(button.closest('.rounded-xl')).toHaveClass(
      'min-w-0',
      'border',
      'bg-card'
    )
    expect(screen.getByText(longId).closest('.truncate')).not.toBeNull()
  }
)

it('shows the drawing channel and accessible progress that the original mobile summary omitted', () => {
  renderCard('drawing')
  expect(screen.getByText('Channel')).toBeVisible()
  expect(screen.getByText('#372')).toBeVisible()
  expect(screen.getByText('In Progress')).toBeVisible()
  expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute(
    'aria-valuenow',
    '37'
  )
})

it('omits hidden drawing progress and admin-only channel from the self view', () => {
  renderCard('drawing', { admin: false, visibility: { progress: false } })
  expect(screen.queryByText('Channel')).not.toBeInTheDocument()
  expect(screen.queryByText('#372')).not.toBeInTheDocument()
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
})

it('opens complete task failures from the self view while elevated details remain hidden', async () => {
  const user = userEvent.setup()
  renderCard('task', { admin: false })
  await user.click(screen.getByRole('button', { name: 'View details' }))
  const dialog = await screen.findByRole('dialog', { name: /Task Details/ })

  expect(
    within(dialog).getByText((task.fail_reason as string).trim())
  ).toBeVisible()
  expect(within(dialog).queryByText('Admin Only')).not.toBeInTheDocument()
  expect(within(dialog).queryByText('Private Plugin')).not.toBeInTheDocument()
  expect(within(dialog).queryByText('private-node')).not.toBeInTheDocument()
  expect(within(dialog).queryByText('private-upstream')).not.toBeInTheDocument()
})
