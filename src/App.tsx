import React, { useState, useEffect, useMemo } from 'react';
import { format, differenceInDays, isBefore, startOfDay, parseISO, eachDayOfInterval, addDays, isSameDay, min, addMonths } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Plus, CheckCircle2, Circle, Trash2, Calendar, Clock, AlertCircle } from 'lucide-react';
import { Task } from './types';

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

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState<number | ''>(7);
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

  // Load tasks from local storage on initial render
  useEffect(() => {
    const savedTasks = localStorage.getItem('tasks');
    if (savedTasks) {
      try {
        setTasks(JSON.parse(savedTasks));
      } catch (e) {
        console.error('Failed to parse tasks from local storage', e);
      }
    }
  }, []);

  // Save tasks to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Handle Dragging and Resizing via window events
  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e: PointerEvent) => {
      const deltaX = e.clientX - dragState.startX;
      const deltaDays = Math.round(deltaX / CELL_WIDTH);
      setDragState(prev => prev ? { ...prev, deltaDays } : null);
    };

    const handleUp = () => {
      setTasks(prevTasks => prevTasks.map(t => {
        if (t.id === dragState.taskId && dragState.deltaDays !== 0) {
          if (dragState.type === 'move') {
            let newStart = addDays(parseISO(t.startDate), dragState.deltaDays);
            if (newStart.getDay() === 0) newStart = addDays(newStart, 1);
            const newEnd = addWorkingDays(newStart, t.duration);
            return { ...t, startDate: newStart.toISOString(), deadline: newEnd.toISOString() };
          } else if (dragState.type === 'resize') {
            const newEnd = addDays(parseISO(t.deadline), dragState.deltaDays);
            if (isBefore(newEnd, parseISO(t.startDate))) return t;
            const newDuration = getWorkingDaysCount(parseISO(t.startDate), newEnd);
            if (newDuration < 1) return t;
            const snappedEnd = addWorkingDays(parseISO(t.startDate), newDuration);
            return { ...t, deadline: snappedEnd.toISOString(), duration: newDuration };
          }
        }
        return t;
      }));
      setDragState(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragState]);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim() || !newTaskDuration) return;

    const duration = Number(newTaskDuration);
    if (duration < 1) return;

    const today = startOfDay(new Date());
    let startDateObj = today;
    if (startDateObj.getDay() === 0) {
      startDateObj = addDays(startDateObj, 1);
    }
    const startDate = startDateObj.toISOString();
    const deadlineDate = addWorkingDays(startDateObj, duration).toISOString();

    const newTask: Task = {
      id: crypto.randomUUID(),
      name: newTaskName.trim(),
      createdAt: today.toISOString(),
      startDate: startDate,
      deadline: deadlineDate,
      duration: duration,
      status: 'pending',
    };

    setTasks([...tasks, newTask]);
    setNewTaskName('');
    // Keep duration as is for easy consecutive adding
  };

  const toggleTaskStatus = (id: string) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, status: task.status === 'pending' ? 'completed' : 'pending' } : task
    ));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  const extendProjectEndDate = () => {
    setProjectEndDate(prev => format(addDays(parseISO(prev), 30), 'yyyy-MM-dd'));
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
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-4 md:p-6 flex flex-col h-screen">
      <div className="max-w-[1600px] mx-auto w-full flex flex-col h-full space-y-4">
        
        {/* Header Section */}
        <header className="bg-[#107c41] rounded-xl shadow-md border-b border-[#185c37] p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 text-white">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-7 h-7 text-green-100" />
              Lini Masa Proyek
            </h1>
            <div className="flex items-center gap-2 mt-1">
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
          
          <div className="flex gap-3">
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

        {/* Add Task Form */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 shrink-0">
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
            <button
              type="submit"
              className="w-full md:w-auto px-5 py-2 bg-[#107c41] hover:bg-[#185c37] text-white text-sm font-semibold rounded-md shadow-sm transition-colors flex items-center justify-center gap-2 h-[38px]"
            >
              <Plus className="w-4 h-4" /> Tambah Pekerjaan
            </button>
          </form>
        </section>

        {/* Gantt Chart Area */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col min-h-[400px]">
          <div className="flex flex-1 overflow-hidden">
            
            {/* Left Pane: Task List */}
            <div className="w-80 flex-shrink-0 border-r border-gray-300 flex flex-col bg-white z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] relative">
              {/* Header */}
              <div className="h-16 border-b border-gray-300 bg-[#f3f2f1] flex items-center px-4 font-semibold text-gray-700 text-sm shrink-0">
                <div className="w-8"></div>
                <div className="flex-1">Daftar Pekerjaan</div>
                <div className="w-8 text-center"></div>
              </div>
              
              {/* Task Rows */}
              <div className="overflow-y-auto flex-1 custom-scrollbar">
                {tasks.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400 text-center mt-10">Belum ada pekerjaan yang ditambahkan.</div>
                ) : (
                  tasks.map(task => (
                    <div key={task.id} className="h-12 border-b border-gray-100 flex items-center px-4 hover:bg-gray-50 transition-colors group">
                      <button 
                        onClick={() => toggleTaskStatus(task.id)}
                        className="w-8 focus:outline-none text-gray-400 hover:text-[#107c41]"
                      >
                        {task.status === 'completed' ? (
                          <CheckCircle2 className="w-5 h-5 text-[#107c41]" />
                        ) : (
                          <Circle className="w-5 h-5" />
                        )}
                      </button>
                      <div className="flex-1 truncate pr-2">
                        <span className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                          {task.name}
                        </span>
                      </div>
                      <button 
                        onClick={() => deleteTask(task.id)}
                        className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                        title="Hapus Pekerjaan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Pane: Timeline */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden flex flex-col custom-scrollbar relative bg-white">
              <div className="flex flex-col h-full w-max min-w-full">
                {/* Timeline Header */}
                <div className="flex flex-col shrink-0 sticky top-0 z-10 bg-white shadow-sm h-16">
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

                {/* Timeline Grid & Bars */}
                <div className="flex-1 overflow-y-auto relative custom-scrollbar">
                  {/* Background Grid */}
                  <div className="absolute inset-0 flex pointer-events-none">
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

                {/* Task Bars */}
                <div className="relative">
                  {tasks.map((task) => {
                    const isDragging = dragState?.taskId === task.id && dragState.type === 'move';
                    const isResizing = dragState?.taskId === task.id && dragState.type === 'resize';
                    const deltaDays = (isDragging || isResizing) ? dragState.deltaDays : 0;
                    
                    let taskStart = parseISO(task.startDate);
                    let taskEnd = parseISO(task.deadline);
                    
                    if (isDragging) {
                      taskStart = addDays(taskStart, deltaDays);
                      if (taskStart.getDay() === 0) taskStart = addDays(taskStart, 1);
                      taskEnd = addWorkingDays(taskStart, task.duration);
                    } else if (isResizing) {
                      let tempEnd = addDays(taskEnd, deltaDays);
                      if (isBefore(tempEnd, taskStart)) tempEnd = taskStart;
                      const tempDuration = getWorkingDaysCount(taskStart, tempEnd);
                      taskEnd = addWorkingDays(taskStart, Math.max(1, tempDuration));
                    }
                    
                    // Prevent visual resizing past start date
                    const safeTaskEnd = isBefore(taskEnd, taskStart) ? taskStart : taskEnd;
                    
                    const startIndex = differenceInDays(taskStart, timelineStart);
                    const leftOffset = startIndex * CELL_WIDTH;
                    
                    const durationDays = differenceInDays(safeTaskEnd, taskStart) + 1;
                    const width = durationDays * CELL_WIDTH;

                    const isCompleted = task.status === 'completed';
                    const isOverdue = isBefore(safeTaskEnd, startOfDay(new Date())) && !isCompleted;

                    let barColor = 'bg-[#107c41] border-[#185c37] text-white';
                    if (isCompleted) barColor = 'bg-[#107c41]/40 border-[#107c41]/50 text-white/90';
                    else if (isOverdue) barColor = 'bg-red-500 border-red-600 text-white';

                    return (
                      <div 
                        key={`bar-${task.id}`} 
                        className="h-12 border-b border-gray-100/50 relative flex items-center"
                      >
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
                          className={`absolute h-7 rounded-sm border shadow-sm flex items-center px-2 overflow-hidden transition-colors hover:brightness-110 cursor-grab active:cursor-grabbing select-none ${barColor} ${(isDragging || isResizing) ? 'z-50 shadow-lg brightness-110 ring-2 ring-[#107c41]' : 'z-10'}`}
                          style={{ 
                            left: `${leftOffset + 4}px`, 
                            width: `${width - 8}px`,
                            minWidth: '24px',
                            touchAction: 'none',
                            transitionProperty: (isDragging || isResizing) ? 'none' : 'left, width',
                            transitionDuration: '200ms'
                          }}
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
                            className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize hover:bg-black/20 flex items-center justify-center rounded-r-md transition-colors"
                            title="Tarik untuk mengubah durasi"
                          >
                            <div className="w-1 h-3 bg-white/70 rounded-full pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
            </div>
            
          </div>
        </section>
      </div>
      
      {/* Custom Scrollbar Styles */}
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
      `}} />
    </div>
  );
}
