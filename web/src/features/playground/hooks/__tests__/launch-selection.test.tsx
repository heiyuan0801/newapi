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
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import {
  getPlaygroundLaunchSelection,
  playgroundSearchSchema,
} from '@/routes/_authenticated/playground'
import { useAuthStore } from '@/stores/auth-store'

import { getPlaygroundTestGroup } from '../../lib/launch'
import { loadConfig, saveConfig } from '../../lib/storage/storage'
import { usePlaygroundOptions } from '../use-playground-options'
import { usePlaygroundState } from '../use-playground-state'

let client: QueryClient
beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.setUser({ id: 1, username: 'preview', role: 1 })
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
    },
  })
})
afterEach(() => {
  client.clear()
  localStorage.clear()
  useAuthStore.getState().auth.reset()
})
function wrapper(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
}
function useSelectionHarness(
  selection: { model: string; group: string },
  preserveSelection = true
) {
  const state = usePlaygroundState(selection)
  const options = usePlaygroundOptions({
    currentGroup: state.config.group,
    currentModel: state.config.model,
    setModels: state.setModels,
    setGroups: state.setGroups,
    updateConfig: state.updateConfig,
    preserveSelection,
  })
  return { ...state, ...options }
}
function requests(models: string[]) {
  return vi.spyOn(api, 'get').mockImplementation(async (url) => ({
    data:
      url === '/api/user/self/groups'
        ? {
            success: true,
            data: {
              default: { desc: 'Default', ratio: 1 },
              vip: { desc: 'VIP', ratio: 2 },
            },
          }
        : { success: true, data: models },
  }))
}
it('preselects the requested model and group, preserving other preferences without sending', async () => {
  saveConfig({ model: 'old-model', group: 'default', temperature: 0.25 })
  const get = requests(['other-model', 'target-model'])
  const post = vi.spyOn(api, 'post')
  const result = renderHook(
    () => useSelectionHarness({ model: 'target-model', group: 'vip' }),
    { wrapper }
  )
  await waitFor(() => expect(result.result.current.selectionReady).toBe(true))
  expect(result.result.current.config).toMatchObject({
    model: 'target-model',
    group: 'vip',
    temperature: 0.25,
  })
  expect(get).toHaveBeenCalledWith('/api/user/models', {
    params: { group: 'vip' },
  })
  expect(loadConfig()).toMatchObject({ model: 'old-model', group: 'default' })
  expect(post).not.toHaveBeenCalled()
})
it('blocks unavailable requested models without silently selecting another model', async () => {
  requests(['other-model'])
  const result = renderHook(
    () => useSelectionHarness({ model: 'missing-model', group: 'vip' }),
    { wrapper }
  )
  await waitFor(() =>
    expect(result.result.current.selectionUnavailable).toBe(true)
  )
  expect(result.result.current.selectionReady).toBe(false)
  expect(result.result.current.config.model).toBe('missing-model')
})
it('does not fetch models for inaccessible requested groups', async () => {
  const get = requests(['other-model'])
  const result = renderHook(
    () => useSelectionHarness({ model: 'target-model', group: 'private' }),
    { wrapper }
  )
  await waitFor(() =>
    expect(result.result.current.selectionUnavailable).toBe(true)
  )
  expect(result.result.current.config.group).toBe('private')
  expect(result.result.current.selectionReady).toBe(false)
  expect(get).not.toHaveBeenCalledWith('/api/user/models', expect.anything())
})
it('retains automatic selection when strict launch selection is inactive', async () => {
  requests(['other-model'])
  const result = renderHook(
    () => useSelectionHarness({ model: 'missing', group: 'vip' }, false),
    { wrapper }
  )
  await waitFor(() => expect(result.result.current.selectionReady).toBe(true))
  expect(result.result.current.config.model).toBe('other-model')
})
it('validates launch search values', () => {
  expect(
    playgroundSearchSchema.parse({ model: 'model\nname', group: 'vip' }).model
  ).toBe('')
  expect(
    playgroundSearchSchema.parse({ model: 'valid', group: 'x'.repeat(65) })
      .group
  ).toBe('')
  expect(
    playgroundSearchSchema.parse({ model: 'provider/model', group: 'vip' })
  ).toEqual({ model: 'provider/model', group: 'vip' })
})
it.each([
  { model: 'target-model', group: 'x'.repeat(65) },
  { model: 'bad\nmodel', group: 'vip' },
  { group: 'vip' },
])('keeps explicitly invalid launch selections blocked: %j', async (search) => {
  saveConfig({ model: 'old-model', group: 'default' })
  requests(['target-model', 'old-model'])
  const selection = getPlaygroundLaunchSelection(
    playgroundSearchSchema.parse(search)
  )
  if (!selection) throw new Error('Expected an explicit invalid selection')
  const result = renderHook(() => useSelectionHarness(selection), { wrapper })
  await waitFor(() =>
    expect(result.result.current.selectionUnavailable).toBe(true)
  )
  expect(result.result.current.selectionReady).toBe(false)
  expect(loadConfig()).toMatchObject({ model: 'old-model', group: 'default' })
})
it('retains saved selection only when launch parameters are absent', () => {
  expect(
    getPlaygroundLaunchSelection(playgroundSearchSchema.parse({}))
  ).toBeUndefined()
})
it('resolves the filtered group and excludes non-chat models', () => {
  const model = {
    model_name: 'text-model',
    enable_groups: ['default', 'vip'],
    supported_endpoint_types: ['openai'],
  }
  expect(getPlaygroundTestGroup(model, 'vip')).toBe('vip')
  expect(getPlaygroundTestGroup(model, 'all')).toBe('default')
  expect(
    getPlaygroundTestGroup(
      { ...model, supported_endpoint_types: ['image-generation'] },
      'vip'
    )
  ).toBeNull()
  expect(getPlaygroundTestGroup({ ...model, enable_groups: [] })).toBeNull()
})
