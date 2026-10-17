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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AccountBindings } from '@/features/security/components/account-bindings'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'

import { ProfileDetailsForm } from '../components/profile-details-form'
import { ProfileHeader } from '../components/profile-header'
import type { UserProfile } from '../types'

const profile: UserProfile = {
  id: 7,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'default',
  quota: 1000000,
  used_quota: 500000,
  request_count: 1234,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
}

afterEach(() => vi.restoreAllMocks())

describe('profile overview', () => {
  it('keeps account details and compact account statistics visible without inventing unavailable activity data', () => {
    render(<ProfileHeader profile={profile} loading={false} />)
    expect(screen.getByRole('heading', { name: 'Alice' })).toBeVisible()
    expect(screen.getByLabelText('Account statistics')).toBeVisible()
    expect(screen.getByLabelText('Account statistics')).toHaveClass(
      'grid-cols-3'
    )
    expect(screen.getByText('1,234')).toBeVisible()
    expect(screen.queryByText('Joined')).not.toBeInTheDocument()
    expect(screen.queryByText('Last Login')).not.toBeInTheDocument()
    expect(screen.queryByText('Login IP')).not.toBeInTheDocument()
  })

  it('copies the actual username and user ID from accessible identity chips', async () => {
    const user = userEvent.setup()
    render(<ProfileHeader profile={profile} loading={false} />)
    await user.click(screen.getByRole('button', { name: 'Copy username' }))
    expect(await navigator.clipboard.readText()).toBe('alice')
    await user.click(screen.getByRole('button', { name: 'Copy user ID' }))
    expect(await navigator.clipboard.readText()).toBe('7')
  })

  it('announces loading without showing invented profile details', () => {
    render(<ProfileHeader profile={null} loading />)
    expect(screen.getByRole('status', { name: 'Loading...' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Copy user ID' })
    ).not.toBeInTheDocument()
  })
})

describe('compact account bindings', () => {
  it('shows disabled providers as unavailable and keeps linked providers locked', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(STATUS_QUERY_KEY, {
      github_oauth: true,
      wechat_login: false,
      oidc_enabled: false,
    })
    const post = vi.spyOn(api, 'post')
    render(
      <QueryClientProvider client={client}>
        <AccountBindings
          profile={{ ...profile, github_id: 'alice-github' }}
          onUpdate={vi.fn()}
          presentation='compact'
        />
      </QueryClientProvider>
    )
    const bindings = await screen.findByRole('list', {
      name: 'Account Bindings',
    })
    expect(bindings).toHaveClass('sm:grid-cols-2')
    const wechat = within(bindings)
      .getAllByRole('listitem')
      .find((item) => within(item).queryByText('WeChat', { selector: 'p' }))
    const github = within(bindings)
      .getAllByRole('listitem')
      .find((item) => within(item).queryByText('GitHub', { selector: 'p' }))
    if (!wechat || !github) {
      throw new Error('Expected built-in account providers')
    }
    expect(
      within(wechat).getByRole('button', { name: 'Not enabled' })
    ).toBeDisabled()
    expect(within(github).getByRole('button', { name: 'Bound' })).toBeDisabled()
    expect(within(github).getByText('alice-github')).toBeVisible()
    expect(within(bindings).queryByText('Google')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
    client.clear()
  })
})

describe('profile details form', () => {
  it('saves only the edited display name and keeps username read-only', async () => {
    const user = userEvent.setup()
    const save = vi.fn().mockResolvedValue(true)
    render(
      <ProfileDetailsForm profile={profile} updating={false} onSave={save} />
    )
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveAttribute(
      'readonly'
    )
    const name = screen.getByRole('textbox', { name: 'Display Name' })
    await user.clear(name)
    await user.type(name, 'Alice Cooper')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ display_name: 'Alice Cooper' })
    )
  })

  it.each([
    ['', 'Please enter a display name'],
    ['a'.repeat(21), 'Display name must be 20 characters or fewer'],
  ])('rejects invalid display name %j before saving', async (value, error) => {
    const user = userEvent.setup()
    const save = vi.fn()
    render(
      <ProfileDetailsForm profile={profile} updating={false} onSave={save} />
    )
    const name = screen.getByRole('textbox', { name: 'Display Name' })
    await user.clear(name)
    if (value) await user.type(name, value)
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByText(error)).toBeVisible()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(save).not.toHaveBeenCalled()
  })
})
