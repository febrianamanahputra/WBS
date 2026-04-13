import React, { useState, useEffect, useMemo } from 'react';
import { format, differenceInDays, isBefore, startOfDay, parseISO, eachDayOfInterval, addDays, isSameDay, min, addMonths } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Plus, CheckCircle2, Circle, Trash2, Calendar, Clock, AlertCircle, FolderKanban, UserPlus, X, GripVertical, MapPin, Printer } from 'lucide-react';
import { Task, Worker, Location } from './types';

const loadData = <T,>(key: string, defaultValue: T): T => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : defaultValue;
};

const saveData = <T,>(key: string, data: T) => {
  localStorage.setItem(key, JSON.stringify(data));
};

const CELL_WIDTH = 40; // width of each day cell in pixels

// Helper to add working days (skipping Sundays)
const addWorkingDays = (startDate: Date, duration: number): Date => {
  let currentDate = startDate;
  if (currentDate.getDay() === 0) {
    currentDate = addDays(currentDate, 1);
  }
  let daysRemaining = duration - 1;
  while (daysRemaining > 0) {
    currentDate = addDays(currentDate, 1);
    if (currentDate.getDay() !== 0) {
      daysRemaining--;
    }
  }
  return currentDate;
};

// Helper to count working days between two dates
const getWorkingDaysCount = (startDate: Date, endDate: Date): number => {
  let count = 0;
  let currentDate = startDate;
  if (currentDate.getDay() === 0) {
    currentDate = addDays(currentDate, 1);
  }
  if (isBefore(endDate, currentDate)) return 0;
  
  while (!isBefore(endDate, currentDate)) {
    if (currentDate.getDay() !== 0) {
      count++;
    }
    currentDate = addDays(currentDate, 1);
  }
  return count;
};

declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}

export default function App() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [currentLocationId, setCurrentLocationId] = useState<string>('');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState<number | ''>(7);
  const [newTaskWorkerId, setNewTaskWorkerId] = useState<string>('');
  
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerColor, setNewWorkerColor] = useState('#eab308'); // Default yellow
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  
  const [projectEndDate, setProjectEndDate] = useState(format(addMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [dayNameFormat, setDayNameFormat] = useState<'EEEEE' | 'EEE' | 'EEEE'>('EEE');

  const toggleDayFormat = () => {
    setDayNameFormat(prev => {
      if (prev === 'EEEEE') return 'EEE';
      if (prev === 'EEE') return 'EEEE';
      return 'EEEEE';
    });
  };
  const formatLabel = dayNameFormat === 'EEEEE' ? '1 Huruf' : dayNameFormat === 'EEE' ? '3 Huruf' : 'Penuh';

  const [dragState, setDragState] = useState<{
    taskId: string;
    startX: number;
    initialStart: Date;
    initialEnd: Date;
    deltaDays: number;
    type: 'move' | 'resize';
  } | null>(null);

  const [draggedWorkerId, setDraggedWorkerId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  const [paneDrag, setPaneDrag] = useState<{ startX: number; startWidth: number } | null>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(320);

  // Load locations from Local Storage
  useEffect(() => {
    const loadedLocations = loadData<Location[]>('gantt_locations', []);
    
    if (loadedLocations.length > 0) {
      setLocations(loadedLocations);
      if (!currentLocationId || !loadedLocations.find(l => l.id === currentLocationId)) {
        setCurrentLocationId(loadedLocations[0].id);
      }
    } else {
      // Create default location if none exists
      const defaultLoc: Location = { 
        id: crypto.randomUUID(), 
        name: 'Proyek Utama', 
        projectEndDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd') 
      };
      setLocations([defaultLoc]);
      setCurrentLocationId(defaultLoc.id);
      saveData('gantt_locations', [defaultLoc]);
    }
    setIsInitialLoad(false);
  }, []);

  // Load tasks, workers, and settings when location changes
  useEffect(() => {
    if (isInitialLoad || !currentLocationId) return;

    // Set projectEndDate from location
    const currentLoc = locations.find(l => l.id === currentLocationId);
    if (currentLoc && currentLoc.projectEndDate) {
      setProjectEndDate(currentLoc.projectEndDate);
    }

    const allTasks = loadData<Task[]>('gantt_tasks', []);
    const locationTasks = allTasks.filter(t => t.locationId === currentLocationId);
    locationTasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    setTasks(locationTasks);

    const allWorkers = loadData<Worker[]>('gantt_workers', []);
    const locationWorkers = allWorkers.filter(w => w.locationId === currentLocationId);
    setWorkers(locationWorkers);
  }, [currentLocationId, isInitialLoad, locations]);

  // Handle Pane Resizing
  useEffect(() => {
    if (!paneDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      const delta = e.clientX - paneDrag.startX;
      const newWidth = Math.max(200, Math.min(800, paneDrag.startWidth + delta));
      setLeftPaneWidth(newWidth);
    };

    const handlePointerUp = () => {
      setPaneDrag(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [paneDrag]);

  // Handle Dragging and Resizing via window events
  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: PointerEvent) => {
      const deltaX = e.clientX - dragState.startX;
      const deltaDays = Math.round(deltaX / CELL_WIDTH);
      setDragState(prev => prev ? { ...prev, deltaDays } : null);
    };

    const handleUp = () => {
      const taskToUpdate = tasks.find(t => t.id === dragState.taskId);
      if (taskToUpdate && dragState.deltaDays !== 0) {
        let newStart = parseISO(taskToUpdate.startDate);
        let newEnd = parseISO(taskToUpdate.deadline);
        let newDuration = taskToUpdate.duration || 1;

        if (dragState.type === 'move') {
          newStart = addDays(newStart, dragState.deltaDays);
          if (newStart.getDay() === 0) newStart = addDays(newStart, 1);
          newEnd = addWorkingDays(newStart, newDuration);
        } else if (dragState.type === 'resize') {
          newEnd = addDays(newEnd, dragState.deltaDays);
          if (!isBefore(newEnd, newStart)) {
            newDuration = getWorkingDaysCount(newStart, newEnd);
            if (newDuration >= 1) {
              newEnd = addWorkingDays(newStart, newDuration);
            } else {
              newDuration = taskToUpdate.duration || 1;
              newEnd = parseISO(taskToUpdate.deadline);
            }
          }
        }
        
        const allTasks = loadData<Task[]>('gantt_tasks', []);
        const updatedTasks = allTasks.map(t => 
          t.id === taskToUpdate.id 
            ? { ...t, startDate: newStart.toISOString(), deadline: newEnd.toISOString(), duration: newDuration }
            : t
        );
        saveData('gantt_tasks', updatedTasks);
        setTasks(updatedTasks.filter(t => t.locationId === currentLocationId));
      }
      setDragState(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim() || !newTaskDuration || !currentLocationId) return;

    const duration = Number(newTaskDuration);
    if (duration < 1) return;

    const today = startOfDay(new Date());
    let startDateObj = today;
    if (startDateObj.getDay() === 0) {
      startDateObj = addDays(startDateObj, 1);
    }
    const startDate = startDateObj.toISOString();
    const deadlineDate = addWorkingDays(startDateObj, duration).toISOString();

    const newTaskId = crypto.randomUUID();
    const newTask: Task = {
      id: newTaskId,
      name: newTaskName.trim(),
      createdAt: new Date().toISOString(),
      startDate: startDate,
      deadline: deadlineDate,
      duration: duration,
      status: 'pending',
      workerId: newTaskWorkerId || undefined,
      locationId: currentLocationId
    };

    const allTasks = loadData<Task[]>('gantt_tasks', []);
    allTasks.push(newTask);
    saveData('gantt_tasks', allTasks);
    setTasks(prev => [...prev, newTask]);
    setNewTaskName('');
  };

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim() || !currentLocationId) return;
    
    const newWorkerId = crypto.randomUUID();
    const newWorker: Worker = {
      id: newWorkerId,
      name: newWorkerName.trim(),
      color: newWorkerColor,
      locationId: currentLocationId
    };
    
    const allWorkers = loadData<Worker[]>('gantt_workers', []);
    allWorkers.push(newWorker);
    saveData('gantt_workers', allWorkers);
    setWorkers(prev => [...prev, newWorker]);
    setNewWorkerName('');
    setIsWorkerModalOpen(false);
  };

  const handleDeleteWorker = async (id: string) => {
    const allWorkers = loadData<Worker[]>('gantt_workers', []);
    const updatedWorkers = allWorkers.filter(w => w.id !== id);
    saveData('gantt_workers', updatedWorkers);
    setWorkers(updatedWorkers.filter(w => w.locationId === currentLocationId));

    const allTasks = loadData<Task[]>('gantt_tasks', []);
    const updatedTasks = allTasks.map(t => t.workerId === id ? { ...t, workerId: undefined } : t);
    saveData('gantt_tasks', updatedTasks);
    setTasks(updatedTasks.filter(t => t.locationId === currentLocationId));
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;
    
    const newLocId = crypto.randomUUID();
    const newLoc: Location = {
      id: newLocId,
      name: newLocationName.trim(),
    };
    
    const allLocations = loadData<Location[]>('gantt_locations', []);
    allLocations.push(newLoc);
    saveData('gantt_locations', allLocations);
    setLocations(allLocations);
    setCurrentLocationId(newLocId);
    setNewLocationName('');
    setIsLocationModalOpen(false);
  };

  const toggleTaskStatus = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      const allTasks = loadData<Task[]>('gantt_tasks', []);
      const updatedTasks = allTasks.map(t => 
        t.id === id ? { ...t, status: t.status === 'pending' ? 'completed' : 'pending' } : t
      );
      saveData('gantt_tasks', updatedTasks);
      setTasks(updatedTasks.filter(t => t.locationId === currentLocationId));
    }
  };

  const deleteTask = async (id: string) => {
    const allTasks = loadData<Task[]>('gantt_tasks', []);
    const updatedTasks = allTasks.filter(t => t.id !== id);
    saveData('gantt_tasks', updatedTasks);
    setTasks(updatedTasks.filter(t => t.locationId === currentLocationId));
  };

  const extendProjectEndDate = async () => {
    const newEndDate = format(addDays(parseISO(projectEndDate), 30), 'yyyy-MM-dd');
    setProjectEndDate(newEndDate);
    if (currentLocationId) {
      const allLocations = loadData<Location[]>('gantt_locations', []);
      const updatedLocations = allLocations.map(l => 
        l.id === currentLocationId ? { ...l, projectEndDate: newEndDate } : l
      );
      saveData('gantt_locations', updatedLocations);
      setLocations(updatedLocations);
    }
  };

  // Calculate timeline range
  const timelineStart = useMemo(() => {
    if (tasks.length === 0) return startOfDay(new Date());
    const minDate = min(tasks.map(t => parseISO(t.startDate)));
    return min([minDate, startOfDay(new Date())]);
  }, [tasks]);

  const timelineRange = useMemo(() => {
    const end = parseISO(projectEndDate);
    const safeEnd = isBefore(end, timelineStart) ? addDays(timelineStart, 30) : end;
    return eachDayOfInterval({ start: timelineStart, end: safeEnd });
  }, [timelineStart, projectEndDate]);

  // Group days by month for the header
  const months = useMemo(() => {
    const grouped: { monthStr: string; daysCount: number }[] = [];
    let currentMonth = '';
    let count = 0;
    
    timelineRange.forEach(day => {
      const m = format(day, 'MMMM yyyy', { locale: localeId });
      if (m !== currentMonth) {
        if (currentMonth) {
          grouped.push({ monthStr: currentMonth, daysCount: count });
        }
        currentMonth = m;
        count = 1;
      } else {
        count++;
      }
    });
    if (currentMonth) {
      grouped.push({ monthStr: currentMonth, daysCount: count });
    }
    return grouped;
  }, [timelineRange]);

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const pendingCount = tasks.length - completedCount;

  return (
    <div className="h-screen w-full bg-gray-50 text-gray-900 font-sans flex flex-col overflow-hidden print-expand">
      
      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden p-4 space-y-4 print-expand">
        
        {/* Header Section */}
        <header className="relative bg-gradient-to-br from-[#107c41] via-[#148f4d] to-[#0a522a] rounded-xl shadow-md border-b border-[#185c37] p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 text-white overflow-hidden">
          {/* Watermark */}
          <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none">
            <FolderKanban className="w-48 h-48" />
          </div>
          
          <div className="relative z-10 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Calendar className="w-7 h-7 text-green-100" />
                Renovki Action Plan
              </h1>
              <div className="h-6 w-px bg-white/30 mx-2 hidden md:block"></div>
              <div className="flex items-center gap-2 bg-white/10 p-1.5 rounded-lg border border-white/20 print:hidden">
                <MapPin className="w-4 h-4 text-green-100 ml-1" />
                <select 
                  value={currentLocationId}
                  onChange={(e) => setCurrentLocationId(e.target.value)}
                  className="bg-transparent border-none text-sm font-semibold text-white focus:ring-0 cursor-pointer outline-none [&>option]:text-gray-800"
                >
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
                <button 
                  onClick={() => setIsLocationModalOpen(true)}
                  className="p-1.5 bg-white/20 rounded-md shadow-sm hover:bg-white/30 text-white transition-colors"
                  title="Tambah Lokasi Baru"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1 print:hidden">
              <label htmlFor="projectEnd" className="text-sm font-semibold text-green-50">
                Batas Akhir Proyek (Scroll):
              </label>
              <input
                id="projectEnd"
                type="date"
                value={projectEndDate}
                onChange={(e) => setProjectEndDate(e.target.value)}
                className="px-2 py-1 text-sm rounded border border-[#185c37] focus:outline-none focus:ring-2 focus:ring-white bg-[#0c5e31] text-white font-medium color-scheme-dark"
                style={{ colorScheme: 'dark' }}
              />
              <button 
                onClick={extendProjectEndDate}
                className="px-2 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20 font-medium transition-colors border border-white/20"
                title="Tambah 30 hari ke batas scroll"
              >
                + 30 Hari
              </button>
              <div className="w-px h-4 bg-white/30 mx-1"></div>
              <button 
                onClick={toggleDayFormat}
                className="px-2 py-1 text-xs bg-white/10 text-white rounded hover:bg-white/20 font-medium transition-colors flex items-center gap-1 border border-white/20"
                title="Ubah format nama hari"
              >
                Hari: {formatLabel}
              </button>
            </div>
          </div>
          
          <div className="relative z-10 flex gap-3 items-center">
            <button 
              onClick={() => window.print()} 
              className="print:hidden p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white flex items-center gap-2 text-sm font-semibold border border-white/20 shadow-sm mr-2 h-[52px]"
              title="Cetak ke PDF"
            >
              <Printer className="w-5 h-5" />
              <span className="hidden sm:inline">Cetak PDF</span>
            </button>
            <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/20 flex flex-col items-center min-w-[90px]">
              <span className="text-xl font-bold text-white">{tasks.length}</span>
              <span className="text-[10px] font-bold text-green-100 uppercase tracking-wider">Total</span>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/20 flex flex-col items-center min-w-[90px]">
              <span className="text-xl font-bold text-white">{completedCount}</span>
              <span className="text-[10px] font-bold text-green-100 uppercase tracking-wider">Selesai</span>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-lg border border-white/20 flex flex-col items-center min-w-[90px]">
              <span className="text-xl font-bold text-white">{pendingCount}</span>
              <span className="text-[10px] font-bold text-green-100 uppercase tracking-wider">Tertunda</span>
            </div>
          </div>
        </header>

        {/* Forms Section */}
        <div className="flex flex-col xl:flex-row gap-4 shrink-0 print:hidden">
          {/* Add Task Form */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex-1">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Plus className="w-4 h-4"/> Tambah Pekerjaan</h3>
            <form onSubmit={handleAddTask} className="flex flex-col md:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label htmlFor="taskName" className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Nama Pekerjaan</label>
                <input
                  id="taskName"
                  type="text"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="misal: Pekerjaan Pondasi"
                  className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#107c41] focus:border-[#107c41] bg-white"
                  required
                />
              </div>
              <div className="w-full md:w-32">
                <label htmlFor="duration" className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Durasi (Hari)</label>
                <input
                  id="duration"
                  type="number"
                  min="1"
                  value={newTaskDuration}
                  onChange={(e) => setNewTaskDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#107c41] focus:border-[#107c41] bg-white"
                  required
                />
              </div>
              <div className="w-full md:w-40 flex flex-col">
                <label htmlFor="workerId" className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Tukang</label>
                <div className="flex gap-2">
                  <select
                    id="workerId"
                    value={newTaskWorkerId}
                    onChange={(e) => setNewTaskWorkerId(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#107c41] focus:border-[#107c41] bg-white"
                  >
                    <option value="">-- Pilih --</option>
                    {workers.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsWorkerModalOpen(true)}
                    className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md border border-gray-300 transition-colors shrink-0"
                    title="Tambah Tukang Baru"
                  >
                    <UserPlus className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className="w-full md:w-auto px-5 py-2 bg-[#107c41] hover:bg-[#185c37] text-white text-sm font-semibold rounded-md shadow-sm transition-colors flex items-center justify-center gap-2 h-[38px]"
              >
                Tambah
              </button>
            </form>
          </section>

          {/* Workers List Display */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 w-full xl:w-1/4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><UserPlus className="w-4 h-4"/> Daftar Tukang</h3>
              <button 
                onClick={() => setIsWorkerModalOpen(true)}
                className="text-xs font-semibold text-[#107c41] hover:underline"
              >
                + Tambah
              </button>
            </div>
            {workers.length > 0 ? (
              <div className="flex flex-wrap gap-2 max-h-[80px] overflow-y-auto custom-scrollbar pr-1">
                {workers.map(w => (
                  <span 
                    key={w.id} 
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('workerId', w.id);
                      e.dataTransfer.effectAllowed = 'copy';
                      setDraggedWorkerId(w.id);
                    }}
                    onDragEnd={() => {
                      setDraggedWorkerId(null);
                      setDragOverTaskId(null);
                    }}
                    className="text-xs px-2 py-1 rounded-none border flex items-center gap-1.5 font-medium cursor-grab active:cursor-grabbing group/worker" 
                    style={{ borderColor: w.color, backgroundColor: `${w.color}15`, color: '#374151' }}
                    title="Tarik ke pekerjaan untuk menugaskan"
                  >
                    <div className="w-2.5 h-2.5 rounded-none shadow-sm" style={{ backgroundColor: w.color }}></div>
                    {w.name}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorker(w.id);
                      }}
                      className="ml-1 text-gray-400 hover:text-red-500 opacity-0 group-hover/worker:opacity-100 transition-opacity"
                      title="Hapus Tukang"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Belum ada tukang terdaftar</p>
            )}
          </section>
        </div>

        {/* Gantt Chart Area */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col min-h-[400px] relative print-expand print-table-container">
          
          {/* Single Scrollable Container */}
          <div className="flex-1 overflow-auto custom-scrollbar flex flex-col relative bg-white print-expand">
            <div className="w-max min-w-full flex flex-col min-h-full">
              
              {/* Header Row (Sticky Top) */}
              <div className="flex sticky top-0 z-40 bg-white shadow-sm h-16">
                
                {/* Left Header (Sticky Left & Top) */}
                <div 
                  className="flex-shrink-0 border-r border-b border-gray-300 bg-[#f3f2f1] flex items-center px-4 font-semibold text-gray-700 text-sm sticky left-0 z-50"
                  style={{ width: leftPaneWidth }}
                >
                  <div className="flex-1 truncate">Daftar Pekerjaan</div>
                  {/* Resizer Handle */}
                  <div 
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#107c41] active:bg-[#107c41] transition-colors z-50 print-hide"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setPaneDrag({ startX: e.clientX, startWidth: leftPaneWidth });
                    }}
                  />
                </div>

                {/* Right Header (Sticky Top) */}
                <div className="flex flex-col flex-1">
                  {/* Months Row */}
                  <div className="flex border-b border-gray-300 bg-[#f3f2f1] h-6 items-center">
                    {months.map((m, i) => (
                      <div 
                        key={i} 
                        className="flex-shrink-0 border-r border-gray-300 text-center text-[10px] font-bold text-gray-600" 
                        style={{ width: m.daysCount * CELL_WIDTH }}
                      >
                        {m.monthStr}
                      </div>
                    ))}
                  </div>
                  {/* Days Row */}
                  <div className="h-10 border-b border-gray-300 bg-white flex">
                    {timelineRange.map((day, i) => {
                      const isToday = isSameDay(day, new Date());
                      const isSunday = day.getDay() === 0;
                      return (
                        <div 
                          key={i} 
                          className={`flex-shrink-0 border-r border-gray-200 flex flex-col items-center justify-center ${isSunday ? 'bg-gray-100' : isToday ? 'bg-[#e6f2eb]' : ''}`}
                          style={{ width: CELL_WIDTH }}
                        >
                          <span className={`text-[11px] font-bold leading-none mb-0.5 ${isSunday ? 'text-red-600' : isToday ? 'text-[#107c41]' : 'text-gray-700'}`}>
                            {format(day, 'd')}
                          </span>
                          <span className={`text-[9px] uppercase tracking-tighter truncate w-full text-center px-0.5 leading-none ${isSunday ? 'text-red-500' : isToday ? 'text-[#107c41]' : 'text-gray-500'}`}>
                            {format(day, dayNameFormat, { locale: localeId })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Body Rows */}
              <div className="flex flex-col relative flex-1">
                
                {/* Background Grid */}
                <div className="absolute top-0 bottom-0 flex pointer-events-none z-0" style={{ left: leftPaneWidth }}>
                  {timelineRange.map((day, i) => {
                    const isSunday = day.getDay() === 0;
                    const isToday = isSameDay(day, new Date());
                    return (
                      <div 
                        key={`grid-${i}`} 
                        className={`flex-shrink-0 border-r border-gray-100 h-full ${isSunday ? 'bg-gray-50/50' : isToday ? 'bg-[#e6f2eb]/50' : ''}`}
                        style={{ width: CELL_WIDTH }}
                      >
                        {isSunday && (
                          <div className="w-full h-full flex items-center justify-center opacity-30">
                            <div className="w-px h-full bg-gray-300 border-l border-dashed border-gray-400"></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Empty State */}
                {tasks.length === 0 && (
                  <div className="flex h-32 items-center justify-center sticky left-0 w-full z-10">
                    <div className="text-sm text-gray-400">Belum ada pekerjaan yang ditambahkan.</div>
                  </div>
                )}

                {/* Task Rows */}
                {tasks.map((task) => {
                  const isDragging = dragState?.taskId === task.id && dragState.type === 'move';
                  const isResizing = dragState?.taskId === task.id && dragState.type === 'resize';
                  const deltaDays = (isDragging || isResizing) ? dragState.deltaDays : 0;
                  
                  let taskStart = parseISO(task.startDate);
                  let taskEnd = parseISO(task.deadline);
                  
                  if (isDragging) {
                    taskStart = addDays(taskStart, deltaDays);
                    if (taskStart.getDay() === 0) taskStart = addDays(taskStart, 1);
                    taskEnd = addWorkingDays(taskStart, task.duration || 1);
                  } else if (isResizing) {
                    let tempEnd = addDays(taskEnd, deltaDays);
                    if (isBefore(tempEnd, taskStart)) tempEnd = taskStart;
                    const tempDuration = getWorkingDaysCount(taskStart, tempEnd);
                    taskEnd = addWorkingDays(taskStart, Math.max(1, tempDuration));
                  }
                  
                  const safeTaskEnd = isBefore(taskEnd, taskStart) ? taskStart : taskEnd;
                  const startIndex = differenceInDays(taskStart, timelineStart);
                  const leftOffset = startIndex * CELL_WIDTH;
                  const durationDays = differenceInDays(safeTaskEnd, taskStart) + 1;
                  const width = durationDays * CELL_WIDTH;

                  const isCompleted = task.status === 'completed';
                  const isOverdue = isBefore(safeTaskEnd, startOfDay(new Date())) && !isCompleted;

                  const isDragOver = dragOverTaskId === task.id;
                  const activeWorkerId = isDragOver && draggedWorkerId ? draggedWorkerId : task.workerId;
                  const worker = workers.find(w => w.id === activeWorkerId);

                  let barColorClass = 'text-white';
                  let barStyle: React.CSSProperties = {
                    left: `${leftOffset + 4}px`, 
                    width: `${width - 8}px`,
                    minWidth: '24px',
                    touchAction: 'none',
                    transitionProperty: (isDragging || isResizing) ? 'none' : 'left, width, background-color',
                    transitionDuration: '200ms'
                  };

                  if (worker) {
                    barStyle.backgroundColor = worker.color;
                    barStyle.borderColor = worker.color;
                    if (isCompleted && !isDragOver) {
                      barStyle.opacity = 0.5;
                    }
                    if (isDragOver) {
                      barStyle.filter = 'brightness(1.1)';
                      barStyle.boxShadow = `0 0 0 2px ${worker.color}40`;
                    } else if (isDragging || isResizing) {
                      barStyle.boxShadow = `0 0 0 2px ${worker.color}`;
                    }
                  } else if (isCompleted) {
                    barColorClass += ' bg-[#107c41]/40 border-[#107c41]/50 text-white/90';
                    if (isDragging || isResizing) barStyle.boxShadow = `0 0 0 2px #107c41`;
                  } else if (isOverdue) {
                    barColorClass += ' bg-red-500 border-red-600';
                    if (isDragging || isResizing) barStyle.boxShadow = `0 0 0 2px #ef4444`;
                  } else {
                    barColorClass += ' bg-[#107c41] border-[#185c37]';
                    if (isDragging || isResizing) barStyle.boxShadow = `0 0 0 2px #107c41`;
                  }

                  return (
                    <div 
                      key={task.id} 
                      className={`flex h-12 border-b border-gray-200 group hover:bg-gray-50/50 transition-colors z-10 ${isDragOver ? 'bg-gray-50' : ''}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move'; // Allow both copy and move
                        if (draggedWorkerId && dragOverTaskId !== task.id) {
                          setDragOverTaskId(task.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverTaskId === task.id) {
                          setDragOverTaskId(null);
                        }
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setDragOverTaskId(null);
                        
                        const droppedWorkerId = e.dataTransfer.getData('workerId');
                        const reorderTaskId = e.dataTransfer.getData('reorderTaskId');
                        
                        if (droppedWorkerId) {
                          const allTasks = loadData<Task[]>('gantt_tasks', []);
                          const updatedTasks = allTasks.map(t => 
                            t.id === task.id ? { ...t, workerId: droppedWorkerId } : t
                          );
                          saveData('gantt_tasks', updatedTasks);
                          setTasks(updatedTasks.filter(t => t.locationId === currentLocationId));
                        } else if (reorderTaskId && reorderTaskId !== task.id) {
                          const draggedIndex = tasks.findIndex(t => t.id === reorderTaskId);
                          const targetIndex = tasks.findIndex(t => t.id === task.id);
                          if (draggedIndex !== -1 && targetIndex !== -1) {
                            // Simple reorder by swapping createdAt
                            const draggedTask = tasks[draggedIndex];
                            const targetTask = tasks[targetIndex];
                            
                            const allTasks = loadData<Task[]>('gantt_tasks', []);
                            const updatedTasks = allTasks.map(t => {
                              if (t.id === draggedTask.id) return { ...t, createdAt: targetTask.createdAt };
                              if (t.id === targetTask.id) return { ...t, createdAt: draggedTask.createdAt };
                              return t;
                            });
                            
                            // Re-sort location tasks before setting state
                            const locationTasks = updatedTasks.filter(t => t.locationId === currentLocationId);
                            locationTasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                            
                            saveData('gantt_tasks', updatedTasks);
                            setTasks(locationTasks);
                          }
                        }
                      }}
                    >
                      
                      {/* Left Cell (Sticky Left) */}
                      <div 
                        className="flex-shrink-0 sticky left-0 z-20 bg-white group-hover:bg-gray-50 border-r border-gray-200 flex items-center px-2 transition-colors"
                        style={{ width: leftPaneWidth }}
                      >
                        <div 
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('reorderTaskId', task.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 mr-1 shrink-0"
                          title="Tarik untuk memindah urutan"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <button 
                          onClick={() => toggleTaskStatus(task.id)}
                          className="w-8 focus:outline-none text-gray-400 hover:text-[#107c41] shrink-0"
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-5 h-5 text-[#107c41]" />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </button>
                        <div className="flex-1 truncate pr-2 flex items-center gap-2">
                          <span className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'} truncate`}>
                            {task.name}
                          </span>
                          {worker && (
                            <div 
                              className="w-2.5 h-2.5 rounded-none shadow-sm shrink-0" 
                              style={{ backgroundColor: worker.color }}
                              title={`Tukang: ${worker.name}`}
                            />
                          )}
                        </div>
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all shrink-0 print-hide"
                          title="Hapus Pekerjaan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        
                        {/* Resizer Handle for Row */}
                        <div 
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[#107c41] active:bg-[#107c41] transition-colors z-50 opacity-0 group-hover:opacity-100 print-hide"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setPaneDrag({ startX: e.clientX, startWidth: leftPaneWidth });
                          }}
                        />
                      </div>

                      {/* Right Cell (Task Bar Container) */}
                      <div className="flex-1 relative flex items-center">
                        <div 
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setDragState({
                              taskId: task.id,
                              startX: e.clientX,
                              initialStart: parseISO(task.startDate),
                              initialEnd: parseISO(task.deadline),
                              deltaDays: 0,
                              type: 'move'
                            });
                          }}
                          className={`absolute h-7 rounded-none border shadow-sm flex items-center px-2 overflow-hidden transition-colors hover:brightness-110 cursor-grab active:cursor-grabbing select-none ${barColorClass} ${(isDragging || isResizing) ? 'z-50 shadow-lg brightness-110' : 'z-10'}`}
                          style={barStyle}
                          title={`${task.name} (${format(taskStart, 'd MMM yyyy', { locale: localeId })} - ${format(safeTaskEnd, 'd MMM yyyy', { locale: localeId })})`}
                        >
                          {width > 60 && (
                            <span className="text-xs font-semibold text-white truncate drop-shadow-sm pointer-events-none mr-4">
                              {task.name}
                            </span>
                          )}

                          {/* Resize Handle (Right Edge) */}
                          <div 
                            onPointerDown={(e) => {
                              e.stopPropagation(); // Prevent triggering 'move'
                              e.preventDefault();
                              setDragState({
                                taskId: task.id,
                                startX: e.clientX,
                                initialStart: parseISO(task.startDate),
                                initialEnd: parseISO(task.deadline),
                                deltaDays: 0,
                                type: 'resize'
                              });
                            }}
                            className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize flex items-center justify-center rounded-none transition-colors border-l border-white/20 hover:brightness-110 print-hide"
                            style={{ backgroundColor: worker ? worker.color : 'rgba(0,0,0,0.2)' }}
                            title={worker ? `Tukang: ${worker.name} - Tarik untuk mengubah durasi` : "Tarik untuk mengubah durasi"}
                          >
                            <div className="w-1 h-3 bg-white/70 rounded-none pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </main>
      
      {/* Worker Modal */}
      {isWorkerModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-[#107c41] p-4 flex justify-between items-center text-white">
              <h3 className="font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Tambah Tukang Baru
              </h3>
              <button 
                onClick={() => setIsWorkerModalOpen(false)}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleAddWorker} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nama Tukang</label>
                  <input
                    type="text"
                    value={newWorkerName}
                    onChange={(e) => setNewWorkerName(e.target.value)}
                    placeholder="Masukkan nama tukang..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#107c41] focus:border-transparent transition-all"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Warna Identitas</label>
                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      value={newWorkerColor}
                      onChange={(e) => setNewWorkerColor(e.target.value)}
                      className="w-16 h-16 p-1 rounded-xl border border-gray-200 cursor-pointer bg-white"
                    />
                    <div className="flex-1 text-sm text-gray-500">
                      Warna ini akan muncul di ujung bar pekerjaan sebagai penanda tukang tersebut.
                    </div>
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsWorkerModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-[#107c41] text-white font-bold rounded-xl hover:bg-[#185c37] shadow-lg shadow-green-900/20 transition-all active:scale-95"
                  >
                    Simpan Tukang
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-[#107c41] p-4 flex justify-between items-center text-white">
              <h3 className="font-bold flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Tambah Lokasi Baru
              </h3>
              <button 
                onClick={() => setIsLocationModalOpen(false)}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleAddLocation} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nama Lokasi / Proyek</label>
                  <input
                    type="text"
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="Masukkan nama lokasi..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#107c41] focus:border-transparent transition-all"
                    required
                    autoFocus
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsLocationModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-[#107c41] text-white font-bold rounded-xl hover:bg-[#185c37] shadow-lg shadow-green-900/20 transition-all active:scale-95"
                  >
                    Simpan Lokasi
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}

      {/* Custom Scrollbar and Print Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #ecfdf5; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #a7f3d0; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #34d399; 
        }

        @media print {
          body, html {
            background: white !important;
            height: auto !important;
            overflow: visible !important;
          }
          #root {
            height: auto !important;
            overflow: visible !important;
          }
          .h-screen {
            height: auto !important;
          }
          .overflow-hidden {
            overflow: visible !important;
          }
          .custom-scrollbar {
            overflow: visible !important;
          }
          ::-webkit-scrollbar {
            display: none !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          /* Ensure Gantt chart extends for printing */
          .min-h-\\[400px\\] {
            min-height: auto !important;
          }
          /* Make background colors print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />
    </div>
  );
}
