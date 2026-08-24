import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Partner, Plan, Task } from '../../types';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { SalesforceLinkButton } from '../ui/SalesforceLinkButton';

interface PartnerCardProps {
  partner: Partner;
  activePlans: (Plan & { tasks?: Task[] })[];
  onRefresh?: () => void;
}

export const PartnerCard: React.FC<PartnerCardProps> = ({ partner, activePlans, onRefresh }) => {
  const navigate = useNavigate();

  // Juntar todas as tasks de todos os planos ativos
  const activePlansTasks = activePlans.flatMap(p => p.tasks ?? []);

  // Calcular progresso consolidado de todos os planos ativos
  const planProgress = activePlans.length > 0 && activePlansTasks.length > 0 
    ? (activePlansTasks.filter(t => t.status === 'concluida').length / activePlansTasks.length) * 100
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
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-xs text-text-secondary font-mono">{partner.id}</p>
            <SalesforceLinkButton salesforceId={partner.salesforce_id} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={getEngagementVariant(partner.percentual_engajamento)}>
            {partner.percentual_engajamento}%
          </Badge>
          <Badge variant="primary">
            {partner.segmento || 'N/A'}
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="neutral">{partner.nivel}</Badge>
        </div>

        <div className="grid grid-cols-1 gap-1">
          <div className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Gerente: <span className="font-medium text-text-primary">{partner.gerente}</span></span>
            <span>Perfil: <span className="font-medium text-text-primary">{partner.perfil_parceiro}</span></span>
          </div>
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
              style={{ width: `${partner.licencas > 0 ? (partner.licencas_engajadas / partner.licencas) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-gray-50 mt-auto flex flex-col gap-3">
        {activePlans.length > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-secondary italic truncate flex-1" title={activePlans.map(p => p.titulo).join(', ')}>
                Playbook: {activePlans.map(p => p.titulo).join(', ')}
              </span>
              <span className="text-[10px] font-bold text-primary ml-2">{Math.round(planProgress)}%</span>
            </div>
            <ProgressBar progress={planProgress} />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary border-l-2 border-danger pl-2">
              Nenhum playbook ativo
            </span>
            <ProgressBar progress={0} />
          </div>
        )}
      </div>
    </div>
  );
};
