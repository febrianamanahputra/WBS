export interface Location {
  id: string;
  name: string;
  projectEndDate?: string;
}

export interface Worker {
  id: string;
  name: string;
  color: string;
  locationId: string;
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
  locationId: string;
}
