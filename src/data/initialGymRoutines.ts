import { GymRoutine } from '../types';

// Fase 2: Potencia y Transferencia (Método de Contrastes - PAP), de cara al campeonato del 12 de diciembre
export const GYM_ROUTINES_UPDATED_AT = '2026-11-01';

export const CONTRAST_RULE =
  'REGLA GENERAL PARA BLOQUES DE CONTRASTE (A1 + A2): Hacer serie pesada (A1) -> Descansar solo 20-30 segundos -> Hacer ejercicio explosivo (A2) al 100% de velocidad -> Descansar 2.5 a 3 minutos completos antes de repetir la siguiente serie del bloque.';

export const INITIAL_GYM_ROUTINES: GymRoutine[] = [
  {
    id: 'routine-lunes-pierna-cadera-golpeo',
    title: 'LUNES: Contraste de Pierna (Arranque y Patada) + Capacidad Láctica',
    subtitle: 'Fase 2 · Contraste A1+A2 de pierna, cadera explosiva y capacidad láctica',
    targetDays: ['Lunes'],
    estimatedMinutes: 65,
    focus: 'Contraste de Pierna (Arranque y Patada) + Capacidad Láctica',
    warmup: [
      'Calentamiento y Aproximaciones - 15 min',
      'Movilidad rápida (5 min): 10 sentadillas profundas abriendo cadera, 10 balanceos de pierna/lado, 10 puentes de glúteo.',
      'Series de aproximación Sentadilla (subir rápido sin fatigar): Barra vacía (20kg) x 8 -> 60kg x 5 -> 85kg x 3 -> 105kg x 1 rep rápida + 2 saltos verticales al 70% (Descansar 2 min antes de la 1ª serie efectiva de 115-120kg).',
      'Aproximaciones resto de ejercicios: En Hip Thrust hacer 1x5 con 50kg antes de los 80kg; en Rotación Landmine hacer 1x4/lado con barra vacía antes de cargar discos.',
    ],
    updatedAt: GYM_ROUTINES_UPDATED_AT,
    exercises: [
      {
        id: 'ex-lun-1',
        name: 'A1. Sentadilla Trasera con Barra',
        muscleGroup: 'Cuádriceps, glúteos y fuerza máxima de tren inferior (Contraste A1)',
        setsReps: '4 series x 3 reps',
        weight: '115 - 120 kg',
        transfer: 'Potenciación post-activación (PAP) para el arranque y la patada.',
        execution: 'Bajada controlada 2s, subida explosiva. Descansar 20-30s y pasar a A2.',
        completedSets: [false, false, false, false],
        restSeconds: 25,
      },
      {
        id: 'ex-lun-2',
        name: 'A2. Saltos Verticales / al Cajón',
        muscleGroup: 'Potencia reactiva de tren inferior (Contraste A2)',
        setsReps: '4 series x 4 saltos',
        weight: 'Peso corporal',
        transfer: 'Convierte la fuerza de la sentadilla en velocidad de arranque.',
        execution: 'Máxima altura, aterrizaje suave. Descansar 3 min tras terminar.',
        completedSets: [false, false, false, false],
        restSeconds: 180,
      },
      {
        id: 'ex-lun-3',
        name: 'B. Hip Thrust con Barra (o Swing con Mancuerna)',
        muscleGroup: 'Glúteo mayor y extensión explosiva de cadera',
        setsReps: '3 series x 5 reps explosivas (opción Hip Thrust)',
        weight: '80 kg totales en Semana 1 (subir a 90-100 kg en Semana 2 si va rápido)',
        transfer: 'Extensión de cadera rápida para la patada y el empuje.',
        execution: 'Opción Hip Thrust: bloqueo de 1s arriba.',
        completedSets: [false, false, false],
        restSeconds: 90,
      },
      {
        id: 'ex-lun-4',
        name: 'C. Rotación Explosiva en Landmine (Arco a 2 manos)',
        muscleGroup: 'Core rotacional, cadera y pies',
        setsReps: '3 series x 5 reps por lado (10 totales)',
        weight: '10 - 15 kg en discos en la punta',
        transfer: 'Giro de cadera para Mawashi Geri y golpeo.',
        execution: 'Giro violento de cadera y pies, frenando en seco.',
        completedSets: [false, false, false],
        restSeconds: 90,
      },
      {
        id: 'ex-lun-5',
        name: 'D. Bici Estática (Capacidad Láctica)',
        muscleGroup: 'Capacidad anaeróbica láctica',
        setsReps: '8 rondas de [30s sprint sentado + 60s pedaleo suave]',
        weight: 'Sprint a resistencia nivel 7-8/10 · Suave a nivel 2-3/10',
        transfer: 'Aguantar el ácido láctico durante los combates.',
        execution: '30s sprint sentado a resistencia nivel 7-8/10 + 60s pedaleo suave a nivel 2-3/10.',
        notes:
          'NOTA OBLIGATORIA: Beber agua con electrolitos durante la sesión y hacer 4 minutos de enfriamiento a nivel 1 al terminar para evitar mareos por caída de tensión.',
        completedSets: [false, false, false, false, false, false, false, false],
        restSeconds: 60,
      },
    ],
  },
  {
    id: 'routine-miercoles-torso-cuello',
    title: 'MIÉRCOLES: Contraste de Empuje (Pegada de Puño) + Cuello',
    subtitle: 'Fase 2 · Contraste A1+A2 de empuje, tracción, hombro y blindaje cervical',
    targetDays: ['Miércoles'],
    estimatedMinutes: 55,
    focus: 'Contraste de Empuje (Pegada de Puño) + Cuello',
    warmup: [
      'Calentamiento y Aproximaciones - 14 min',
      'Movilidad hombros (5 min): 15 dislocaciones con goma, 15 band pull-aparts, 10 rotaciones externas de manguito, 8 flexiones explosivas.',
      'Series de aproximación Press Banca: Barra vacía (20kg) x 10 -> 40kg x 5 -> 52.5kg x 3 -> 60kg x 1 rep rápida + 2 golpes/mano en Landmine con barra vacía (Descansar 2 min antes de los 65kg).',
      'Aproximaciones resto de ejercicios: En Jalón hacer 1x6 con 40kg (o 8 retracciones escapulares colgado); en Press Militar hacer 1x5 con barra vacía (20kg).',
    ],
    updatedAt: GYM_ROUTINES_UPDATED_AT,
    exercises: [
      {
        id: 'ex-mie-1',
        name: 'A1. Press de Banca con Barra',
        muscleGroup: 'Pectoral, tríceps y deltoides anterior (Contraste A1)',
        setsReps: '4 series x 3 reps',
        weight: '65 kg',
        transfer: 'Potenciación post-activación (PAP) para la pegada de puño.',
        execution: 'Controlar bajada, empuje a máxima velocidad. Descansar 20-30s y pasar a A2.',
        completedSets: [false, false, false, false],
        restSeconds: 25,
      },
      {
        id: 'ex-mie-2',
        name: 'A2. Landmine Punch Explosivo (Estilo Tsuki a 1 mano)',
        muscleGroup: 'Cadena cinética del golpeo (Contraste A2)',
        setsReps: '4 series x 4 golpes por brazo',
        weight: '10 - 12.5 kg en discos en la punta',
        transfer: 'Velocidad de latigazo del Tsuki desde la cadera.',
        execution:
          'Si el brazo va lento, bajar peso; priorizar velocidad de latigazo desde la cadera. Descansar 2.5 - 3 min.',
        completedSets: [false, false, false, false],
        restSeconds: 165,
      },
      {
        id: 'ex-mie-3',
        name: 'B. Dominadas Estrictas o Jalón al Pecho',
        muscleGroup: 'Dorsal ancho y estabilizadores escapulares',
        setsReps: '4 series x 6 reps',
        weight: 'Corporal en dominadas (~70-71 kg) o 60 - 65 kg en placas de jalón',
        transfer: 'Tracción compensatoria y retorno rápido del puño.',
        execution: 'Subida explosiva, aguantar 1s y bajada en 2s.',
        completedSets: [false, false, false, false],
        restSeconds: 90,
      },
      {
        id: 'ex-mie-4',
        name: 'C. Press Militar de Pie con Barra',
        muscleGroup: 'Deltoides, trapecio y estabilidad de pie',
        setsReps: '3 series x 5 reps',
        weight: '35 - 37.5 kg totales',
        transfer: 'Hombros fuertes para mantener la guardia alta.',
        execution: 'Core y glúteo apretados para proteger lumbares.',
        completedSets: [false, false, false],
        restSeconds: 90,
      },
      {
        id: 'ex-mie-5',
        name: 'D. Blindaje Cervical Isométrico Manual',
        muscleGroup: 'Musculatura cervical',
        setsReps: '3 series x 10 segundos por lado (frente, nuca, izquierda, derecha)',
        weight: 'Empujando contra tus propias manos',
        transfer: 'Cuello preparado para absorber impactos.',
        execution: 'Progresando del 50% al 85% de fuerza sin mover el cuello.',
        completedSets: [false, false, false],
        restSeconds: 60,
      },
    ],
  },
  {
    id: 'routine-viernes-sabado-hibrido-core',
    title: 'VIERNES o SÁBADO: Cadena Posterior Rápida + Estabilidad Unilateral',
    subtitle: 'Fase 2 · Contraste A1+A2 de cadena posterior, unilateral, remo y antirrotación',
    targetDays: ['Viernes', 'Sábado'],
    estimatedMinutes: 50,
    focus: 'Cadena Posterior Rápida + Estabilidad Unilateral',
    warmup: [
      'Calentamiento y Aproximaciones - 13 min',
      'Activación (5 min): 10 bisagras de cadera sin peso, 10 zancadas atrás sin peso/pierna.',
      'Series de aproximación Peso Muerto Rumano: 40kg x 8 -> 65kg x 5 -> 85kg x 2 reps rápidas + 2 saltos horizontales al 70% (Descansar 2 min antes de los 95-100kg).',
      'Aproximaciones resto de ejercicios: En Zancadas hacer 1x4/pierna con 12kg; en Remo con barra hacer 1x6 con 40kg.',
    ],
    updatedAt: GYM_ROUTINES_UPDATED_AT,
    exercises: [
      {
        id: 'ex-vie-1',
        name: 'A1. Peso Muerto Rumano con Barra',
        muscleGroup: 'Isquiotibiales, glúteos y erectores (Contraste A1)',
        setsReps: '3 series x 5 reps',
        weight: '95 - 100 kg',
        transfer: 'Potenciación post-activación (PAP) de la cadena posterior.',
        execution: 'Bajada en 2-3s sintiendo isquios, subida rápida de cadera. Descansar 20-30s y pasar a A2.',
        completedSets: [false, false, false],
        restSeconds: 25,
      },
      {
        id: 'ex-vie-2',
        name: 'A2. Saltos de Longitud a Pies Juntos',
        muscleGroup: 'Potencia horizontal de cadera (Contraste A2)',
        setsReps: '3 series x 4 saltos horizontales máximos',
        weight: 'Peso corporal',
        transfer: 'Entradas y desplazamientos explosivos en el tatami.',
        execution: 'Amortiguar caída. Descansar 2.5 - 3 min.',
        completedSets: [false, false, false],
        restSeconds: 165,
      },
      {
        id: 'ex-vie-3',
        name: 'B. Zancadas Hacia Atrás con Mancuernas',
        muscleGroup: 'Glúteos, cuádriceps y estabilidad unilateral',
        setsReps: '3 series x 6 reps por pierna',
        weight: 'Mancuernas de 20 kg en cada mano',
        transfer: 'Apoyos firmes sobre una pierna en el Kumite.',
        execution: 'Subida potente de un solo empuje.',
        completedSets: [false, false, false],
        restSeconds: 90,
      },
      {
        id: 'ex-vie-4',
        name: 'C. Remo con Barra Inclinado',
        muscleGroup: 'Dorsal ancho, romboides y flexores de codo',
        setsReps: '3 series x 6 reps',
        weight: '55 - 60 kg totales',
        transfer: 'Tracción para agarrar, frenar y retraer el golpe.',
        execution: 'Tirón seco al abdomen bajo.',
        completedSets: [false, false, false],
        restSeconds: 90,
      },
      {
        id: 'ex-vie-5',
        name: 'D. Core Antirrotación (Press Pallof en Polea o Goma)',
        muscleGroup: 'Core antirrotación y oblicuos',
        setsReps: '3 series x 15 segundos isométricos por lado',
        weight: '12.5 - 15 kg en polea o goma media a un paso largo',
        transfer: 'Torso estable al recibir impactos.',
        execution: 'Brazos estirados al frente sin ceder el torso.',
        completedSets: [false, false, false],
        restSeconds: 60,
      },
    ],
  },
];

// Full text of a routine, used as the description of its calendar events
export function descripcionRutina(routine: GymRoutine): string {
  const lineas: string[] = [];
  if (routine.warmup?.length) {
    const [titulo, ...pasos] = routine.warmup;
    lineas.push(`[${titulo}]`, ...pasos.map((p) => `* ${p}`), '');
  }
  lineas.push(`${routine.title}${routine.estimatedMinutes ? ` (${routine.estimatedMinutes} min)` : ''}`);
  if (routine.exercises.some((ex) => /^A[12]\./.test(ex.name))) lineas.push('', CONTRAST_RULE);
  lineas.push('');
  for (const ex of routine.exercises) {
    lineas.push(`- ${ex.name}: ${ex.setsReps} | Peso: ${ex.weight} (${ex.execution})`);
    if (ex.notes) lineas.push(`  * ${ex.notes}`);
  }
  return lineas.join('\n');
}
