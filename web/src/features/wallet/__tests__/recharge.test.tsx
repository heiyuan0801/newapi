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
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { useState, type ComponentProps } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import { CreemProductsSection } from '../components/creem-products-section'
import { PaymentConfirmDialog } from '../components/dialogs/payment-confirm-dialog'
import { RechargeFormCard } from '../components/recharge-form-card'
import { WalletStatsCard } from '../components/wallet-stats-card'
import type { PresetAmount } from '../types'

function RechargeFixture(
  props: Partial<ComponentProps<typeof RechargeFormCard>>
) {
  const [selected, setSelected] = useState<number | null>(null)
  const [amount, setAmount] = useState(5)
  const [code, setCode] = useState('')
  return (
    <RechargeFormCard
      userQuota={250000}
      topupInfo={{
        enable_online_topup: true,
        enable_stripe_topup: false,
        pay_methods: [
          { name: 'Configured payment', type: 'alipay', min_topup: 10 },
        ],
        min_topup: 5,
        stripe_min_topup: 5,
        amount_options: [5, 20],
        discount: { 20: 0.9 },
      }}
      presetAmounts={[{ value: 5 }, { value: 20, discount: 0.9 }]}
      selectedPreset={selected}
      onSelectPreset={(preset: PresetAmount) => {
        setSelected(preset.value)
        setAmount(preset.value)
      }}
      topupAmount={amount}
      onTopupAmountChange={setAmount}
      paymentAmount={amount}
      calculating={false}
      onPaymentMethodSelect={vi.fn()}
      paymentLoading={null}
      redemptionCode={code}
      onRedemptionCodeChange={setCode}
      onRedeem={vi.fn()}
      redeeming={false}
      {...props}
    />
  )
}

describe('recharge amount and payment selection', () => {
  it('selects a preset with an accessible pressed state and preserves the configured discount', async () => {
    const user = userEvent.setup()
    render(<RechargeFixture />)
    const preset = screen.getByRole('button', { name: /^20 / })
    expect(preset).toHaveAttribute('aria-pressed', 'false')
    expect(preset).toHaveTextContent('10% OFF')
    expect(preset).toHaveTextContent('Pay 18 • Save 2')
    await user.click(preset)
    expect(preset).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('spinbutton', { name: 'Custom Amount' })
    ).toHaveValue(20)
    expect(screen.getByRole('button', { name: /^5 / })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('keeps methods below their configured minimum disabled and only dispatches selection after a valid amount', async () => {
    const user = userEvent.setup()
    const select = vi.fn()
    render(<RechargeFixture onPaymentMethodSelect={select} />)
    const method = screen.getByRole('button', { name: /Configured payment/ })
    expect(method).toBeDisabled()
    await user.click(method)
    expect(select).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^20 / }))
    const enabledMethod = screen.getByRole('button', {
      name: 'Configured payment',
    })
    expect(enabledMethod).toBeEnabled()
    await user.click(enabledMethod)
    expect(select).toHaveBeenCalledWith({
      name: 'Configured payment',
      type: 'alipay',
      min_topup: 10,
    })
  })

  it('keeps blank or pending redemption disabled while accepting a real redemption code', async () => {
    const user = userEvent.setup()
    const redeem = vi.fn()
    const view = render(<RechargeFixture onRedeem={redeem} />)
    const button = screen.getByRole('button', { name: 'Redeem' })
    expect(button).toBeDisabled()
    await user.type(
      screen.getByRole('textbox', { name: 'Redeem Balance' }),
      '  '
    )
    expect(button).toBeDisabled()
    await user.type(
      screen.getByRole('textbox', { name: 'Redeem Balance' }),
      'demo-code'
    )
    await user.click(button)
    expect(redeem).toHaveBeenCalledTimes(1)
    view.rerender(<RechargeFixture onRedeem={redeem} redeeming />)
    expect(button).toBeDisabled()
  })

  it('shows real unavailable states when payment and redemption are disabled instead of inventing channels or promotions', () => {
    render(
      <RechargeFixture
        topupInfo={{
          enable_online_topup: false,
          enable_stripe_topup: false,
          pay_methods: [],
          min_topup: 5,
          stripe_min_topup: 5,
          amount_options: [],
          discount: {},
          enable_redemption: false,
        }}
      />
    )
    expect(
      screen.getByText(
        'Online topup is not enabled. Please use redemption code or contact administrator.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        'Redemption codes are disabled until the administrator confirms compliance terms.'
      )
    ).toBeVisible()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /Configured payment|Redeem|VIP|USDT|WeChat/,
      })
    ).not.toBeInTheDocument()
  })
})

describe('recharge confirmation and account summary', () => {
  it('makes configured Creem products keyboard operable and forwards the chosen product to confirmation', async () => {
    const user = userEvent.setup()
    const select = vi.fn()
    const product = {
      name: 'Configured product',
      productId: 'prod-demo',
      price: 9,
      quota: 10,
      currency: 'EUR' as const,
    }
    render(
      <CreemProductsSection products={[product]} onProductSelect={select} />
    )
    const button = screen.getByRole('button', { name: /Configured product/ })
    button.focus()
    await user.keyboard('{Enter}')
    expect(select).toHaveBeenCalledWith(product)
    expect(button).toHaveTextContent('€9.00')
  })

  it('keeps an in-flight payment confirmation disabled so a second charge cannot be submitted', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn()
    render(
      <PaymentConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={confirm}
        topupAmount={20}
        paymentAmount={18}
        paymentMethod={{ name: 'Configured payment', type: 'alipay' }}
        calculating={false}
        processing
        discountRate={0.9}
      />
    )
    const button = screen.getByRole('button', { name: 'Confirm Payment' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('renders actual account statistics and omits invented recharge totals or membership tiers', () => {
    render(
      <WalletStatsCard
        user={{
          id: 1,
          username: 'demo',
          quota: 250000,
          used_quota: 500000,
          request_count: 1234,
          aff_quota: 0,
          aff_history_quota: 0,
          aff_count: 0,
          group: 'default',
        }}
      />
    )
    expect(screen.getByText('1,234')).toBeVisible()
    expect(screen.getByText('Account Balance')).toBeVisible()
    expect(
      screen.queryByText(/VIP|SVIP|Cumulative recharge/)
    ).not.toBeInTheDocument()
  })

  it.each([
    ['zhCN', '1,234'],
    ['zhTW', '1,234'],
    ['en', '1,234'],
    ['fr', '1\u202f234'],
    ['ru', '1\u00a0234'],
    ['ja', '1,234'],
    ['vi', '1.234'],
    ['invalid_locale_!', '1,234'],
  ])(
    'formats account and product numbers for %s and responds to a language change',
    async (language, expected) => {
      const i18n = createInstance()
      await i18n.use(initReactI18next).init({
        lng: language,
        fallbackLng: false,
        resources: {},
        interpolation: { escapeValue: false },
      })
      render(
        <I18nextProvider i18n={i18n}>
          <WalletStatsCard
            user={{
              id: 1,
              username: 'demo',
              quota: 0,
              used_quota: 0,
              request_count: 1234,
              aff_quota: 0,
              aff_history_quota: 0,
              aff_count: 0,
              group: 'default',
            }}
          />
          <CreemProductsSection
            products={[
              {
                name: 'Product',
                productId: 'product',
                price: 9,
                quota: 1234,
                currency: 'USD',
              },
            ]}
            onProductSelect={vi.fn()}
          />
        </I18nextProvider>
      )
      expect(
        screen.getByText(expected, {
          exact: true,
          normalizer: (value) => value,
        })
      ).toBeVisible()
      expect(
        screen.getByRole('button', { name: /Product/ }).textContent
      ).toContain(`Quota: ${expected}`)
      await act(() => i18n.changeLanguage('en'))
      expect(screen.getByText('1,234', { exact: true })).toBeVisible()
      expect(screen.getByRole('button', { name: /Product/ })).toHaveTextContent(
        'Quota: 1,234'
      )
    }
  )
})
