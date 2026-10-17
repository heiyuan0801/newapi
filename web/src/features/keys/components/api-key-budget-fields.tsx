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
import { CalendarClock } from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  SideDrawerSection,
  SideDrawerSectionHeader,
  sideDrawerSwitchItemClassName,
} from '@/components/drawer-layout'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'

import type { ApiKeyFormValues } from '../lib'

export function ApiKeyBudgetFields() {
  const { t } = useTranslation()
  const form = useFormContext<ApiKeyFormValues>()
  const currency = getCurrencyLabel()
  const { meta } = getCurrencyDisplay()

  return (
    <SideDrawerSection>
      <SideDrawerSectionHeader
        title={t('Spending budgets')}
        description={t(
          'Daily resets at 00:00 UTC; monthly resets on the first day at 00:00 UTC. Zero disables a limit.'
        )}
        icon={<CalendarClock className='size-4' aria-hidden='true' />}
        iconTone='warning'
      />
      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={form.control}
          name='daily_budget_amount'
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('Daily budget ({{currency}})', { currency })}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? 0}
                  type='number'
                  min={0}
                  step={meta.kind === 'tokens' ? 1 : 0.01}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value === '' ? 0 : event.target.valueAsNumber
                    )
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='monthly_budget_amount'
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('Monthly budget ({{currency}})', { currency })}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? 0}
                  type='number'
                  min={0}
                  step={meta.kind === 'tokens' ? 1 : 0.01}
                  onChange={(event) =>
                    field.onChange(
                      event.target.value === '' ? 0 : event.target.valueAsNumber
                    )
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormDescription>
        {t(
          'Budgets also apply to keys with unlimited quota. Usage is tracked from activation and includes in-flight reservations. Final charges may exceed the estimate; new requests then pause until reset or a budget increase.'
        )}
      </FormDescription>
      <FormField
        control={form.control}
        name='budget_reminder_enabled'
        render={({ field }) => (
          <FormItem className={sideDrawerSwitchItemClassName()}>
            <div className='flex flex-col gap-0.5'>
              <FormLabel>{t('Budget reminders')}</FormLabel>
              <FormDescription>
                {t(
                  'Send one reminder at 80% of each budget per UTC period using your notification settings.'
                )}
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={!!field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </SideDrawerSection>
  )
}
