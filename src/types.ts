export interface Location {
  id: string;
  name: string;
}

export interface Worker {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  name: string;
  createdAt: string;
  startDate: string;
  deadline: string;
  duration?: number;
  status: 'pending' | 'completed';
  workerId?: string;
}
