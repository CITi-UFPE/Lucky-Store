/** "006" e "OS-006" saem os dois como "OS-006".
 *
 * `numero_os` é texto livre e convive com dois formatos no mesmo banco: o
 * backend grava "OS-006" (`f"OS-{num:03d}"`), pedidos antigos têm só "003", e o
 * campo aceita valor digitado à mão. O documento impresso colava "OS-" na
 * frente sem olhar, então quem já tinha o prefixo saía como "OS-OS-006".
 *
 * Normalizar na exibição, e não no dado: mexer nos números já gravados mudaria
 * o que saiu em papel na mão do cliente.
 */
export function formatarNumeroOS(os?: string): string {
  const bruto = (os ?? '').trim();
  if (!bruto) return 'OS';
  const semPrefixo = bruto.replace(/^os[\s-]*/i, '');
  return semPrefixo ? `OS-${semPrefixo}` : 'OS';
}
