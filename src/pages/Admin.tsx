import { useId, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuditLogTable } from '@/components/AuditLogTable'
import { apiClient } from '@/api/client'
import type { CotacaoResponse } from '@/types/api'

// ─── Generic search + audit panel ─────────────────────────────────────────────

interface AuditSearchPanelProps {
  label: string
  placeholder: string
  resolveId: (input: string) => Promise<string | null>
  historyUrl: (id: string) => string
  queryKey: (id: string) => string[]
}

function AuditSearchPanel({
  label, placeholder, resolveId, historyUrl, queryKey,
}: AuditSearchPanelProps) {
  const inputId = useId()
  const [input, setInput] = useState('')
  const [entityId, setEntityId] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleBuscar() {
    const value = input.trim()
    if (!value) return
    setLoading(true)
    setNotFound(false)
    setEntityId(null)
    try {
      const id = await resolveId(value)
      if (id) {
        setEntityId(id)
      } else {
        setNotFound(true)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor={inputId}>{label}</Label>
          <Input
            id={inputId}
            placeholder={placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleBuscar()}
          />
        </div>
        <Button onClick={handleBuscar} disabled={!input.trim() || loading}
          className="bg-[#2F6BFF] hover:bg-[#1E4FD8] text-white">
          {loading ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>

      {notFound && (
        <p className="text-sm text-muted-foreground">
          Nenhum registro encontrado para "{input.trim()}".
        </p>
      )}

      {entityId && (
        <AuditLogTable
          historyUrl={historyUrl(entityId)}
          queryKey={queryKey(entityId)}
        />
      )}
    </div>
  )
}

// ─── Resolver helpers ──────────────────────────────────────────────────────────

async function resolveOrderId(numeroOs: string): Promise<string | null> {
  const { data } = await apiClient.get('/pedidos', { params: { numero_os: numeroOs, limit: 1 } })
  return data?.items?.[0]?.id ?? null
}

async function resolveQuoteId(indice: string): Promise<string | null> {
  if (!/^\d+$/.test(indice)) return null
  const numero = Number(indice)
  if (!Number.isInteger(numero) || numero < 1 || numero > 2147483647) return null
  const { data } = await apiClient.get<{ items: Pick<CotacaoResponse, 'id' | 'numero'>[] }>(
    '/quotes', { params: { numero, limit: 1 } },
  )
  return data?.items?.find(cotacao => cotacao.numero === numero)?.id ?? null
}

async function resolveRmaId(numeroRma: string): Promise<string | null> {
  const { data } = await apiClient.get('/rma', { params: { numero_rma: numeroRma, limit: 1 } })
  return data?.items?.[0]?.id ?? null
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Admin() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-secondary">Painel Administrativo</h1>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pedidos">
            <TabsList className="mb-4">
              <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
              <TabsTrigger value="cotacoes">Cotações</TabsTrigger>
              <TabsTrigger value="rmas">RMAs</TabsTrigger>
            </TabsList>

            <TabsContent value="pedidos">
              <AuditSearchPanel
                label="Número da OS"
                placeholder="Ex: OS-001"
                resolveId={resolveOrderId}
                historyUrl={id => `/pedidos/${id}/history`}
                queryKey={id => ['audit', 'pedido', id]}
              />
            </TabsContent>

            <TabsContent value="cotacoes">
              <AuditSearchPanel
                label="Índice da cotação"
                placeholder="Ex: 47"
                resolveId={resolveQuoteId}
                historyUrl={id => `/quotes/${id}/history`}
                queryKey={id => ['audit', 'cotacao', id]}
              />
            </TabsContent>

            <TabsContent value="rmas">
              <AuditSearchPanel
                label="Nº RMA"
                placeholder="Ex: RMA-001"
                resolveId={resolveRmaId}
                historyUrl={id => `/rma/${id}/history`}
                queryKey={id => ['audit', 'rma', id]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
