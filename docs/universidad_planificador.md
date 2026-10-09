# Deberes y preparación de exámenes

Los trabajos se guardan en `trabajos_universidad`, con RLS por `auth.uid()`.
Moodle mantiene su tabla y su sincronización. Los bloques y la deuda enlazan al
trabajo universitario mediante otra FK; borrar desde la UI lo archiva para
conservar el historial. La instantánea del plan incluye ambos orígenes.

En Universidad, «Añadir examen» permite indicar fecha y hora de Madrid y horas
totales de estudio. Cada asignatura muestra discretamente su próximo examen.
Los deberes guardados entran automáticamente en el plan diario. Los registros
locales anteriores se importan por cuenta; los ejemplos originales sin editar
y los registros sin asignatura se conservan fuera del plan hasta editarlos.

La regla determinista para exámenes busca sesiones equilibradas de hasta 60
minutos, una por examen y día, con separación entre días y un último repaso el
día anterior. La ventana es dos días por sesión, entre 4 y 28 días. Así, 6 horas
se reparten en seis sesiones dentro de los últimos 12 días. Se respetan fijos,
márgenes, plazos y límites profundos. Con estimaciones pequeñas se respeta la
duración exacta. Si faltan días o huecos, las horas pendientes aparecen en
riesgo; no se concentra todo en un único bloque largo.

Las sesiones sugieren practicar sin apuntes, comprobar respuestas y repasar.
La base científica es la práctica distribuida y la recuperación activa:
[Dunlosky et al., 2013](https://www.psychologicalscience.org/journals/pspi/1529100612453266/).
Los minutos y la ventana son decisiones de producto, no un óptimo demostrado
para todas las materias. No se añade IA, calibración, check-in ni revisión semanal.

La proyección evalúa el estudio entre semanas. «Guardar plan semanal» conserva
solo la semana elegida; los bloques ya pasados no vuelven a asignarse. Pulsar un
bloque o un riesgo abre el registro correspondiente en Universidad o Moodle.

Validación: `npm run lint`, `npm test`, y PostgreSQL WASM con el runtime temporal
descrito en `planificador.md`:

```powershell
node --import tsx tests/university_planificador_persistence.ts
```
