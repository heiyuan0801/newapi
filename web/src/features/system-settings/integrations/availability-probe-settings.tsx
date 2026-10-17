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

import { Alert, AlertDescription } from '@/components/ui/alert'
import { FieldSet, FieldLegend, FieldDescription } from '@/components/ui/field'

import { SettingsFormGrid } from '../components/settings-form-layout'
import {
  parseProbeScope,
  type AvailabilityMonitoringFormValues,
} from './availability-monitoring-schema'
import {
  AvailabilityNumberField,
  AvailabilityScopeField,
  AvailabilitySwitchField,
} from './availability-setting-fields'

export function AvailabilityProbeSettings() {
  const { t } = useTranslation()
  const form = useFormContext<AvailabilityMonitoringFormValues>()
  const settings = form.watch('availability_setting')
  const disabled = !settings.probe_enabled
  const scopeEmpty =
    (!settings.probe_all_models &&
      parseProbeScope(settings.probe_models).length === 0) ||
    (!settings.probe_all_groups &&
      parseProbeScope(settings.probe_groups).length === 0)
  return (
    <FieldSet className='rounded-2xl border p-4 sm:p-5'>
      <FieldLegend>{t('Active model probes')}</FieldLegend>
      <FieldDescription>
        {t(
          'Probes are disabled by default. Turning them off stops new probes; requests already running may finish.'
        )}
      </FieldDescription>
      <SettingsFormGrid>
        <AvailabilitySwitchField
          name='availability_setting.probe_enabled'
          label={t('Enable active probes')}
        />
        <AvailabilitySwitchField
          name='availability_setting.probe_all_models'
          label={t('Probe all available models')}
          disabled={disabled}
        />
        <AvailabilityScopeField
          name='availability_setting.probe_models'
          label={t('Probe models')}
          description={t(
            'One model name per line; up to 200 names, 255 characters each.'
          )}
          disabled={disabled || settings.probe_all_models}
        />
        <AvailabilitySwitchField
          name='availability_setting.probe_all_groups'
          label={t('Probe all configured groups')}
          disabled={disabled}
        />
        <AvailabilityScopeField
          name='availability_setting.probe_groups'
          label={t('Probe groups')}
          description={t(
            'One group name per line; up to 200 names, 64 characters each.'
          )}
          disabled={disabled || settings.probe_all_groups}
        />
        <AvailabilityNumberField
          name='availability_setting.probe_interval_minutes'
          label={t('Probe interval (minutes)')}
          min={1}
          max={1440}
          disabled={disabled}
        />
        <AvailabilityNumberField
          name='availability_setting.probe_timeout_seconds'
          label={t('Probe timeout (seconds)')}
          min={1}
          max={120}
          disabled={disabled}
        />
        <AvailabilityNumberField
          name='availability_setting.probe_concurrency'
          label={t('Concurrent probes')}
          min={1}
          max={8}
          disabled={disabled}
        />
        <AvailabilityNumberField
          name='availability_setting.probe_max_pairs'
          label={t('Maximum model-group pairs per round')}
          min={1}
          max={200}
          disabled={disabled}
        />
      </SettingsFormGrid>
      {settings.probe_enabled && scopeEmpty && (
        <Alert role='status'>
          <AlertDescription>
            {t(
              'No requests will be sent until models and groups are selected.'
            )}
          </AlertDescription>
        </Alert>
      )}
    </FieldSet>
  )
}
