import { evento, input, entrega } from './inputs';

export const calendarEvento = (id = 'clase-demo', fields = {}) => evento({
  id: `calendar-fijo:${id}`, titulo: 'Clase inventada', area: 'clase', tipo: 'fijo', bloqueo: true,
  fecha_inicio: '2026-10-06', inicio_local: '13:30', fin_local: '15:30', ...fields,
});
export const calendarInput = () => input({ hasta: '2026-10-11', eventos: [calendarEvento()],
  entregas: [entrega('estudio-demo', { deadline_utc: '2026-10-11T21:00:00Z' })] });
