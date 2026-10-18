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
import { Bell, Link2, Settings2, ShieldCheck, UserRoundPen } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AccountBindings } from '@/features/security/components/account-bindings'
import { PasskeyCard } from '@/features/security/components/passkey-card'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'

import { CheckinCalendarCard } from './components/checkin-calendar-card'
import { LanguagePreferencesCard } from './components/language-preferences-card'
import { ProfileDetailsForm } from './components/profile-details-form'
import { ProfileHeader } from './components/profile-header'
import { ProfileSecurityPanel } from './components/profile-security-panel'
import { SidebarModulesCard } from './components/sidebar-modules-card'
import { NotificationTab } from './components/tabs/notification-tab'
import { useProfile } from './hooks'

export function Profile() {
  const { t } = useTranslation()
  const {
    profile,
    loading,
    updating,
    refreshProfile,
    fetchProfile,
    updateProfile,
  } = useProfile()
  const { status } = useStatus()
  const permissions = useAuthStore((state) => state.auth.user?.permissions)
  const [activeTab, setActiveTab] = useState('bindings')
  const checkinEnabled = status?.checkin_enabled === true
  const turnstileEnabled = !!(
    status?.turnstile_check && status?.turnstile_site_key
  )
  const canConfigureSidebar = permissions?.sidebar_settings !== false
  // Older cached status payloads lack these fields; the site default is on.
  const quotaRemindEnabled = status?.quota_remind_enabled !== false
  const quotaRemindThreshold = status?.quota_remind_threshold ?? 0
  const tabs = [
    { value: 'bindings', label: t('Account Bindings'), icon: Link2 },
    {
      value: 'notifications',
      label: t('Subscription Notifications'),
      icon: Bell,
    },
    { value: 'details', label: t('Edit Profile'), icon: UserRoundPen },
    { value: 'security', label: t('Security Settings'), icon: ShieldCheck },
    { value: 'preferences', label: t('Preferences'), icon: Settings2 },
  ]

  return (
    <Main>
      <div className='min-h-0 flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8'>
        <div className='flex w-full flex-col gap-5 sm:gap-6'>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('Personal Center')}
          </h1>
          <ProfileHeader profile={profile} loading={loading} />
          {!loading && !profile && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('Failed to load profile')}</EmptyTitle>
                <EmptyDescription>
                  {t('Refresh the list and try again.')}
                </EmptyDescription>
              </EmptyHeader>
              <Button variant='outline' onClick={() => void fetchProfile()}>
                {t('Retry')}
              </Button>
            </Empty>
          )}
          {profile && (
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(String(value))}
              className='mt-2 gap-6'
            >
              <div className='max-w-full overflow-x-auto pb-1'>
                <TabsList
                  aria-label={t('Profile settings')}
                  className='bg-background h-auto rounded-full border p-1'
                >
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className='data-active:bg-foreground data-active:text-background h-8 flex-none gap-1.5 rounded-full px-3 text-sm font-medium data-active:shadow-none'
                    >
                      <tab.icon className='size-4' aria-hidden='true' />
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <TabsContent value='bindings' className='space-y-4'>
                {activeTab === 'bindings' && (
                  <>
                    <p className='text-muted-foreground text-sm'>
                      {t(
                        'Connect your accounts for easier sign-in and account recovery'
                      )}
                    </p>
                    <AccountBindings
                      profile={profile}
                      onUpdate={refreshProfile}
                      presentation='compact'
                    >
                      <li className='min-w-0'>
                        <PasskeyCard loading={false} presentation='compact' />
                      </li>
                    </AccountBindings>
                  </>
                )}
              </TabsContent>
              <TabsContent value='notifications'>
                {activeTab === 'notifications' && (
                  <div className='rounded-2xl border p-4 sm:p-6'>
                    <NotificationTab
                      profile={profile}
                      onUpdate={refreshProfile}
                      quotaRemindEnabled={quotaRemindEnabled}
                      quotaRemindThreshold={quotaRemindThreshold}
                    />
                  </div>
                )}
              </TabsContent>
              <TabsContent value='details'>
                {activeTab === 'details' && (
                  <ProfileDetailsForm
                    profile={profile}
                    updating={updating}
                    onSave={updateProfile}
                  />
                )}
              </TabsContent>
              <TabsContent value='security'>
                {activeTab === 'security' && (
                  <ProfileSecurityPanel
                    profile={profile}
                    onUpdate={refreshProfile}
                  />
                )}
              </TabsContent>
              <TabsContent value='preferences'>
                {activeTab === 'preferences' && (
                  <div className='grid items-start gap-4 xl:grid-cols-2'>
                    <div className='min-w-0 space-y-4'>
                      <LanguagePreferencesCard
                        profile={profile}
                        onProfileUpdate={refreshProfile}
                      />
                      {canConfigureSidebar && <SidebarModulesCard />}
                    </div>
                    {checkinEnabled && (
                      <CheckinCalendarCard
                        checkinEnabled={checkinEnabled}
                        turnstileEnabled={turnstileEnabled}
                        turnstileSiteKey={status?.turnstile_site_key || ''}
                      />
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </Main>
  )
}
