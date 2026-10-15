import { useState, useEffect, useMemo } from 'react';

export interface RealTimeClockState {
  currentDate: Date;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  dayName: string; // "Jueves"
  dayNumber: string; // "17"
  monthName: string; // "Septiembre"
  fullFormattedDate: string; // "Jueves 17 de Septiembre, 2026"
  minutesIntoDay: number; // 0 - 1439
  dayProgressPercent: number; // 0 - 100
}

const SPANISH_DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const SPANISH_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Timestamp truncated to the current minute: the clock only changes state once per minute
function currentMinute(): number {
  const now = Date.now();
  return now - (now % 60000);
}

export function useRealTimeClock(): RealTimeClockState {
  const [minuteTs, setMinuteTs] = useState<number>(currentMinute);

  // Tick aligned to the start of each minute; paused while the app is hidden
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      if (document.visibilityState === 'hidden') return;
      setMinuteTs(currentMinute());
      const msToNextMinute = 60000 - (Date.now() % 60000) + 50;
      timeoutId = setTimeout(schedule, msToNextMinute);
    };

    schedule();
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('focus', schedule);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('focus', schedule);
    };
  }, []);

  // Stable object identity within the same minute
  return useMemo(() => {
    const currentDate = new Date(minuteTs);
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = currentDate.getDate().toString().padStart(2, '0');
    const hours = currentDate.getHours().toString().padStart(2, '0');
    const minutes = currentDate.getMinutes().toString().padStart(2, '0');
    const dayName = SPANISH_DAYS[currentDate.getDay()];
    const monthName = SPANISH_MONTHS[currentDate.getMonth()];
    const minutesIntoDay = currentDate.getHours() * 60 + currentDate.getMinutes();

    return {
      currentDate,
      dateStr: `${year}-${month}-${day}`,
      timeStr: `${hours}:${minutes}`,
      dayName,
      dayNumber: day,
      monthName,
      fullFormattedDate: `${dayName} ${currentDate.getDate()} de ${monthName}, ${year}`,
      minutesIntoDay,
      dayProgressPercent: Math.min(100, Math.max(0, Math.round((minutesIntoDay / 1440) * 100))),
    };
  }, [minuteTs]);
}
