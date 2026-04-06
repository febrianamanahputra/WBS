export interface Task {
  id: string;
  name: string;
  createdAt: string;
  startDate: string;
  deadline: string;
  duration?: number;
  status: 'pending' | 'completed';
  projectId?: string;
}
