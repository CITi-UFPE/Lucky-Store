import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useOrdersQuery } from '@/hooks/use-orders-query'
import { apiClient } from '@/api/client'
import type { ReactNode } from 'react'

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useOrdersQuery', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with isLoading true and no data before fetch resolves', () => {
    vi.spyOn(apiClient, 'request').mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(
      () => useOrdersQuery({ page: 1, limit: 20, sort_by: 'data_pedido', sort_dir: 'desc' }),
      { wrapper: makeWrapper() }
    )
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('returns data after successful fetch', async () => {
    const payload = { items: [], total: 0, page: 1, limit: 20, pages: 0 }
    vi.spyOn(apiClient, 'request').mockResolvedValue({ data: payload })
    const { result } = renderHook(
      () => useOrdersQuery({ page: 1, limit: 20, sort_by: 'data_pedido', sort_dir: 'desc' }),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual(payload)
    expect(result.current.isError).toBe(false)
  })

  it('sets isError on fetch failure', async () => {
    vi.spyOn(apiClient, 'request').mockRejectedValue({ response: { status: 401, data: { detail: 'Unauthorized' } } })
    const { result } = renderHook(
      () => useOrdersQuery({ page: 1, limit: 20, sort_by: 'data_pedido', sort_dir: 'desc' }),
      { wrapper: makeWrapper() }
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})
