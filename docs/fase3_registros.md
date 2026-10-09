# Registros y check-in diario

Esta fase solo guarda tiempo real opcional y un check-in diario. No calibra estimaciones ni modifica `horas_est`, el algoritmo, la presión o la deuda. No hay revisión semanal.

## Activación manual

En el SQL Editor de tu proyecto Supabase, ejecuta **el archivo completo** `supabase/migration_fase3_registros.sql`, después de las migraciones existentes de fase 2 y Universidad. Debe terminar con `Success. No rows returned`. Es idempotente y no contiene datos personales.

Crea `task_logs` y `checkins` con RLS y políticas `USING` / `WITH CHECK` por `auth.uid()`. Elimina únicamente la firma antigua de tres argumentos de `mutar_planificador` y la sustituye por la misma función con un cuarto argumento `p_horas_reales numeric default null`: las llamadas actuales siguen funcionando. No usa `CASCADE` y toda la migración es una transacción.

La rama de completar cambia únicamente el estado e inserta un log si se proporcionan horas. Ambas escrituras son atómicas. La fecha del log se deriva de Madrid y el propietario de `auth.uid()`. Mantiene el snapshot y la revisión de un plan previamente válido sin tocar sus bloques. La UI conserva también las propuestas aún no guardadas; completar no llama al algoritmo. Las vistas previas anteriores quedan invalidadas por la revisión.

En Hoy y en Entregas Moodle, Completar abre un campo opcional de horas reales en pasos de 0,25. Dejarlo vacío no crea ningún registro. Los trabajos privados de Universidad siguen pudiéndose completar, pero no generan `task_logs`, cuya FK referencia únicamente `entregas.uid`.

El check-in usa el día actual de Madrid incluso al consultar otro día en la pestaña Hoy. El sueño se introduce en pasos de 0,5; energía y fatiga de 1 a 5. Guardar usa upsert por usuario y fecha; editar sobrescribe el mismo día. Los valores iniciales de energía y fatiga son 3, el sueño está vacío y nada se guarda automáticamente. Si falta la migración, el formulario informa de ello y no modifica otros datos.

## Pruebas locales con datos inventados

`npm run lint` y `npm test` incluyen la lógica del aviso y validaciones. El SQL se verifica con PGlite en memoria, sin Supabase. Se reutiliza el runtime temporal de las pruebas de fase 2:

```powershell
$env:PGLITE_MODULE_PATH = Join-Path $env:TEMP 'codex-planner-pg-tests/node_modules/@electric-sql/pglite/dist/index.js'
node --import tsx tests/fase3_registros_persistence.ts
```

Si no está instalado, sigue la instalación temporal descrita en `docs/planificador.md`; no se añade al stack de la app. La prueba comprueba migración repetida, RLS, restricciones, upsert, finalización con/sin horas, rollback, compatibilidad y conservación del plan y deuda.

Para verificar el build sin escribir configuración real en los artefactos generados, se ejecuta `npm run build` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` sustituidas por placeholders solo en el entorno de ese proceso. No se modifica ningún archivo `.env`.
