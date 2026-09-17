import { TaskItem, VisionSchedulePreset } from '../types';

// High-fidelity SVG data URIs so they load instantly without external dependencies
export const UNIVERSITY_WHITEBOARD_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <defs>
    <linearGradient id="wbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <!-- Board background -->
  <rect width="800" height="500" rx="16" fill="url(#wbGrad)" stroke="#334155" stroke-width="4"/>
  <rect x="20" y="20" width="760" height="460" rx="10" fill="#090d16" stroke="#1e293b" stroke-width="2"/>
  
  <!-- Header handwritten style -->
  <text x="50" y="70" font-family="monospace" font-size="24" font-weight="bold" fill="#38bdf8" letter-spacing="1">
    CAMPUS POLITÉCNICO - CALENDARIO ENTREGAS &amp; EXÁMENES
  </text>
  <line x1="50" y1="85" x2="750" y2="85" stroke="#0284c7" stroke-width="2" stroke-dasharray="6,4"/>

  <!-- Row 1: MATLAB -->
  <rect x="50" y="110" width="700" height="75" rx="8" fill="#0f172a" stroke="#2563eb" stroke-width="1.5"/>
  <circle cx="75" cy="147" r="10" fill="#3b82f6"/>
  <text x="100" y="140" font-family="sans-serif" font-size="18" font-weight="700" fill="#f8fafc">Entrega Final: Proyecto MATLAB (Simulación Dinámica)</text>
  <text x="100" y="165" font-family="monospace" font-size="14" fill="#93c5fd">Viernes, 10:00 AM • Aula 302 • Ponderación: 35% de la nota final</text>
  <rect x="610" y="127" width="120" height="30" rx="6" fill="#1e3a8a" stroke="#3b82f6" stroke-width="1"/>
  <text x="635" y="147" font-family="sans-serif" font-size="12" font-weight="bold" fill="#60a5fa">ACADÉMICO</text>

  <!-- Row 2: C Programming -->
  <rect x="50" y="205" width="700" height="75" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  <circle cx="75" cy="242" r="10" fill="#6366f1"/>
  <text x="100" y="235" font-family="sans-serif" font-size="18" font-weight="700" fill="#f8fafc">Proyecto C: Sistemas Operativos (Concurrencia &amp; Hilos)</text>
  <text x="100" y="260" font-family="monospace" font-size="14" fill="#a5b4fc">Viernes, 23:59 PM • Subida al Campus Virtual • Grupo 4</text>
  <rect x="610" y="222" width="120" height="30" rx="6" fill="#312e81" stroke="#6366f1" stroke-width="1"/>
  <text x="635" y="242" font-family="sans-serif" font-size="12" font-weight="bold" fill="#818cf8">ACADÉMICO</text>

  <!-- Row 3: Examen Parcial -->
  <rect x="50" y="300" width="700" height="75" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  <circle cx="75" cy="337" r="10" fill="#f59e0b"/>
  <text x="100" y="330" font-family="sans-serif" font-size="18" font-weight="700" fill="#f8fafc">Examen Parcial: Métodos Numéricos y Álgebra Lineal</text>
  <text x="100" y="355" font-family="monospace" font-size="14" fill="#fcd34d">Lunes 21 Sep, 09:00 AM • Pabellón Central • Traer calculadora</text>
  <rect x="610" y="317" width="120" height="30" rx="6" fill="#78350f" stroke="#d97706" stroke-width="1"/>
  <text x="640" y="337" font-family="sans-serif" font-size="12" font-weight="bold" fill="#fbbf24">EXAMEN</text>

  <!-- Marker notes at bottom -->
  <path d="M 60 410 Q 200 400 350 415" stroke="#ef4444" stroke-width="2" fill="none"/>
  <text x="60" y="440" font-family="monospace" font-size="13" fill="#f87171">! ATENCIÓN: Las entregas tarde tienen penalización de 2 ptos/día.</text>
  <text x="540" y="440" font-family="monospace" font-size="13" fill="#64748b">Prof. Dr. Arispe • Sep 2026</text>
</svg>
`)}`;

export const KARATE_SCHEDULE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <defs>
    <linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2d0b14"/>
      <stop offset="100%" stop-color="#140508"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="800" height="500" rx="16" fill="url(#redGrad)" stroke="#4c0519" stroke-width="4"/>
  <rect x="20" y="20" width="760" height="460" rx="10" fill="#0d0305" stroke="#3f0e1a" stroke-width="2"/>

  <!-- Dojo Header -->
  <text x="50" y="70" font-family="sans-serif" font-size="24" font-weight="800" fill="#fb7185" letter-spacing="1">
    DOJO SHODOKAN • PLAN DE PREPARACIÓN Y COMPETICIÓN
  </text>
  <line x1="50" y1="85" x2="750" y2="85" stroke="#e11d48" stroke-width="2"/>

  <!-- Training block 1 -->
  <rect x="50" y="110" width="700" height="75" rx="8" fill="#1c070c" stroke="#f43f5e" stroke-width="1.5"/>
  <circle cx="75" cy="147" r="10" fill="#f43f5e"/>
  <text x="100" y="140" font-family="sans-serif" font-size="18" font-weight="700" fill="#fff1f2">Sesión de Hipertrofia &amp; Fuerza (Piernas y Potencia)</text>
  <text x="100" y="165" font-family="monospace" font-size="14" fill="#fda4af">Mañana Jueves, 18:00 (2 Horas) • Gimnasio de Alto Rendimiento</text>
  <rect x="600" y="127" width="130" height="30" rx="6" fill="#881337" stroke="#fb7185" stroke-width="1"/>
  <text x="618" y="147" font-family="sans-serif" font-size="12" font-weight="bold" fill="#ffe4e6">DEPORTE / ROJO</text>

  <!-- Training block 2 -->
  <rect x="50" y="205" width="700" height="75" rx="8" fill="#1c070c" stroke="#4c0519" stroke-width="1.5"/>
  <circle cx="75" cy="242" r="10" fill="#e11d48"/>
  <text x="100" y="235" font-family="sans-serif" font-size="18" font-weight="700" fill="#fff1f2">Kata Avanzado &amp; Kumite con Sensei Tanaka</text>
  <text x="100" y="260" font-family="monospace" font-size="14" fill="#fda4af">Sábado, 09:30 AM (1h 30m) • Tatami 1 • Kimono reglamentario</text>
  <rect x="600" y="222" width="130" height="30" rx="6" fill="#4c0519" stroke="#e11d48" stroke-width="1"/>
  <text x="620" y="242" font-family="sans-serif" font-size="12" font-weight="bold" fill="#fda4af">KARATE DO</text>

  <!-- Training block 3 -->
  <rect x="50" y="300" width="700" height="75" rx="8" fill="#1c070c" stroke="#4c0519" stroke-width="1.5"/>
  <circle cx="75" cy="337" r="10" fill="#fb7185"/>
  <text x="100" y="330" font-family="sans-serif" font-size="18" font-weight="700" fill="#fff1f2">Pesaje Oficial y Clasificatorio Torneo Regional</text>
  <text x="100" y="355" font-family="monospace" font-size="14" fill="#fda4af">Domingo, 11:00 AM • Pabellón Municipal • Categoría Senior -75kg</text>
  <rect x="600" y="317" width="130" height="30" rx="6" fill="#881337" stroke="#fb7185" stroke-width="1"/>
  <text x="625" y="337" font-family="sans-serif" font-size="12" font-weight="bold" fill="#ffe4e6">TORNEO</text>

  <text x="60" y="440" font-family="sans-serif" font-size="13" fill="#9f1239">Enfoque: Explosividad, cadera y control de respiración Kokyu.</text>
</svg>
`)}`;

export const HOSPITALITY_SHIFTS_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
  <defs>
    <linearGradient id="amberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2a1b08"/>
      <stop offset="100%" stop-color="#120c03"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="800" height="500" rx="16" fill="url(#amberGrad)" stroke="#78350f" stroke-width="4"/>
  <rect x="20" y="20" width="760" height="460" rx="10" fill="#0a0702" stroke="#451a03" stroke-width="2"/>

  <!-- Shift Header -->
  <text x="50" y="70" font-family="sans-serif" font-size="24" font-weight="800" fill="#fbbf24" letter-spacing="1">
    ROSTER SEMANAL • BAR &amp; TAPAS LA ESQUINA
  </text>
  <line x1="50" y1="85" x2="750" y2="85" stroke="#d97706" stroke-width="2"/>

  <!-- Shift 1 -->
  <rect x="50" y="110" width="700" height="75" rx="8" fill="#1f1305" stroke="#f59e0b" stroke-width="1.5"/>
  <circle cx="75" cy="147" r="10" fill="#f59e0b"/>
  <text x="100" y="140" font-family="sans-serif" font-size="18" font-weight="700" fill="#fef3c7">Turno Doble en Barra (Apertura + Noche)</text>
  <text x="100" y="165" font-family="monospace" font-size="14" fill="#fde68a">Jueves, 13:00 a 16:30 &amp; 20:00 a 01:00 • Barra Principal</text>
  <rect x="610" y="127" width="120" height="30" rx="6" fill="#78350f" stroke="#f59e0b" stroke-width="1"/>
  <text x="635" y="147" font-family="sans-serif" font-size="12" font-weight="bold" fill="#fef3c7">TRABAJO</text>

  <!-- Shift 2 -->
  <rect x="50" y="205" width="700" height="75" rx="8" fill="#1f1305" stroke="#451a03" stroke-width="1.5"/>
  <circle cx="75" cy="242" r="10" fill="#d97706"/>
  <text x="100" y="235" font-family="sans-serif" font-size="18" font-weight="700" fill="#fef3c7">Recepción Proveedores Bebidas &amp; Inventario</text>
  <text x="100" y="260" font-family="monospace" font-size="14" fill="#fde68a">Viernes, 11:30 AM • Almacén Central • Chequeo albaranes</text>
  <rect x="610" y="222" width="120" height="30" rx="6" fill="#451a03" stroke="#d97706" stroke-width="1"/>
  <text x="635" y="242" font-family="sans-serif" font-size="12" font-weight="bold" fill="#fcd34d">TRABAJO</text>

  <!-- Shift 3 -->
  <rect x="50" y="300" width="700" height="75" rx="8" fill="#1f1305" stroke="#451a03" stroke-width="1.5"/>
  <circle cx="75" cy="337" r="10" fill="#b45309"/>
  <text x="100" y="330" font-family="sans-serif" font-size="18" font-weight="700" fill="#fef3c7">Turno Cierre Fin de Semana</text>
  <text x="100" y="355" font-family="monospace" font-size="14" fill="#fde68a">Sábado, 21:00 a 02:30 • Cuadre de caja con responsable</text>
  <rect x="610" y="317" width="120" height="30" rx="6" fill="#78350f" stroke="#f59e0b" stroke-width="1"/>
  <text x="635" y="337" font-family="sans-serif" font-size="12" font-weight="bold" fill="#fef3c7">TRABAJO</text>

  <text x="60" y="440" font-family="sans-serif" font-size="13" fill="#d97706">Contacto Encargado: Marcos • Cambios de turno con 24h de antelación</text>
</svg>
`)}`;

export const VISION_PRESETS: VisionSchedulePreset[] = [
  {
    id: 'academics-board',
    title: 'Pizarra de Entregas & Exámenes Universidad',
    description: 'Pizarra del departamento de informática con fechas de MATLAB, C y Álgebra.',
    category: 'Academics',
    imageUrl: UNIVERSITY_WHITEBOARD_SVG,
    thumbnailBadge: 'Académico • Azul',
    sampleExtractedTasks: [
      {
        id: 'ex-matlab',
        title: 'Entrega Proyecto MATLAB',
        category: 'Academics',
        date: '2026-09-18',
        time: '10:00',
        durationMinutes: 90,
        priority: 'alta',
        notes: 'Simulación dinámica y gráficos vectoriales. Aula 302.',
        sourceType: 'vision',
        confidence: 0.99,
        extractedFields: {
          deadlineLabel: 'Viernes, 10:00 AM',
          detectedTag: 'Académico (Tag: Blue)',
        },
      },
      {
        id: 'ex-c-prog',
        title: 'Proyecto Programación en C',
        category: 'Academics',
        date: '2026-09-18',
        time: '23:59',
        durationMinutes: 180,
        priority: 'alta',
        notes: 'Sistemas operativos: Hilos posix y sincronización semáforos.',
        sourceType: 'vision',
        confidence: 0.97,
        extractedFields: {
          deadlineLabel: 'Viernes, 23:59',
          detectedTag: 'Académico (Tag: Blue)',
        },
      },
      {
        id: 'ex-algebra',
        title: 'Examen Parcial Álgebra y Métodos',
        category: 'Academics',
        date: '2026-09-21',
        time: '09:00',
        durationMinutes: 120,
        priority: 'alta',
        notes: 'Pabellón Central. Llevar calculadora programable.',
        sourceType: 'vision',
        confidence: 0.98,
        extractedFields: {
          deadlineLabel: 'Lunes, 09:00 AM',
          detectedTag: 'Académico (Tag: Blue)',
        },
      },
    ],
  },
  {
    id: 'karate-schedule',
    title: 'Horario Dojo & Torneo de Karate',
    description: 'Cuadro de preparación física, hipertrofia y competición de Karate Shodokan.',
    category: 'Sports/Karate',
    imageUrl: KARATE_SCHEDULE_SVG,
    thumbnailBadge: 'Deportes/Karate • Rojo',
    sampleExtractedTasks: [
      {
        id: 'ex-hipertrofia',
        title: 'Sesión de Hipertrofia & Fuerza',
        category: 'Sports/Karate',
        date: '2026-09-17',
        time: '18:00',
        durationMinutes: 120,
        priority: 'alta',
        notes: 'Fuerza explosiva, tren inferior y cadera para Kumite.',
        sourceType: 'vision',
        confidence: 0.99,
        extractedFields: {
          deadlineLabel: 'Mañana, 18:00',
          detectedTag: 'Sports/Karate (Tag: Red)',
        },
      },
      {
        id: 'ex-kata-kumite',
        title: 'Kata Avanzado & Kumite',
        category: 'Sports/Karate',
        date: '2026-09-19',
        time: '09:30',
        durationMinutes: 90,
        priority: 'media',
        notes: 'Tatami 1 con Sensei Tanaka. Preparación previa al pesaje.',
        sourceType: 'vision',
        confidence: 0.96,
        extractedFields: {
          deadlineLabel: 'Sábado, 09:30 AM',
          detectedTag: 'Sports/Karate (Tag: Red)',
        },
      },
      {
        id: 'ex-torneo',
        title: 'Pesaje y Torneo Regional de Karate',
        category: 'Sports/Karate',
        date: '2026-09-20',
        time: '11:00',
        durationMinutes: 240,
        priority: 'alta',
        notes: 'Pabellón Municipal. Categoría Senior -75kg.',
        sourceType: 'vision',
        confidence: 0.98,
        extractedFields: {
          deadlineLabel: 'Domingo, 11:00 AM',
          detectedTag: 'Sports/Karate (Tag: Red)',
        },
      },
    ],
  },
  {
    id: 'bar-shifts',
    title: 'Turnos de Trabajo en Bar & Eventos',
    description: 'Planilla de horarios de hostelería: turnos dobles e inventarios.',
    category: 'Work',
    imageUrl: HOSPITALITY_SHIFTS_SVG,
    thumbnailBadge: 'Trabajo • Naranja',
    sampleExtractedTasks: [
      {
        id: 'ex-turno-doble',
        title: 'Turno Doble en Bar La Esquina',
        category: 'Work',
        date: '2026-09-17',
        time: '13:00',
        durationMinutes: 480,
        priority: 'alta',
        notes: 'Turno doble: Mediodía (13:00-16:30) y noche (20:00-01:00).',
        sourceType: 'vision',
        confidence: 0.99,
        extractedFields: {
          deadlineLabel: 'Jueves, 13:00 & 20:00',
          detectedTag: 'Trabajo (Tag: Amber)',
        },
      },
      {
        id: 'ex-inventario',
        title: 'Recepción Proveedores e Inventario',
        category: 'Work',
        date: '2026-09-18',
        time: '11:30',
        durationMinutes: 90,
        priority: 'media',
        notes: 'Control de stock y albaranes de refrescos y barriles.',
        sourceType: 'vision',
        confidence: 0.95,
        extractedFields: {
          deadlineLabel: 'Viernes, 11:30 AM',
          detectedTag: 'Trabajo (Tag: Amber)',
        },
      },
    ],
  },
];
