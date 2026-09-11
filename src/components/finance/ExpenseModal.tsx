import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Printer, Trash2 } from 'lucide-react';
import { Expense, ExpenseKind, expenseSavings, InstallmentPlan } from '@/store/FinanceStore';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PaymentMethod } from '@/store/OrderStore';
import { DateField } from './DateField';

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 9);

interface Props {
  open: boolean;
  onClose: () => void;
  expense?: Expense | null;
  onSave: (e: Expense) => void;
  onDelete?: (id: string) => void;
  /** Encerra a série desta despesa. Ausente = a tela não oferece o encerrar. */
  onEndRecurrence?: (id: string) => void;
}

const empty = (kind: ExpenseKind): Expense => ({
  id: uid(), kind, service: '', destination: '',
  predictedValue: 0, predictedDate: kind === 'PREVISAO' ? today() : undefined,
  status: kind === 'PREVISAO' ? 'Não Pago' : undefined,
  paidValue: kind === 'PAGO' ? 0 : undefined,
  paymentDate: kind === 'PAGO' ? today() : undefined,
  paymentMethod: '',
});

export function ExpenseModal({ open, onClose, expense, onSave, onDelete, onEndRecurrence }: Props) {
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [e, setE] = useState<Expense>(empty('PREVISAO'));
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    if (open) {
      if (expense) { setE(expense); setStep('form'); }
      else { setStep('pick'); }
    }
  }, [open, expense]);

  const upd = <K extends keyof Expense>(k: K, v: Expense[K]) => setE(prev => ({ ...prev, [k]: v }));

  const isPrevisao = e.kind === 'PREVISAO';
  const showPayment = e.kind === 'PAGO' || e.status === 'Pago';
  const isCredit = e.paymentMethod === 'Credit Card' || e.paymentMethod === 'Boleto';
  const baseValue = e.paidValue ?? e.predictedValue ?? 0;

  // Sync installment plan length
  useEffect(() => {
    if (!showPayment || !isCredit) return;
    const n = e.installments || 0;
    const cur = e.installmentPlan || [];
    if (cur.length === n) return;
    const valuePer = n > 0 ? +(baseValue / n).toFixed(2) : 0;
    const next: InstallmentPlan[] = Array.from({ length: n }, (_, i) =>
      cur[i] || { date: '', value: valuePer }
    );
    upd('installmentPlan', next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.installments, isCredit, showPayment]);

  const setInstallment = (i: number, patch: Partial<InstallmentPlan>) => {
    const next = (e.installmentPlan || []).map((p, idx) => idx === i ? { ...p, ...patch } : p);
    upd('installmentPlan', next);
  };

  if (step === 'pick') {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar Despesa</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Escolha o tipo:</p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-24 flex-col gap-1 border-orange-500 text-orange-700 hover:bg-orange-50"
              onClick={() => { setE(empty('PREVISAO')); setStep('form'); }}
            >
              <span className="text-lg font-bold">PREVISÃO</span>
              <span className="text-xs">Forecast</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex-col gap-1 border-red-500 text-red-700 hover:bg-red-50"
              onClick={() => { setE(empty('PAGO')); setStep('form'); }}
            >
              <span className="text-lg font-bold">PAGO</span>
              <span className="text-xs">Paid</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-none print:overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Despesa — <span className={isPrevisao ? 'text-orange-600' : 'text-red-600'}>{e.kind}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Section 1 */}
        <Card><CardContent className="pt-4 space-y-3">
          <h3 className="font-semibold text-secondary">1. Informações Gerais</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Serviço</Label><Input value={e.service} onChange={ev => upd('service', ev.target.value)} /></div>
            <div><Label>Destino</Label><Input value={e.destination} onChange={ev => upd('destination', ev.target.value)} /></div>

            {isPrevisao ? (
              <>
                <div><Label>Valor Previsto (R$)</Label><Input type="number" value={e.predictedValue || ''} onChange={ev => upd('predictedValue', +ev.target.value || 0)} /></div>
                <div><Label>Data Prevista</Label><DateField value={e.predictedDate} onChange={v => upd('predictedDate', v)} /></div>
                <div className="col-span-2">
                  <Label>Status</Label>
                  <Select value={e.status || 'Não Pago'} onValueChange={v => upd('status', v as Expense['status'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Não Pago">Não Pago</SelectItem>
                      <SelectItem value="Pago">Pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div><Label>Valor Pago (R$)</Label><Input type="number" value={e.paidValue || ''} onChange={ev => upd('paidValue', +ev.target.value || 0)} /></div>
                <div><Label>Data Pagamento</Label><DateField value={e.paymentDate} onChange={v => upd('paymentDate', v)} /></div>
              </>
            )}
          </div>
        </CardContent></Card>

        {/* Payment section */}
        {showPayment && (
          <Card><CardContent className="pt-4 space-y-3">
            <h3 className="font-semibold text-secondary">Pagamento</h3>
            {isPrevisao && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor Pago (R$)</Label><Input type="number" value={e.paidValue ?? e.predictedValue ?? 0} onChange={ev => upd('paidValue', +ev.target.value || 0)} /></div>
                <div><Label>Data Pagamento</Label><DateField value={e.paymentDate} onChange={v => upd('paymentDate', v)} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={e.paymentMethod || ''} onValueChange={v => upd('paymentMethod', v as PaymentMethod)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {isCredit && (
                <div>
                  <Label>Parcelas</Label>
                  <Input type="number" min={1} value={e.installments || ''} onChange={ev => upd('installments', +ev.target.value || 1)} />
                </div>
              )}
            </div>

            {isCredit && (e.installmentPlan || []).length > 0 && (
              <div className="space-y-2">
                <Label>Datas e valores das parcelas</Label>
                {(e.installmentPlan || []).map((p, i) => (
                  <div key={i} className="grid grid-cols-[60px_1fr_1fr] gap-2 items-center">
                    <span className="text-sm font-medium">{i + 1}ª</span>
                    <DateField value={p.date} onChange={v => setInstallment(i, { date: v })} />
                    <Input type="number" value={p.value || ''} onChange={ev => setInstallment(i, { value: +ev.target.value || 0 })} />
                  </div>
                ))}
              </div>
            )}

            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={e.observations || ''} onChange={ev => upd('observations', ev.target.value)} />
            </div>
          </CardContent></Card>
        )}

        {/* Repetição.
            Só aparece ao CRIAR. Numa despesa que já existe, desmarcar não é
            "não repetir": é apagar os meses futuros já lançados. Isso é ação
            deliberada e mora no card de recorrência, com confirmação — não num
            switch que se desmarca sem querer ao editar outro campo.

            Numa ocorrência gerada (recurrenceId presente) também não aparece:
            ela não comanda a série, só pertence a ela. */}
        {!expense && (
          <Card><CardContent className="pt-4">
            <h3 className="font-semibold text-secondary mb-2">Repetição</h3>
            <label className="flex items-start gap-3 cursor-pointer">
              <Switch
                checked={!!e.recurring}
                onCheckedChange={v => upd('recurring', v)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium">Repetir todo mês</span>
                <span className="block text-muted-foreground text-xs mt-0.5">
                  Cria uma despesa por mês a partir desta, até você encerrar. Cada
                  mês pode ser pago, editado ou excluído por conta própria.
                </span>
              </span>
            </label>
          </CardContent></Card>
        )}

        {/* Numa ocorrência de uma série ativa, o caminho para parar. */}
        {expense?.recurrenceId && expense.recurring && onEndRecurrence && (
          <Card><CardContent className="pt-4">
            <h3 className="font-semibold text-secondary mb-2">Repetição</h3>
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                Esta despesa se repete todo mês. Encerrar mantém o que já passou e
                os meses já pagos, e remove as previsões futuras.
              </span>
              <Button variant="outline" className="shrink-0" onClick={() => setConfirmEnd(true)}>
                Encerrar repetição
              </Button>
            </div>
          </CardContent></Card>
        )}

        {/* Summary (PREVISAO) */}
        {isPrevisao && (
          <Card><CardContent className="pt-4">
            <h3 className="font-semibold text-secondary mb-2">2. Resumo</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><div className="text-xs text-muted-foreground">Valor Previsto</div><div className="text-lg font-bold">{BRL(e.predictedValue || 0)}</div></div>
              <div><div className="text-xs text-muted-foreground">Valor Pago</div><div className="text-lg font-bold">{BRL(e.paidValue ?? e.predictedValue ?? 0)}</div></div>
              <div><div className="text-xs text-muted-foreground">Economia</div><div className="text-lg font-bold text-green-700">{BRL(expenseSavings(e))}</div></div>
            </div>
          </CardContent></Card>
        )}

        <div className="flex justify-between gap-2 pt-2 print:hidden">
          <div>
            {expense && onDelete && (
              <Button variant="destructive" onClick={() => setConfirmDel(true)} className="gap-1.5">
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="h-4 w-4" /> Imprimir</Button>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => { onSave(e); onClose(); }}>Salvar</Button>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir despesa?</AlertDialogTitle>
            <AlertDialogDescription>
              {e.recurrenceId ? (
                <>
                  "{e.service || e.kind}" se repete todo mês. Excluir remove
                  <strong> todas as repetições ainda não pagas</strong>, e não só
                  este mês — os meses já pagos ficam, porque o dinheiro saiu.
                </>
              ) : (
                <>Esta ação removerá permanentemente a despesa "{e.service || e.kind}".</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { onDelete?.(e.id); setConfirmDel(false); onClose(); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar a repetição?</AlertDialogTitle>
            <AlertDialogDescription>
              "{e.service || e.kind}" deixa de gerar meses novos. O que já passou
              fica, e os meses futuros que já estiverem pagos também. As previsões
              futuras ainda não pagas são removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onEndRecurrence?.(e.id); setConfirmEnd(false); onClose(); }}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
