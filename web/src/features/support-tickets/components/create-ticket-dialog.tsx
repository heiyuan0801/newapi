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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { createSupportTicket } from '../api'

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
})
type FormValues = z.infer<typeof schema>

export function CreateTicketDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  referenceType: '' | 'request' | 'order'
  referenceId: string
  onCreated: (id: number) => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', body: '' },
  })
  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createSupportTicket({
        ...values,
        reference_type: props.referenceType,
        reference_id: props.referenceId,
      }),
    onSuccess: (ticket) => {
      void client.invalidateQueries({ queryKey: ['support-tickets'] })
      form.reset()
      props.onCreated(ticket.id)
    },
  })
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!mutation.isPending) props.onOpenChange(open)
      }}
      title={t('Create support ticket')}
      description={t(
        'Describe the issue and follow replies here. Do not include API keys, passwords or payment credentials.'
      )}
      contentClassName='rounded-2xl sm:max-w-xl'
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className='space-y-4'
        >
          {props.referenceId && (
            <div className='bg-muted/40 rounded-xl border p-3 text-sm'>
              <p className='text-muted-foreground text-xs'>
                {props.referenceType === 'request'
                  ? t('Associated request')
                  : t('Associated order')}
              </p>
              <p className='mt-1 font-mono text-xs break-all'>
                {props.referenceId}
              </p>
              <p className='text-muted-foreground mt-2 text-xs'>
                {t(
                  'Only basic reference details are attached after ownership verification.'
                )}
              </p>
            </div>
          )}
          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Subject')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    maxLength={200}
                    disabled={mutation.isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='body'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Issue description')}</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={6}
                    maxLength={4000}
                    disabled={mutation.isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={mutation.isPending}
              onClick={() => props.onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={mutation.isPending}>
              {mutation.isPending ? t('Submitting...') : t('Submit ticket')}
            </Button>
          </div>
          {mutation.isError && (
            <Alert variant='destructive'>
              <AlertDescription>
                {getServerErrorMessage(
                  mutation.error,
                  t('Unable to update support tickets')
                )}
              </AlertDescription>
            </Alert>
          )}
        </form>
      </Form>
    </Dialog>
  )
}
