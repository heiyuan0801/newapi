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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PricingSidebar } from '../components/pricing-sidebar'
import {
  PricingToolbar,
  type PricingToolbarProps,
} from '../components/pricing-toolbar'
import { SearchBar } from '../components/search-bar'
import type { PricingModel } from '../types'

function toolbarProps(): PricingToolbarProps {
  return {
    filteredCount: 2,
    totalCount: 2,
    sortBy: 'name',
    tokenUnit: 'M',
    showRechargePrice: false,
    viewMode: 'card',
    quotaTypeFilter: 'all',
    endpointTypeFilter: 'all',
    vendorFilter: 'all',
    groupFilter: 'all',
    tagFilter: 'all',
    onSortChange: vi.fn(),
    onTokenUnitChange: vi.fn(),
    onRechargePriceChange: vi.fn(),
    onViewModeChange: vi.fn(),
    onQuotaTypeChange: vi.fn(),
    onEndpointTypeChange: vi.fn(),
    onVendorChange: vi.fn(),
    onGroupChange: vi.fn(),
    onTagChange: vi.fn(),
    vendors: [],
    groups: ['default', 'premium'],
    groupRatios: { default: 1, premium: 3 },
    tags: [],
    models: [],
    hasActiveFilters: false,
    activeFilterCount: 0,
    onClearFilters: vi.fn(),
  }
}

afterEach(async () => {
  await i18next.changeLanguage('en')
})

describe('pricing controls', () => {
  it('selects a group from the horizontal filter menu and exposes the selected option', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(
      <PricingSidebar {...props} layout='horizontal' />
    )
    expect(
      screen.queryByRole('button', { name: 'Reset' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Groups: All' }))
    const premium = screen.getByRole('menuitemradio', { name: /premium/ })
    expect(premium).toHaveAttribute('aria-checked', 'false')
    await user.click(premium)
    expect(props.onGroupChange).toHaveBeenCalledWith('premium')
    await waitFor(() =>
      expect(
        screen.queryByRole('menuitemradio', { name: /premium/ })
      ).not.toBeInTheDocument()
    )

    rerender(
      <PricingSidebar
        {...props}
        layout='horizontal'
        groupFilter='premium'
        hasActiveFilters
      />
    )
    await user.click(screen.getByRole('button', { name: 'Groups: premium' }))
    expect(
      await screen.findByRole('menuitemradio', { name: /premium/ })
    ).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('button', { name: 'Groups: premium' })
    ).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(props.onClearFilters).toHaveBeenCalledOnce()
  })

  it('keeps every filter category available in the horizontal catalog bar when the catalog is empty', () => {
    render(<PricingSidebar {...toolbarProps()} layout='horizontal' />)
    const filters = screen.getByRole('group', { name: 'Filter' })
    for (const category of [
      'Vendor',
      'Groups',
      'Model Tags',
      'Endpoint Type',
      'Pricing Type',
    ]) {
      expect(
        within(filters).getByRole('button', { name: `${category}: All` })
      ).toBeVisible()
    }
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('focuses catalog search with the keyboard shortcut and clears it through its accessible action', async () => {
    const props = { value: '', onChange: vi.fn(), onClear: vi.fn() }
    const user = userEvent.setup()
    const { rerender } = render(<SearchBar {...props} />)
    const search = screen.getByRole('textbox', { name: 'Search models' })
    await user.keyboard('{Control>}k{/Control}')
    expect(search).toHaveFocus()
    await user.paste('claude')
    expect(props.onChange).toHaveBeenLastCalledWith('claude')
    rerender(<SearchBar {...props} value='claude' />)
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(props.onClear).toHaveBeenCalledOnce()
    search.focus()
    await user.keyboard('{Escape}')
    expect(search).not.toHaveFocus()
  })

  it('shows the selected provider as the catalog heading while preserving the filtered total', () => {
    render(
      <PricingToolbar
        {...toolbarProps()}
        vendorFilter='Vendor A'
        filteredCount={1}
      />
    )
    expect(screen.getByRole('heading', { name: 'Vendor A' })).toBeVisible()
    expect(screen.getByText('model').parentElement).toHaveTextContent(
      /1\s*model\s*\/\s*2/
    )
  })

  it.each([
    ['zhCN', '1,234'],
    ['zhTW', '1,234'],
    ['en', '1,234'],
    ['fr', '1\u202f234'],
    ['ru', '1\u00a0234'],
    ['ja', '1,234'],
    ['vi', '1.234'],
    ['invalid-language', '1,234'],
  ])(
    'formats the catalog total for interface language %s without an invalid Intl locale',
    async (language, expected) => {
      await i18next.changeLanguage(language)
      render(
        <PricingToolbar
          {...toolbarProps()}
          filteredCount={1234}
          totalCount={1234}
        />
      )
      expect(
        screen.getByText(expected, { normalizer: (value) => value })
      ).toBeVisible()
    }
  )

  it('counts each model once per filter and updates counts when the catalog changes', () => {
    const props = toolbarProps()
    const base: PricingModel = {
      id: 1,
      model_name: 'text-model',
      vendor_name: 'Vendor A',
      quota_type: 0,
      model_ratio: 1,
      completion_ratio: 1,
      enable_groups: ['default'],
      tags: 'Chat,chat',
      supported_endpoint_types: ['openai', 'openai'],
    }
    const models: PricingModel[] = [
      base,
      {
        ...base,
        id: 2,
        model_name: 'image-model',
        quota_type: 1,
        tags: 'chat,Image',
        supported_endpoint_types: ['image-generation'],
      },
      {
        ...base,
        id: 3,
        model_name: 'task-model',
        vendor_name: 'Vendor B',
        tags: 'Video',
        supported_endpoint_types: ['openai-video'],
        billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
      },
    ]
    const sidebarProps = {
      ...props,
      vendors: [
        { id: 1, name: 'Vendor A' },
        { id: 2, name: 'Vendor B' },
      ],
      tags: ['Chat', 'Image', 'Video'],
    }
    const { rerender } = render(
      <PricingSidebar {...sidebarProps} models={models} />
    )

    expect(
      screen.getByRole('button', { name: /^All Vendors\s*3$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor A\s*2$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor B\s*1$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Chat\s*2$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Chat\s*1$/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Token-based\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Per Request\s*1$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Task billing\s*1$/ })
    ).toBeVisible()

    rerender(<PricingSidebar {...sidebarProps} models={[models[1]]} />)
    expect(
      screen.getByRole('button', { name: /^All Vendors\s*1$/ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /^Vendor A\s*1$/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Vendor B\s*1$/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Chat\s*1$/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /^Chat\s*0$/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Token-based\s*0$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /^Task billing\s*0$/ })
    ).toBeVisible()
  })

  it('changes the token unit and keeps the selected unit pressed when clicked again', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: '/1K' }))
    expect(props.onTokenUnitChange).toHaveBeenCalledWith('K')
    rerender(<PricingToolbar {...props} tokenUnit='K' />)
    const selected = screen.getByRole('button', { name: '/1K' })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    await user.click(selected)
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(props.onTokenUnitChange).toHaveBeenCalledTimes(1)
  })

  it('changes the recharge display mode with an accessible selected state', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Recharge' }))
    expect(props.onRechargePriceChange).toHaveBeenCalledWith(true)
    rerender(<PricingToolbar {...props} showRechargePrice />)
    expect(screen.getByRole('button', { name: 'Recharge' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('switches to table view with the keyboard and exposes the selected view', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    const tableButton = screen.getByRole('button', { name: 'Table view' })
    tableButton.focus()
    await user.keyboard('{Enter}')
    expect(props.onViewModeChange).toHaveBeenCalledWith('table')
    rerender(<PricingToolbar {...props} viewMode='table' />)
    expect(tableButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Card view' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('selects price sorting from the shared dropdown', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    render(<PricingToolbar {...props} />)
    await user.click(screen.getByRole('button', { name: 'Name' }))
    await user.click(
      screen.getByRole('menuitem', { name: 'Input Price: Low to High' })
    )
    expect(props.onSortChange).toHaveBeenCalledWith('input-price-low')
  })

  it('opens catalog filters from the left, selects a group, and restores focus on close', async () => {
    const props = toolbarProps()
    const user = userEvent.setup()
    const { rerender } = render(<PricingToolbar {...props} />)
    const filterTrigger = screen.getByRole('button', { name: 'Filter' })
    await user.click(filterTrigger)
    const dialog = await screen.findByRole('dialog', { name: 'Filter' })
    expect(filterTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(dialog).toHaveAttribute('data-side', 'left')
    expect(within(dialog).getByRole('button', { name: 'Reset' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: /premium/ }))
    expect(props.onGroupChange).toHaveBeenCalledWith('premium')
    rerender(
      <PricingToolbar
        {...props}
        groupFilter='premium'
        hasActiveFilters
        activeFilterCount={1}
      />
    )
    expect(
      within(dialog).getByRole('button', { name: /premium/ })
    ).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }))
    expect(props.onClearFilters).toHaveBeenCalledOnce()
    await user.keyboard('{Escape}')
    expect(await screen.findByRole('button', { name: /Filter/ })).toHaveFocus()
  })
})
