import React from 'react';
import { Task } from '../../types';
import { TaskItem } from './TaskItem';

interface TaskListProps {
  tasks: Task[];
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onToggleStatus: (id: string) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, onEditTask, onDeleteTask, onToggleStatus }) => {
  // Ordenar tasks: primeiro por status (em_andamento e agenda primeiro) e depois por data
  const statusOrder: Record<Task['status'], number> = {
    'em_andamento': 0,
    'agenda': 1,
    'backlog': 2,
    'concluida': 3
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="flex flex-col">
      {sortedTasks.length > 0 ? (
        sortedTasks.map(task => (
          <TaskItem 
            key={task.id} 
            task={task} 
            onEdit={onEditTask} 
            onDelete={onDeleteTask} 
            onToggleStatus={onToggleStatus}
          />
        ))
      ) : (
        <div className="py-8 text-center border-b border-border">
          <p className="text-sm text-text-secondary italic">Nenhuma task cadastrada para este plano.</p>
        </div>
      )}
    </div>
  );
};
