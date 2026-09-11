import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Admin from '@/pages/Admin'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api/client', () => ({ apiClient: { get } }))
vi.mock('@/components/AuditLogTable', () => ({
  AuditLogTable: ({ historyUrl }: { historyUrl: string }) => <div data-testid="historico">{historyUrl}</div>,
}))

beforeEach(() => get.mockReset())
afterEach(cleanup)

async function buscar(indice: string) {
  render(<Admin />)
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Cotações' }), { button: 0, ctrlKey: false })
  fireEvent.change(await screen.findByLabelText('Índice da cotação'), { target: { value: indice } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Buscar' })) })
}

describe('auditoria por índice da cotação', () => {
  it('busca o índice exato e abre o histórico da cotação encontrada', async () => {
    get.mockResolvedValue({ data: { items: [{ id: 'cot-47', numero: 47 }] } })
    await buscar(' 047 ')
    expect(get).toHaveBeenCalledWith('/quotes', { params: { numero: 47, limit: 1 } })
    expect(await screen.findByTestId('historico')).toHaveTextContent('/quotes/cot-47/history')
  })

  it('não abre um resultado de outro índice mesmo se a API ignorar o filtro', async () => {
    get.mockResolvedValue({ data: { items: [{ id: 'cot-147', numero: 147, numero_requisicao: '47' }] } })
    await buscar('47')
    expect(await screen.findByText(/Nenhum registro encontrado/)).toBeInTheDocument()
    expect(screen.queryByTestId('historico')).not.toBeInTheDocument()
  })

  it.each(['REQ-001', '0', '47.5', '999999999999999999999'])('recusa índice inválido: %s', async valor => {
    await buscar(valor)
    await waitFor(() => expect(screen.getByText(/Nenhum registro encontrado/)).toBeInTheDocument())
    expect(get).not.toHaveBeenCalled()
  })
})
