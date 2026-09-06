import { describe, it, expect } from 'vitest';
import { formatarNumeroOS } from '@/lib/numero-os';

/* O documento impresso saiu com "OS-OS-006".
 *
 * O template colava "OS-" na frente do numero sem olhar. Funcionou enquanto os
 * pedidos tinham numero_os = "003"; quebrou quando o backend passou a gravar
 * "OS-006" (f"OS-{num:03d}"). Os dois formatos convivem no mesmo banco, entao
 * a exibicao tem que aguentar os dois. */

describe('número da OS no documento impresso', () => {
  it('põe o prefixo em quem não tem', () => {
    expect(formatarNumeroOS('006')).toBe('OS-006');
    expect(formatarNumeroOS('1001')).toBe('OS-1001');
  });

  it('NÃO duplica o prefixo em quem já tem — era o bug', () => {
    expect(formatarNumeroOS('OS-006')).toBe('OS-006');
    expect(formatarNumeroOS('OS-1001')).toBe('OS-1001');
  });

  it('aguenta as variações que um campo digitado à mão produz', () => {
    expect(formatarNumeroOS('os-006')).toBe('OS-006');
    expect(formatarNumeroOS('OS 006')).toBe('OS-006');
    expect(formatarNumeroOS('  OS-006  ')).toBe('OS-006');
  });

  it('sem número, não imprime um traço solto', () => {
    expect(formatarNumeroOS('')).toBe('OS');
    expect(formatarNumeroOS(undefined)).toBe('OS');
    expect(formatarNumeroOS('OS')).toBe('OS');
  });

  it('não mexe em número que não seja do padrão', () => {
    expect(formatarNumeroOS('ORC-2024/7')).toBe('OS-ORC-2024/7');
  });
});
