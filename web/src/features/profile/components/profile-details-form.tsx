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
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Form, FormField } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { TitledCard } from '@/components/ui/titled-card'

import type { UpdateUserRequest, UserProfile } from '../types'

const detailsSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, 'Please enter a display name')
    .max(20, 'Display name must be 20 characters or fewer'),
})
type DetailsValues = z.infer<typeof detailsSchema>

interface ProfileDetailsFormProps {
  profile: UserProfile
  updating: boolean
  onSave: (data: UpdateUserRequest) => Promise<boolean>
}

export function ProfileDetailsForm(props: ProfileDetailsFormProps) {
  const { t } = useTranslation()
  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      display_name: props.profile.display_name || props.profile.username,
    },
  })
  const { reset } = form
  useEffect(() => {
    reset({
      display_name: props.profile.display_name || props.profile.username,
    })
  }, [props.profile.display_name, props.profile.username, reset])

  return (
    <TitledCard
      title={t('Edit Profile')}
      description={t('Update your display name')}
      disableHoverEffect
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => props.onSave(values))}
          className='max-w-xl space-y-5'
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='profile-username'>
                {t('Username')}
              </FieldLabel>
              <Input
                id='profile-username'
                value={props.profile.username}
                readOnly
                className='bg-muted/40'
              />
            </Field>
            <FormField
              control={form.control}
              name='display_name'
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor='profile-display-name'>
                    {t('Display Name')}
                  </FieldLabel>
                  <Input
                    {...field}
                    id='profile-display-name'
                    autoComplete='nickname'
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.error
                        ? 'profile-display-name-error'
                        : undefined
                    }
                    disabled={props.updating}
                  />
                  {fieldState.error && (
                    <FieldError id='profile-display-name-error'>
                      {t(fieldState.error.message || 'Invalid input')}
                    </FieldError>
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <Button type='submit' disabled={props.updating}>
            {props.updating && (
              <Loader2 className='size-4 animate-spin' aria-hidden='true' />
            )}
            {props.updating ? t('Saving...') : t('Save Changes')}
          </Button>
        </form>
      </Form>
    </TitledCard>
  )
}
