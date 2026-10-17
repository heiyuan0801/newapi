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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import type { AvailabilityMonitoringSettings } from '../../types'
import { AVAILABILITY_MONITORING_DEFAULTS } from '../availability-monitoring-schema'
import { AvailabilityMonitoringSettingsSection } from '../availability-monitoring-settings-section'

function Fixture(props: { defaults: AvailabilityMonitoringSettings }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <>
      <div ref={setContainer} />
      <SettingsPageProvider actionsContainer={container}>
        <AvailabilityMonitoringSettingsSection defaultValues={props.defaults} />
      </SettingsPageProvider>
    </>
  )
}

function renderSettings(
  overrides: Partial<AvailabilityMonitoringSettings> = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const defaults = { ...AVAILABILITY_MONITORING_DEFAULTS, ...overrides }
  const view = render(
    <QueryClientProvider client={client}>
      <Fixture defaults={defaults} />
    </QueryClientProvider>
  )
  return {
    ...view,
    refresh: (changes: Partial<AvailabilityMonitoringSettings>) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <Fixture defaults={{ ...defaults, ...changes }} />
        </QueryClientProvider>
      ),
  }
}

beforeEach(() => {
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})

test('probes and alerts start disabled without making requests or saving unchanged defaults', async () => {
  const user = userEvent.setup()
  renderSettings()
  expect(
    screen.getByRole('switch', { name: 'Enable active probes' })
  ).not.toBeChecked()
  expect(
    screen.getByRole('switch', { name: 'Enable availability alerts' })
  ).not.toBeChecked()
  expect(
    screen.getByRole('spinbutton', { name: 'Probe interval (minutes)' })
  ).toBeDisabled()
  expect(screen.getByRole('textbox', { name: 'Probe models' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText(
    'Active probes send real upstream requests and may incur charges.'
  )
  expect(api.put).not.toHaveBeenCalled()
})

test('enabling probes saves normalized JSON scopes before the enabling switch', async () => {
  const user = userEvent.setup()
  renderSettings()
  await user.click(screen.getByRole('switch', { name: 'Enable active probes' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Probe models' }), {
    target: { value: ' gpt-5\nclaude-sonnet\ngpt-5 ' },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Probe groups' }), {
    target: { value: 'default\nvip' },
  })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(3))
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'availability_setting.probe_models',
    value: '["gpt-5","claude-sonnet"]',
  })
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'availability_setting.probe_groups',
    value: '["default","vip"]',
  })
  expect(vi.mocked(api.put).mock.calls.at(-1)?.[1]).toEqual({
    key: 'availability_setting.probe_enabled',
    value: true,
  })
})

test('an enabled probe interval outside its bounds blocks saving with a field error', async () => {
  const user = userEvent.setup()
  renderSettings()
  await user.click(screen.getByRole('switch', { name: 'Enable active probes' }))
  const interval = screen.getByRole('spinbutton', {
    name: 'Probe interval (minutes)',
  })
  fireEvent.change(interval, { target: { value: '0' } })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(interval).toHaveAttribute('aria-invalid', 'true'))
  expect(api.put).not.toHaveBeenCalled()
})

test('empty probe scopes remain inactive unless both all-scope switches are explicit', async () => {
  const user = userEvent.setup()
  renderSettings()
  await user.click(screen.getByRole('switch', { name: 'Enable active probes' }))
  expect(screen.getByRole('status')).toHaveTextContent(
    'No requests will be sent until models and groups are selected.'
  )
  await user.click(
    screen.getByRole('switch', { name: 'Probe all available models' })
  )
  await user.click(
    screen.getByRole('switch', { name: 'Probe all configured groups' })
  )
  expect(screen.getByRole('textbox', { name: 'Probe models' })).toBeDisabled()
  expect(screen.getByRole('textbox', { name: 'Probe groups' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(3))
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'availability_setting.probe_all_models',
    value: true,
  })
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'availability_setting.probe_all_groups',
    value: true,
  })
})

test('turning probes off saves even after an invalid dependent field was edited', async () => {
  const user = userEvent.setup()
  renderSettings({ 'availability_setting.probe_enabled': true })
  fireEvent.change(
    screen.getByRole('spinbutton', { name: 'Probe timeout (seconds)' }),
    {
      target: { value: '999' },
    }
  )
  await user.click(screen.getByRole('switch', { name: 'Enable active probes' }))
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/api/option/', {
      key: 'availability_setting.probe_enabled',
      value: false,
    })
  )
})

test('alerts can be enabled independently while background refresh preserves the unsaved draft', async () => {
  const user = userEvent.setup()
  const view = renderSettings()
  await user.click(
    screen.getByRole('switch', { name: 'Enable availability alerts' })
  )
  const threshold = screen.getByRole('spinbutton', {
    name: 'Success-rate threshold (%)',
  })
  fireEvent.change(threshold, { target: { value: '90' } })
  view.refresh({ 'availability_setting.success_rate_threshold': 99 })
  expect(threshold).toHaveValue(90)
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
  expect(api.put).toHaveBeenCalledWith('/api/option/', {
    key: 'availability_setting.alerts_enabled',
    value: true,
  })
  expect(api.put).not.toHaveBeenCalledWith(
    '/api/option/',
    expect.objectContaining({ key: 'availability_setting.probe_enabled' })
  )
})

test('changing an active probe scope pauses probing until the complete new scope is saved', async () => {
  const user = userEvent.setup()
  renderSettings({
    'availability_setting.probe_enabled': true,
    'availability_setting.probe_models': ['gpt-5'],
    'availability_setting.probe_groups': ['default'],
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Probe groups' }), {
    target: { value: 'vip' },
  })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(3))
  expect(vi.mocked(api.put).mock.calls.map(([, payload]) => payload)).toEqual([
    { key: 'availability_setting.probe_enabled', value: false },
    { key: 'availability_setting.probe_groups', value: '["vip"]' },
    { key: 'availability_setting.probe_enabled', value: true },
  ])
})

test('a failed scope save leaves probes off and preserves the desired scope for retry', async () => {
  const user = userEvent.setup()
  vi.mocked(api.put)
    .mockResolvedValueOnce({ data: { success: true } })
    .mockResolvedValueOnce({
      data: { success: false, message: 'Scope update rejected' },
    })
  renderSettings({
    'availability_setting.probe_enabled': true,
    'availability_setting.probe_models': ['gpt-5'],
    'availability_setting.probe_groups': ['default'],
  })
  const groups = screen.getByRole('textbox', { name: 'Probe groups' })
  fireEvent.change(groups, { target: { value: 'vip' } })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
  )
  expect(vi.mocked(api.put).mock.calls.map(([, payload]) => payload)).toEqual([
    { key: 'availability_setting.probe_enabled', value: false },
    { key: 'availability_setting.probe_groups', value: '["vip"]' },
  ])
  expect(groups).toHaveValue('vip')
})

test('a clean background refresh updates saved fields without enabling probes', async () => {
  const view = renderSettings()
  view.refresh({ 'availability_setting.retention_days': 60 })
  await waitFor(() =>
    expect(
      screen.getByRole('spinbutton', {
        name: 'Probe and incident history retention (days)',
      })
    ).toHaveValue(60)
  )
  expect(
    screen.getByRole('switch', { name: 'Enable active probes' })
  ).not.toBeChecked()
  expect(api.put).not.toHaveBeenCalled()
})

test('the displayed real-request window respects the hour aggregation bucket', () => {
  renderSettings()
  expect(
    screen.getByText(
      'Completed traffic buckets determine evaluation precision. Current effective window: 60 minutes (bucket: 60 minutes).'
    )
  ).toBeVisible()
})

test('an oversized Unicode probe scope is rejected before any option is saved', async () => {
  const user = userEvent.setup()
  renderSettings()
  await user.click(screen.getByRole('switch', { name: 'Enable active probes' }))
  const models = screen.getByRole('textbox', { name: 'Probe models' })
  const names = Array.from(
    { length: 100 },
    (_, index) => `${'模'.repeat(250)}${index}`
  )
  fireEvent.change(models, { target: { value: names.join('\n') } })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(models).toHaveAttribute('aria-invalid', 'true'))
  expect(
    screen.getByText('Probe scope JSON must not exceed 64 KiB')
  ).toBeVisible()
  expect(api.put).not.toHaveBeenCalled()
})
