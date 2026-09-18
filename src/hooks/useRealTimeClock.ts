import { useState, useEffect, useRef, useCallback } from 'react';

export interface RealTimeClockState {
  currentDate: Date;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  timeWithSeconds: string; // HH:mm:ss
  dayName: string; // "Jueves"
  dayNumber: string; // "17"
  monthName: string; // "Septiembre"
  fullFormattedDate: string; // "Jueves 17 de Septiembre, 2026"
  minutesIntoDay: number; // 0 - 1439
  dayProgressPercent: number; // 0 - 100
  speed: number; // 1 (real time), 10, 60
  isPaused: boolean;
  setSpeed: (speed: number) => void;
  togglePause: () => void;
  jumpToTime: (hours: number, minutes: number) => void;
  advanceMinutes: (mins: number) => void;
  resetToRealTime: () => void;
}

const SPANISH_DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const SPANISH_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function useRealTimeClock(): RealTimeClockState {
  // Initialize with real current system date & time
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  const [speed, setSpeed] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const lastTickRef = useRef<number>(Date.now());

  // Real-time ticking interval
  useEffect(() => {
    lastTickRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const realElapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      if (!isPaused) {
        if (speed === 1) {
          // Keep synchronized with real live device clock across midnights
          setCurrentDate(new Date());
        } else if (realElapsed > 0) {
          // Multiply elapsed time by simulation speed
          const simulatedDelta = realElapsed * speed;
          setCurrentDate((prev) => new Date(prev.getTime() + simulatedDelta));
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [speed, isPaused]);

  // Jump to specific hour & minute today
  const jumpToTime = useCallback((hours: number, minutes: number) => {
    setCurrentDate((prev) => {
      const updated = new Date(prev);
      updated.setHours(hours, minutes, 0, 0);
      return updated;
    });
  }, []);

  // Advance by N minutes
  const advanceMinutes = useCallback((mins: number) => {
    setCurrentDate((prev) => new Date(prev.getTime() + mins * 60 * 1000));
  }, []);

  // Reset to live real-time
  const resetToRealTime = useCallback(() => {
    setCurrentDate(new Date());
    setSpeed(1);
    setIsPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((p) => !p);
  }, []);

  // Date extractions
  const year = currentDate.getFullYear();
  const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
  const day = currentDate.getDate().toString().padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const hours = currentDate.getHours().toString().padStart(2, '0');
  const minutes = currentDate.getMinutes().toString().padStart(2, '0');
  const seconds = currentDate.getSeconds().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;
  const timeWithSeconds = `${hours}:${minutes}:${seconds}`;

  const dayOfWeekIndex = currentDate.getDay();
  const dayName = SPANISH_DAYS[dayOfWeekIndex];
  const monthName = SPANISH_MONTHS[currentDate.getMonth()];
  const fullFormattedDate = `${dayName} ${currentDate.getDate()} de ${monthName}, ${year}`;

  const minutesIntoDay = currentDate.getHours() * 60 + currentDate.getMinutes();
  const dayProgressPercent = Math.min(100, Math.max(0, Math.round((minutesIntoDay / 1440) * 100)));

  return {
    currentDate,
    dateStr,
    timeStr,
    timeWithSeconds,
    dayName,
    dayNumber: day,
    monthName,
    fullFormattedDate,
    minutesIntoDay,
    dayProgressPercent,
    speed,
    isPaused,
    setSpeed,
    togglePause,
    jumpToTime,
    advanceMinutes,
    resetToRealTime,
  };
}
