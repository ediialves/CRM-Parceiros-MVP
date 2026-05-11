import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Partner, Plan, Task } from '../../types';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';

interface PartnerCardProps {
  partner: Partner;
  plan: Plan | undefined;
  tasks: Task[];
}

export const PartnerCard: React.FC<PartnerCardProps> = ({ partner, plan, tasks }) => {
  const navigate = useNavigate();

  // Calcular progresso do plano
  const planProgress = plan && tasks.length > 0 
    ? (tasks.filter(t => t.status === 'concluida').length / tasks.length) * 100
    : 0;

  // Cor do engajamento
  const getEngagementVariant = (percent: number) => {
    if (percent > 70) return 'success';
    if (percent > 40) return 'secondary';
    return 'danger';
  };

  return (
    <div 
      className="bg-surface p-5 rounded-xl border border-transparent shadow-sm hover:shadow-md hover:border-border transition-all cursor-pointer flex flex-col gap-4 group"
      id={`partner-card-${partner.id}`}
      onClick={() => navigate(`/parceiros/${partner.id}`)}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-text-primary leading-tight group-hover:text-primary transition-colors truncate">
            {partner.nome}
          </h3>
          <p className="text-xs text-text-secondary font-mono mt-0.5">{partner.id}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={getEngagementVariant(partner.percentual_engajamento)}>
            {partner.percentual_engajamento}%
          </Badge>
          <Badge variant={partner.fila === 'RETENÇÃO' ? 'danger' : 'success'}>
            {partner.fila}
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral">{partner.nivel}</Badge>
          <Badge variant={partner.segmentacao.startsWith('S1') ? 'secondary' : 'neutral'}>
            {partner.segmentacao}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-1">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Gerente: <span className="font-medium text-text-primary">{partner.gerente}</span></span>
          </div>
          <p className="text-[10px] text-text-secondary">{partner.perfil_parceiro} • {partner.perfil_servico}</p>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-end">
            <span className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold">Licenças</span>
            <span className="text-xs font-bold text-text-primary">
              {partner.licencas_engajadas} / {partner.licencas}
            </span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary" 
              style={{ width: `${(partner.licencas_engajadas / partner.licencas) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-gray-50 mt-auto">
        {plan ? (
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-secondary italic truncate flex-1">
                Plano: {plan.titulo}
              </span>
              <span className="text-[10px] font-bold text-primary ml-2">{Math.round(planProgress)}%</span>
            </div>
            <ProgressBar progress={planProgress} />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary border-l-2 border-danger pl-2">
              Nenhum plano ativo
            </span>
            <ProgressBar progress={0} />
          </div>
        )}
      </div>
    </div>
  );
};
