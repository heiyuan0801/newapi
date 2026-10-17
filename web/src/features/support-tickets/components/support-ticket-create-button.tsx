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
import { Ticket } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { CreateTicketDialog } from './create-ticket-dialog'
import { TicketConversationDialog } from './ticket-conversation-dialog'

export function SupportTicketCreateButton(props: {
  associationType: 'request' | 'order'
  associationId: string
}) {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [ticketId, setTicketId] = useState(0)
  return (
    <>
      <Button size='sm' variant='outline' onClick={() => setCreating(true)}>
        <Ticket className='size-4' aria-hidden='true' />
        {t('Create support ticket')}
      </Button>
      {creating && (
        <CreateTicketDialog
          open
          onOpenChange={setCreating}
          referenceType={props.associationType}
          referenceId={props.associationId}
          onCreated={(id) => {
            setCreating(false)
            setTicketId(id)
          }}
        />
      )}
      {ticketId > 0 && (
        <TicketConversationDialog
          key={ticketId}
          id={ticketId}
          onClose={() => setTicketId(0)}
        />
      )}
    </>
  )
}
