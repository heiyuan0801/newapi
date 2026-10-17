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
import { useFormContext, type FieldPathByValue } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

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
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { safeNumberFieldProps } from '../utils/numeric-field'
import type { AvailabilityMonitoringFormValues } from './availability-monitoring-schema'

export function AvailabilityNumberField(props: {
  name: FieldPathByValue<AvailabilityMonitoringFormValues, number>
  label: string
  min: number
  max: number
  step?: number
  disabled?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const form = useFormContext<AvailabilityMonitoringFormValues>()
  return (
    <FormField
      control={form.control}
      name={props.name}
      render={({ field }) => (
        <FormItem data-disabled={props.disabled}>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Input
              type='number'
              min={props.min}
              max={props.max}
              step={props.step ?? 1}
              {...safeNumberFieldProps(field)}
              disabled={props.disabled}
            />
          </FormControl>
          <FormDescription>
            {t('Allowed range: {{minimum}}–{{maximum}}', {
              minimum: formatNumber(props.min, locale),
              maximum: formatNumber(props.max, locale),
            })}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function AvailabilitySwitchField(props: {
  name: FieldPathByValue<AvailabilityMonitoringFormValues, boolean>
  label: string
  description?: string
  disabled?: boolean
}) {
  const form = useFormContext<AvailabilityMonitoringFormValues>()
  return (
    <FormField
      control={form.control}
      name={props.name}
      render={({ field }) => (
        <SettingsSwitchItem data-disabled={props.disabled}>
          <SettingsSwitchContent>
            <FormLabel>{props.label}</FormLabel>
            {props.description && (
              <FormDescription>{props.description}</FormDescription>
            )}
          </SettingsSwitchContent>
          <FormControl>
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={props.disabled}
            />
          </FormControl>
        </SettingsSwitchItem>
      )}
    />
  )
}

export function AvailabilityScopeField(props: {
  name:
    | 'availability_setting.probe_models'
    | 'availability_setting.probe_groups'
  label: string
  description: string
  disabled: boolean
}) {
  const form = useFormContext<AvailabilityMonitoringFormValues>()
  return (
    <FormField
      control={form.control}
      name={props.name}
      render={({ field }) => (
        <FormItem data-disabled={props.disabled}>
          <FormLabel>{props.label}</FormLabel>
          <FormControl>
            <Textarea
              {...field}
              rows={4}
              disabled={props.disabled}
              className='font-mono text-xs'
            />
          </FormControl>
          <FormDescription>{props.description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
