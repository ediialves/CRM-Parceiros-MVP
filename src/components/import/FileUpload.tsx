import React, { useCallback, useState } from 'react';
import { Upload, FileType, AlertCircle } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  title: string;
  description: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, accept = '.xlsx', title, description }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.xlsx')) {
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center text-center gap-4
        ${isDragging ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:border-primary-light'}
      `}
    >
      <div className="w-16 h-16 bg-background rounded-full flex items-center justify-center text-primary-light">
        <Upload size={32} />
      </div>
      
      <div>
        <h3 className="text-lg font-bold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary max-w-sm mx-auto">
          {description}
        </p>
      </div>

      <label className="cursor-pointer">
        <input 
          type="file" 
          className="hidden" 
          accept={accept}
          onChange={handleFileInput}
        />
        <span className="px-6 py-2 bg-primary text-white rounded-md font-medium hover:bg-primary-light transition-colors inline-block">
          Selecionar Arquivo
        </span>
      </label>

      <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase tracking-wider font-semibold">
        <FileType size={12} />
        Apenas arquivos .XLSX
      </div>
    </div>
  );
};
