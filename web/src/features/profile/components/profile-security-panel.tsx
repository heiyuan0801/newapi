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
import { AccessTokensCard } from '@/features/security/components/access-tokens-card'
import { AccountActionCard } from '@/features/security/components/account-action-card'
import { LoginSessionsCard } from '@/features/security/components/login-sessions-card'
import { PrivacyCard } from '@/features/security/components/privacy-card'
import { TwoFACard } from '@/features/security/components/two-fa-card'

import type { UserProfile } from '../types'

interface ProfileSecurityPanelProps {
  profile: UserProfile
  onUpdate: () => void
}

export function ProfileSecurityPanel(props: ProfileSecurityPanelProps) {
  return (
    <div className='grid items-start gap-4 xl:grid-cols-2'>
      <div className='min-w-0 space-y-4'>
        <AccountActionCard
          action='password'
          username={props.profile.username}
          hasPassword={props.profile.has_password}
          onUpdate={props.onUpdate}
        />
        <LoginSessionsCard />
        <AccessTokensCard />
      </div>
      <div className='min-w-0 space-y-4'>
        <TwoFACard loading={false} />
        <PrivacyCard profile={props.profile} onUpdate={props.onUpdate} />
        <AccountActionCard action='delete' username={props.profile.username} />
      </div>
    </div>
  )
}
