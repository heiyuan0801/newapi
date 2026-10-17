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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { GroupBadge } from '@/components/group-badge'
import { ModelPriceCell } from '@/features/pricing/components/model-price-cell'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { useStatus } from '@/hooks/use-status'
import { getModuleAccessFromStatus } from '@/lib/nav-modules'

export function PlaygroundPricePreview(props: {
  model: string
  group: string
  ready: boolean
}) {
  const { t } = useTranslation()
  const { status, loading } = useStatus()
  const enabled =
    !loading && getModuleAccessFromStatus(status, 'pricing').enabled
  const pricing = usePricingData(enabled && props.ready)
  const model = pricing.models.find(
    (item) =>
      item.model_name === props.model &&
      item.enable_groups?.includes(props.group)
  )
  if (!props.ready) return null
  return (
    <section
      aria-label={t('Selected model pricing')}
      className='mx-auto w-full max-w-4xl shrink-0 px-4 pt-3'
    >
      <div className='bg-card flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs'>
        <div className='min-w-0 space-y-1'>
          <p className='font-medium break-all'>
            {props.model} <GroupBadge group={props.group} />
          </p>
          <p className='text-muted-foreground'>
            {t(
              'Opening the playground does not send a request. Usage is charged when you send.'
            )}
          </p>
        </div>
        <div className='max-w-full min-w-0 space-y-1'>
          {model ? (
            <ModelPriceCell
              model={model}
              showExpression={false}
              options={{
                selectedGroup: props.group,
                tokenUnit: 'M',
                priceRate: pricing.priceRate,
                usdExchangeRate: pricing.usdExchangeRate,
              }}
            />
          ) : (
            <p className='text-muted-foreground'>
              {pricing.isLoading
                ? t('Loading...')
                : t('Pricing is unavailable for this selection.')}
            </p>
          )}
          {enabled && (
            <Link
              to='/pricing/$modelId'
              params={{ modelId: props.model }}
              className='text-muted-foreground underline underline-offset-4'
            >
              {t('View pricing for {{model}}', { model: props.model })}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
