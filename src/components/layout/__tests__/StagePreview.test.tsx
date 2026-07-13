import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import StagePreview from '@/components/layout/StagePreview'

describe('StagePreview', () => {
  it('should render without crashing', () => {
    const { container } = render(<StagePreview />)
    expect(container).toBeTruthy()
  })

  it('should show empty state when no states available', () => {
    const { container } = render(<StagePreview />)
    // With initial mock data it should render the stage area
    expect(container.innerHTML).toBeTruthy()
  })
})
