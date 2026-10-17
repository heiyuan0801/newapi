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
import { useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { SettingsFormGrid } from '../components/settings-form-layout'
import type { AvailabilityMonitoringFormValues } from './availability-monitoring-schema'
import {
  AvailabilityNumberField,
  AvailabilitySwitchField,
} from './availability-setting-fields'

export function AvailabilityAlertSettings(props: { bucketMinutes: number }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const form = useFormContext<AvailabilityMonitoringFormValues>()
  const disabled = !form.watch('availability_setting.alerts_enabled')
  const requestedWindow = form.watch(
    'availability_setting.evaluation_window_minutes'
  )
  const effectiveWindow =
    Math.ceil(requestedWindow / props.bucketMinutes) * props.bucketMinutes
  return (
    <FieldSet className='rounded-2xl border p-4 sm:p-5'>
      <FieldLegend>{t('Availability alerts')}</FieldLegend>
      <FieldDescription>
        {t(
          'Alerts work independently of active probes and evaluate configured model-group pairs. Existing notification channels are reused.'
        )}
      </FieldDescription>
      <SettingsFormGrid>
        <AvailabilitySwitchField
          name='availability_setting.alerts_enabled'
          label={t('Enable availability alerts')}
        />
        <AvailabilityNumberField
          name='availability_setting.success_rate_threshold'
          label={t('Success-rate threshold (%)')}
          min={0}
          max={100}
          step={0.01}
          disabled={disabled}
        />
        <AvailabilityNumberField
          name='availability_setting.minimum_samples'
          label={t('Minimum request samples')}
          min={1}
          max={100000}
          disabled={disabled}
        />
        <AvailabilityNumberField
          name='availability_setting.evaluation_window_minutes'
          label={t('Requested evaluation window (minutes)')}
          min={1}
          max={1440}
          disabled={disabled}
        />
        <AvailabilityNumberField
          name='availability_setting.failure_threshold'
          label={t('Consecutive unhealthy evaluations')}
          min={1}
          max={20}
          disabled={disabled}
        />
        <AvailabilityNumberField
          name='availability_setting.recovery_threshold'
          label={t('Consecutive recovery evaluations')}
          min={1}
          max={20}
          disabled={disabled}
        />
        <AvailabilityNumberField
          name='availability_setting.notification_cooldown_minutes'
          label={t('Notification cooldown (minutes)')}
          min={0}
          max={10080}
          disabled={disabled}
        />
        <FormField
          control={form.control}
          name='availability_setting.silence_until'
          render={({ field }) => {
            let value = ''
            if (field.value > 0) {
              const date = new Date(field.value * 1000)
              const localDate = new Date(
                date.getTime() - date.getTimezoneOffset() * 60000
              )
              value = localDate.toISOString().slice(0, 16)
            }
            return (
              <FormItem data-disabled={disabled}>
                <FormLabel>{t('Silence notifications until')}</FormLabel>
                <FormControl>
                  <Input
                    type='datetime-local'
                    max='2100-01-01T00:00'
                    value={value}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    disabled={disabled}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value
                          ? Math.floor(
                              new Date(event.target.value).getTime() / 1000
                            )
                          : 0
                      )
                    }
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Uses your local time. Leave empty to receive notifications normally.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )
          }}
        />
      </SettingsFormGrid>
      <FieldDescription>
        {t(
          'Completed traffic buckets determine evaluation precision. Current effective window: {{minutes}} minutes (bucket: {{bucket}} minutes).',
          {
            minutes: formatNumber(
              Number.isFinite(effectiveWindow)
                ? effectiveWindow
                : props.bucketMinutes,
              locale
            ),
            bucket: formatNumber(props.bucketMinutes, locale),
          }
        )}
      </FieldDescription>
      <FieldDescription>
        {t(
          'Insufficient samples do not create failures or recovery events. Cooldown and silence affect notifications, while incident history continues to be recorded.'
        )}
      </FieldDescription>
      <FieldDescription>
        {t('The alert threshold is independent of the overview status colors.')}
      </FieldDescription>
    </FieldSet>
  )
}
