# Atajo de iPhone: hablar con el asistente desde la pantalla de bloqueo

Una web instalada (PWA) no puede poner widgets en la pantalla de bloqueo de iOS. Lo hace un **atajo de la app Atajos**:
graba lo que dices, lo manda al servidor de CalendarAsist, que lo transcribe, lo entiende y **ejecuta la acción en tu cuenta**
(las mismas que en la app: añadir un fijo, descartar o cambiar entregas, apuntar deberes, «¿qué tengo hoy?»…),
y te lee la respuesta. Si el asistente te pregunta algo («¿Las descarto todas?»), el atajo vuelve a grabar para tu respuesta.

> No hay archivo `.shortcut` para importar: desde iOS 15 Apple solo deja importar atajos firmados (compartidos por enlace de iCloud).
> Créalo a mano una vez (5 minutos) y, si quieres, compártelo después desde Atajos con «Copiar enlace de iCloud».

## 1. Crear el token

1. Abre CalendarAsist con tu cuenta → **Tú** (arriba a la derecha) → **Atajo de iPhone** → **Crear token para el atajo**.
2. Pulsa **Copiar**. El token empieza por `ca_` y solo se enseña una vez. Si lo pierdes, crea otro y revoca el viejo desde la misma pantalla.

## 2. Crear el atajo «Asistente»

Abre **Atajos** → **+** (nuevo atajo) → nómbralo **Asistente**. Añade estas acciones en este orden
(escribe el nombre en el buscador de acciones):

1. **Texto** → déjalo vacío.
2. **Establecer variable** → nombre `Conversación`, valor: *Texto*.
3. **Repetir** → **6** veces. Dentro de «Repetir» van los pasos 4 a 13:
4. **Grabar audio** → toca la flecha: *Calidad* **Normal**, *Empezar a grabar* **Inmediatamente**, *Terminar de grabar* **Al tocar**.
   (Grabas, y tocas la pantalla al acabar de hablar.)
5. **Obtener contenido de URL**:
   - URL: `https://calendaragent.netlify.app/api/asistente/atajo?c=` y, justo detrás, la variable **Conversación**.
   - Toca la flecha: *Método* **POST**.
   - *Encabezados* → **Añadir nuevo encabezado**: clave `Authorization`, valor `Bearer ` (con espacio) y pega tu token detrás.
   - *Cuerpo de la solicitud* → **Archivo** → elige *Audio grabado*.
6. **Obtener valor de diccionario** → *Valor* de la clave `texto` en *Contenido de la URL*.
7. **Leer texto** → *Valor del diccionario*. Toca la flecha: idioma **Español (España)**, *Esperar hasta terminar* activado.
8. **Obtener valor de diccionario** → *Valor* de la clave `conversacion` en *Contenido de la URL*.
9. **Establecer variable** → `Conversación` = *Valor del diccionario* (el del paso 8).
10. **Obtener valor de diccionario** → *Valor* de la clave `seguir` en *Contenido de la URL*.
11. **Si** → *Valor del diccionario* (paso 10) **es** **Falso**.
12. Dentro del «Si»: **Detener este atajo**.
13. **Fin del Si** (Atajos lo añade solo).

Prueba el atajo con ▶︎: di «¿qué tengo hoy?». La primera vez iOS pide permiso para el micrófono y para conectarse a
`calendaragent.netlify.app`: pulsa **Permitir siempre**.

### Variante con el dictado de Apple (más rápida, peor con el euskera)

Cambia el paso 4 por **Dictar texto** (idioma Español, *Dejar de escuchar* **Tras una pausa**) y, en el paso 5,
*Cuerpo de la solicitud* → **JSON** con un campo `texto` = *Texto dictado*. No hace falta tocar la pantalla para terminar,
pero el dictado de Apple suele destrozar nombres como «Programazio Aurreratua»; con el audio, el servidor usa tus
asignaturas como pistas y los escribe bien.

## 3. Ponerlo en la pantalla de bloqueo

- **iOS 18 o posterior**: mantén pulsada la pantalla de bloqueo → **Personalizar** → **Pantalla de bloqueo** →
  toca el botón de abajo (linterna o cámara) → **−** para quitarlo → **+** → **Atajos** → **Ejecutar atajo** → *Asistente*.
- **Botón de acción** (iPhone 15 Pro y posteriores): Ajustes → **Botón de acción** → **Atajo** → *Asistente*.
- **Siri**: «Oye Siri, Asistente».
- **Tocar atrás**: Ajustes → Accesibilidad → Tocar → **Tocar atrás** → *Doble toque* → *Asistente*.

Algunas acciones de Atajos piden desbloquear el iPhone si se lanzan con el móvil bloqueado; si te lo pide, desbloquea
con Face ID y sigue hablando.

## Qué entiende

Lo mismo que el botón «Hablar» de la app: «me voy al cine de 18:00 a 23:00», «mañana tengo un imprevisto de 5 a 7»,
«descarta las entregas de Programazio Aurreratua» (te pide confirmación si son más de 3: responde «sí» o «no»),
«la práctica de PA es para el viernes», «dale 5 horas a los labs», «apúntame un examen de Física el 12»,
«¿qué tengo mañana?», «¿qué entregas tengo?», «deshaz lo último» (en la misma conversación).

## Seguridad

- El token da acceso a tu agenda: no lo compartas. Revócalo en **Tú → Atajo de iPhone** si pierdes el móvil.
- El servidor solo guarda el resumen SHA-256 del token, nunca el token.
- Cada turno guarda en el servidor los tres últimos turnos de la conversación durante 15 minutos (para entender «sí»).
- Coste aproximado por turno: 0,0003 $ de interpretación + 0,0045 $ por minuto de audio.
