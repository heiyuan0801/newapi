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
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { ImageDialog } from '../dialogs/image-dialog'

it('clears a failed image when the externally controlled preview reopens', () => {
  const props = {
    imageUrl: 'https://images.example.com/first.png',
    onOpenChange: vi.fn(),
  }
  const { rerender } = render(<ImageDialog {...props} open />)
  fireEvent.error(screen.getByRole('img', { name: 'Generated image' }))
  expect(screen.getByText('Failed to load image')).toBeVisible()

  rerender(<ImageDialog {...props} open={false} />)
  rerender(<ImageDialog {...props} open />)

  expect(screen.queryByText('Failed to load image')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Generated image' })).toHaveClass(
    'opacity-0'
  )
})

it('starts loading the replacement image without preserving the previous failure', () => {
  const { rerender } = render(
    <ImageDialog
      imageUrl='https://images.example.com/first.png'
      onOpenChange={vi.fn()}
      open
    />
  )
  fireEvent.error(screen.getByRole('img', { name: 'Generated image' }))

  rerender(
    <ImageDialog
      imageUrl='https://images.example.com/next.png'
      onOpenChange={vi.fn()}
      open
    />
  )

  expect(screen.queryByText('Failed to load image')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Generated image' })).toHaveAttribute(
    'src',
    'https://images.example.com/next.png'
  )
})

it('lets the keyboard retry a failed image preview', async () => {
  const user = userEvent.setup()
  render(
    <ImageDialog
      imageUrl='https://images.example.com/first.png'
      onOpenChange={vi.fn()}
      open
    />
  )
  const image = screen.getByRole('img', { name: 'Generated image' })
  fireEvent.error(image)
  const retry = within(screen.getByRole('dialog')).getByRole('button', {
    name: 'Retry',
  })
  retry.focus()

  await user.keyboard('{Enter}')

  expect(screen.queryByText('Failed to load image')).not.toBeInTheDocument()
  const retriedImage = screen.getByRole('img', { name: 'Generated image' })
  expect(retriedImage).not.toBe(image)
  fireEvent.load(retriedImage)
  expect(retriedImage).toHaveClass('opacity-100')
})
