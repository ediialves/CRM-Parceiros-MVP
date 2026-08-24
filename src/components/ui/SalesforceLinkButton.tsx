import React from 'react';
import { Cloud } from 'lucide-react';

export interface SalesforceLinkButtonProps {
  salesforceId?: string | null;
  className?: string;
}

export const SalesforceLinkButton: React.FC<SalesforceLinkButtonProps> = ({
  salesforceId,
  className = '',
}) => {
  if (!salesforceId || salesforceId.trim() === '') {
    return null;
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    window.open(
      `https://contaazul.lightning.force.com/lightning/r/Account/${salesforceId}/view`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Abrir no Salesforce"
      className={`p-1 rounded-md text-[#00A1E0] hover:text-[#0082B8] hover:bg-[#00A1E0]/10 transition-colors inline-flex items-center justify-center shrink-0 cursor-pointer ${className}`}
      id="btn-open-salesforce"
    >
      <Cloud className="h-4 w-4 fill-[#00A1E0]/20" />
    </button>
  );
};

export default SalesforceLinkButton;
