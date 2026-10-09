# Planificador determinista · fase 2

La sincronización de Moodle queda intacta. El planificador lee las entregas
existentes, sus grupos y sus plazos UTC; convierte únicamente el plazo a
Europe/Madrid para comparar con horarios locales. No usa IA.

## Activación

1. Ejecutar `supabase/migration_fase2_planificador.sql` en el SQL Editor del mismo
   proyecto Supabase, después de las tablas de fase 1. Es una transacción y se
   puede ejecutar de nuevo. No contiene horarios personales.
2. Ejecutar también `supabase/migration_calendar_planificador.sql`. Añade el
   campo `eventos.activo` y el RPC privado de Calendar; es idempotente y no
   contiene horarios personales. Iniciar sesión en la app.
3. Abrir **Plan de estudio → Eventos fijos** y añadir clases, trabajo, entrenos,
   ocio y compromisos. Marcar los días semanales y el rango de validez cuando
   haya recurrencia. Las clases académicas se importan de Calendar; no se
   importan los presets antiguos del repositorio.
4. Revisar **Parámetros**. Valores iniciales: 09:00–23:00, margen 15 min,
   profundidad 17:00–21:00, máximo profundo 4 h/día y deuda máxima 6 h.
   Guardar los parámetros para personalizarlos en la base de datos.
5. Revisar **Estimaciones**. Las entregas con `horas_est = null` usan 2 h y se
   marcan como provisionales. El mínimo dinámico es el 25 % de la estimación,
   con suelo de 20 min. Calibración por defecto y por entrega: 1.0.
6. Revisar hoy y semana; **Guardar plan semanal** conserva el plan en Supabase.

El código está preparado para la app existente. La migración requiere acceso
administrativo al proyecto; una clave pública de Supabase no puede ejecutarla.
La nueva UI no muestra éxito ficticio si faltan tablas o falla una escritura.

## Decisiones de fase 2

- Calendar actualiza sus fijos tras una sincronización completa y válida, al
  iniciar, al volver a la pestaña y cada 15 minutos mientras la app está abierta.
  El RPC usa `auth.uid()`, RLS y el mismo bloqueo por usuario del planificador.
  Conserva los IDs de la importación anterior. No modifica Moodle ni karate.
- Solo recalcula cuando cambia la unión de horas ocupadas, incluidos márgenes
  y límites del día. Sustituir una asignatura, renombrarla o dividir un intervalo
  sin cambiar esa unión actualiza las clases mostradas y conserva el estudio.
  Las cancelaciones desactivan el fijo sin borrar los enlaces del historial.
  Un cambio de ocupación invalida el plan guardado y muestra una propuesta desde
  el momento actual; guardar esa propuesta sigue siendo una acción del usuario.
  **Actualizar** también consulta Calendar y comunica cualquier fallo de los
  fijos sin interrumpir la sincronización de Agenda.

- Las cuatro tablas nuevas tienen `user_id` y RLS por usuario autenticado.
  `parametros` tiene clave primaria `(user_id, clave)` para no compartir ajustes.
  Las entregas conservan la política de acceso existente de fase 1.
- `eventos` guarda horas locales de Madrid (`time without time zone`), fechas y
  días ISO (lunes=1). Un evento puntual se aplica solo a `fecha_inicio`.
  Los eventos que cruzan medianoche se introducen como dos eventos.
- Los fijos y sociales siempre restan hueco y margen. Un flexible resta hueco
  cuando `bloqueo=true`; si es false se muestra como preferencia y puede
  coincidir con estudio. La UI lo explica.
- El plan cubre de lunes a domingo. Solo se asigna dentro de esa semana;
  la presión usa los huecos hasta el plazo real, incluso si es otra semana.
  Se respeta la hora exacta del plazo. El orden es fecha de vencimiento,
  presión descendente y, para desempatar, hora de plazo y UID.
- Una tarea completa puede distribuirse entre huecos y días. Si no cabe en
  la semana antes de vencer, se intenta un mínimo continuo. Una versión
  mínima sigue mostrando el trabajo restante en riesgo. El máximo profundo
  cuenta también los bloques conservados de ese día.
- Un social puntual usa el plan mostrado como base. Solo recalcula desde su
  inicio. Se rechaza si el evento o su margen invade un bloque anterior;
  esto incluye un bloque que haya empezado antes y siga en curso.
  También se rechaza si coincide con un horario fijo o bloqueado posterior.
- El diff identifica cambios por tarea y lista todos sus intervalos antes y
  después. Deuda nueva = minutos planificados que se pierden y no se recolocan.
  Se registra únicamente la deuda nueva con `motivo=plan_social`.
  La deuda es un registro acumulativo en fase 2; no hay amortización automática.
- Guardar un social es una única transacción: evento, archivo del plan anterior,
  nuevos bloques y deuda. `activo` permite conservar el historial; los bloques
  nuevos enlazan con `reemplaza_a`. Se exige confirmación adicional sobre el
  límite y se rechaza una revisión/plazo de entrega que haya cambiado.
- La UI conserva el plan guardado al actualizar la página. Editar horarios,
  parámetros, estimaciones o aplazar invalida esa versión y propone un nuevo
  plan desde el momento actual. Las revisiones internas se guardan como claves
  reservadas de `parametros`; no son ajustes personales.
- **Siguiente día** y **No completada** aplazan hasta mañana e incrementan
  `aplazamientos` una vez por acción. **Completada** cambia el estado de la
  entrega. No modifica horas reales ni calcula calibración.
- Desde tres aplazamientos: dividir (tamaño de bloques editable), descartar
  o fijar un intervalo concreto. El intervalo fijado reserva capacidad frente
  a otras entregas y sigue respetando eventos, plazo y límite profundo.
- Se añaden a `entregas` preferencias de división, aplazamiento e intervalo
  fijado, además de `tipo_trabajo`, `aplazamientos` y `factor_calibracion`.
  El spread de campos propios de la sync existente las conserva.
- No se implementan check-in nocturno, calibración ni revisión semanal.
  Los sociales llevan el tipo `social` para excluirlos de futuras estimaciones.

## Verificación reproducible

```powershell
npm test
npm run lint
npm run build
```

Los ocho escenarios solicitados están en `tests/planificador.test.ts`, con
datos inventados en `tests/fixtures/planificador/`. Hay casos adicionales para
presión, UTC/DST, historial, deuda, fijación y división.

La suite de PostgreSQL embebido comprueba la migración, RLS, concurrencia y
transacciones sin escribir en Supabase real ni modificar el stack. Su librería
se instala únicamente en una carpeta temporal:

```powershell
npm install --prefix "$env:TEMP/codex-planner-pg-tests" --no-audit --no-fund --ignore-scripts @electric-sql/pglite
$env:PGLITE_MODULE_PATH = Join-Path $env:TEMP 'codex-planner-pg-tests/node_modules/@electric-sql/pglite/dist/index.js'
node --import tsx tests/planificador_persistence.ts
node --import tsx tests/calendar_planificador_persistence.ts
```

Pendiente de aceptación con tu cuenta: aplicar la migración, cargar tus horarios,
revisar hoy y confirmar un social viendo el diff. Las pruebas locales usan
datos ficticios y no sustituyen esa verificación de producción.
