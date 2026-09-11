import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { DashboardPieChart } from './DashboardPieChart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data }: any) => <div data-testid="pie">{data?.map((d: any) => <span key={d.name}>{d.name}: {d.value}</span>)}</div>,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

describe('DashboardPieChart', () => {
  it('renderiza o título "Custo Total — Composição"', () => {
    render(<DashboardPieChart custoProdutos={100} custoFrete={200} custoAdicionais={50} />);
    expect(screen.getByText('Custo Total — Composição')).toBeInTheDocument();
  });

  it('renderiza os 3 nomes de slice quando todos os valores > 0', () => {
    render(<DashboardPieChart custoProdutos={100} custoFrete={200} custoAdicionais={50} />);
    expect(screen.getByText('Custo de produtos: 100')).toBeInTheDocument();
    expect(screen.getByText('Fretes: 200')).toBeInTheDocument();
    expect(screen.getByText('Custos adicionais: 50')).toBeInTheDocument();
  });

  it('filtra slice com value = 0 (Custos adicionais=0 não aparece)', () => {
    render(<DashboardPieChart custoProdutos={100} custoFrete={200} custoAdicionais={0} />);
    expect(screen.getByText('Custo de produtos: 100')).toBeInTheDocument();
    expect(screen.getByText('Fretes: 200')).toBeInTheDocument();
    expect(screen.queryByText(/Custos adicionais:/)).not.toBeInTheDocument();
  });
});


it('shows the three components from the reported case', () => {
  render(<DashboardPieChart custoProdutos={840} custoAdicionais={85.4} custoFrete={135} />);
  expect(screen.getByText('Custo de produtos: 840')).toBeInTheDocument();
  expect(screen.getByText('Custos adicionais: 85.4')).toBeInTheDocument();
  expect(screen.getByText('Fretes: 135')).toBeInTheDocument();
});
