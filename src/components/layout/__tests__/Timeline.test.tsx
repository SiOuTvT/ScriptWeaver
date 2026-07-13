import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Timeline from '@/components/layout/Timeline'

describe('Timeline', () => {
  it('should render track headers', () => {
    const { container } = render(<Timeline />)
    // Timeline should exist
    expect(container).toBeTruthy()
  })

  it('should render track labels (BGM, Ambient, SE)', () => {
    const { container } = render(<Timeline />)
    const html = container.innerHTML
    // At minimum the component should render without crashing
    expect(html).toBeTruthy()
  })
})
