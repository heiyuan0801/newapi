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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Form } from '@/components/ui/form'
import { NotificationDeliveriesPanel } from '@/features/notification-deliveries'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import type { AvailabilityMonitoringSettings } from '../types'
import { AvailabilityAlertSettings } from './availability-alert-settings'
import {
  availabilityFormDefaults,
  availabilityMonitoringSchema,
  serializeAvailabilitySettings,
  type AvailabilityMonitoringFormValues,
} from './availability-monitoring-schema'
import { AvailabilityProbeSettings } from './availability-probe-settings'
import { AvailabilityNumberField } from './availability-setting-fields'

export function AvailabilityMonitoringSettingsSection(props: {
  defaultValues: AvailabilityMonitoringSettings
  bucketTime?: 'hour' | 'minute' | '5min'
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const defaults = useMemo(
    () => availabilityFormDefaults(props.defaultValues),
    [props.defaultValues]
  )
  const source = JSON.stringify(defaults)
  const previousSource = useRef(source)
  const baseline = useRef(props.defaultValues)
  const form = useForm<AvailabilityMonitoringFormValues>({
    resolver: zodResolver(availabilityMonitoringSchema),
    defaultValues: defaults,
  })
  const { isDirty, isSubmitting } = form.formState
  useEffect(() => {
    if (source === previousSource.current) return
    previousSource.current = source
    // Background option refreshes must never replace an unsaved draft or a
    // partly completed multi-option save with a transient server snapshot.
    if (isDirty || isSubmitting) return
    baseline.current = props.defaultValues
    form.reset(defaults)
  }, [source, defaults, props.defaultValues, form, isDirty, isSubmitting])

  const onSubmit = async (values: AvailabilityMonitoringFormValues) => {
    const normalized = serializeAvailabilitySettings(values, baseline.current)
    const changed = (
      Object.keys(normalized) as Array<keyof AvailabilityMonitoringSettings>
    ).filter(
      (key) =>
        JSON.stringify(normalized[key]) !==
        JSON.stringify(baseline.current[key])
    )
    if (changed.length === 0) {
      toast.info(t('No changes to save'))
      return
    }
    // Save explicit scopes before enabling traffic. A disabling request comes
    // first so operators can stop new work even if another field save fails.
    changed.sort((left, right) => {
      let leftOrder = 0
      let rightOrder = 0
      if (left.endsWith('_enabled')) leftOrder = normalized[left] ? 1 : -1
      if (right.endsWith('_enabled')) rightOrder = normalized[right] ? 1 : -1
      return leftOrder - rightOrder
    })
    try {
      const restartingProbes =
        baseline.current['availability_setting.probe_enabled'] &&
        normalized['availability_setting.probe_enabled'] &&
        changed.some((key) => key.startsWith('availability_setting.probe_'))
      if (restartingProbes) {
        await updateOption.mutateAsync({
          key: 'availability_setting.probe_enabled',
          value: false,
        })
        baseline.current = {
          ...baseline.current,
          'availability_setting.probe_enabled': false,
        }
      }
      for (const key of changed) {
        const value = normalized[key]
        await updateOption.mutateAsync({
          key,
          value: Array.isArray(value) ? JSON.stringify(value) : value,
        })
        baseline.current = { ...baseline.current, [key]: value }
      }
      if (restartingProbes) {
        await updateOption.mutateAsync({
          key: 'availability_setting.probe_enabled',
          value: true,
        })
        baseline.current = {
          ...baseline.current,
          'availability_setting.probe_enabled': true,
        }
      }
      form.reset(availabilityFormDefaults(normalized))
    } catch {
      // The shared mutation reports the server failure; leave remaining draft
      // edits in place and retain the baseline for options already saved.
    }
  }
  let bucketMinutes = 60
  if (props.bucketTime === 'minute') bucketMinutes = 1
  if (props.bucketTime === '5min') bucketMinutes = 5
  return (
    <SettingsSection title={t('Model Availability Monitoring')}>
      <Form {...form}>
        <SettingsForm noValidate onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={isSubmitting}
          />
          <Alert>
            <AlertDescription>
              {t(
                'Active probes send real upstream requests and may incur charges.'
              )}
            </AlertDescription>
          </Alert>
          <AvailabilityProbeSettings />
          <AvailabilityAlertSettings bucketMinutes={bucketMinutes} />
          <AvailabilityNumberField
            name='availability_setting.retention_days'
            label={t('Probe and incident history retention (days)')}
            min={1}
            max={365}
          />
        </SettingsForm>
      </Form>
      <NotificationDeliveriesPanel />
    </SettingsSection>
  )
}
