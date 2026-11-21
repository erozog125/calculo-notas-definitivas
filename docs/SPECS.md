# Especificación — CU-01 Gestión y Cálculo de Nota Definitiva

Documento de ingeniería de requisitos derivado de la *Guía de Laboratorio Técnico*. La HU define el **qué** y el **para qué**; la Spec define el **cómo**.

## Reglas de negocio

| ID | Regla |
|----|-------|
| RN-01 | Acceso solo con número de documento (sin contraseña). Si no existe, flujo rápido de registro; si existe, inicia sesión. |
| RN-02 | Escala de calificación de `0.0` a `5.0`. |
| RN-03 | La suma de porcentajes debe ser exactamente `100 %`. |
| RN-04 | Aprueba con nota definitiva `>= 3.0`. |

---

## Épicas e Historias de Usuario

### Épica E1 — Acceso del estudiante

**HU-01 Ingreso con documento**
*Como* estudiante, *quiero* ingresar solo con mi número de documento *para* acceder rápido sin recordar contraseñas.

Criterios de aceptación:
- **Dado** que escribo un documento registrado, **cuando** pulso *Continuar*, **entonces** entro al panel de notas.
- **Dado** que escribo un documento no registrado, **cuando** pulso *Continuar*, **entonces** veo el formulario de registro rápido con mi documento.
- **Dado** que el campo está vacío, contiene letras o tiene menos de 5 / más de 15 dígitos, **entonces** se muestra el error y no avanzo.

**HU-02 Registro rápido**
*Como* estudiante nuevo, *quiero* registrarme en un solo paso (nombre opcional) *para* empezar a calcular de inmediato.

Criterios de aceptación:
- Al confirmar, se crea el usuario en `usuarios` y se inicia sesión automáticamente.
- *Cancelar* regresa a la pantalla de acceso sin crear nada.

**HU-03 Persistencia y cierre de sesión**
*Como* estudiante, *quiero* que mi sesión se mantenga al recargar y poder cerrarla *para* no reingresar a cada momento y proteger mis datos en equipos compartidos.

Criterios de aceptación:
- Al recargar la página con sesión activa, se abre directamente el panel.
- *Cerrar sesión* elimina la sesión y vuelve a la pantalla de acceso.

### Épica E2 — Configuración de la evaluación

**HU-04 Cantidad de notas**
*Como* estudiante, *quiero* indicar cuántas notas tiene mi asignatura *para* que el sistema genere los campos necesarios.

Criterios de aceptación:
- Acepta enteros de 1 a 20. Cero, negativos, decimales o vacío muestran error y no generan campos.
- Al ingresar N válido se generan N filas con *nota* y *porcentaje*.

**HU-05 Validación en tiempo real**
*Como* estudiante, *quiero* ver al instante si un dato es inválido y cuánto porcentaje llevo *para* corregir antes de calcular.

Criterios de aceptación:
- Nota fuera de `0.0–5.0` o no numérica → el campo se resalta en rojo con mensaje (FA-02, FA-03).
- Porcentaje `<= 0`, `> 100` o no numérico → campo resaltado.
- Un medidor muestra la suma actual: ámbar si falta, verde si es 100 %, rojo si sobra.
- Botón *Repartir % en partes iguales* completa los porcentajes sumando exactamente 100.

### Épica E3 — Cálculo y resultados

**HU-06 Calcular nota definitiva**
*Como* estudiante, *quiero* calcular mi nota definitiva y saber si aprobé *para* conocer mi estado académico.

Criterios de aceptación:
- Si hay campos vacíos/inválidos, se bloquea el cálculo y se resaltan (FA-02, FA-03).
- Si la suma ≠ 100 %, se bloquea y la alerta indica el porcentaje **faltante** o **sobrante** (FA-01).
- Con datos válidos se muestra la nota con 2 decimales y el estado **Aprobado** (≥ 3.0) o **Reprobado**.

**HU-07 Historial**
*Como* estudiante, *quiero* ver mis cálculos anteriores *para* comparar escenarios.

Criterios de aceptación:
- Cada cálculo válido se guarda en `calculos` asociado a mi documento.
- El historial muestra solo mis cálculos, del más reciente al más antiguo.
- Puedo *Cargar* un cálculo anterior en el formulario, *Eliminar* uno o *Borrar todo* (con confirmación).

---

## Specs técnicas

### 1. Modelo de datos (IndexedDB)

Base de datos: **`CalculoNotasDB`**, versión **1**.

| ObjectStore | keyPath | Índices | Propiedades |
|---|---|---|---|
| `usuarios` | `documento` | — | `documento: string` (solo dígitos), `nombre: string` (puede ser vacío), `fechaRegistro: string` (ISO 8601) |
| `calculos` | `id` (autoIncrement) | `por_documento` → `documento` (no único) | `id: number`, `documento: string`, `notas: Array<{valor: number, porcentaje: number}>`, `notaDefinitiva: number`, `estado: "Aprobado" \| "Reprobado"`, `fecha: string` (ISO 8601) |
| `sesion` | `clave` | — | `clave: "activa"`, `documento: string`, `inicio: string` (ISO 8601) |

- El documento se guarda como **string** para conservar ceros a la izquierda.
- `registrarUsuario` usa `add()` (falla si ya existe) para evitar duplicados.
- La sesión vive en IndexedDB, no en `localStorage`.

### 2. Contrato de UI y estados

| Estado | Visible | Oculto |
|---|---|---|
| **Acceso** | `#view-login` → `#form-login` | `#view-dashboard`, `#session-bar` |
| **Registro rápido** | `#view-login` → `#form-register` | `#form-login` |
| **Configuración (cantidad)** | `#view-dashboard`, `#step-count`, `#session-bar`, historial | `#view-login`, `#step-grades`, `#step-result` |
| **Configuración (notas)** | `#step-grades` con N filas, medidor de % | `#step-count` |
| **Resultado** | `#step-grades` + `#step-result` | — |
| **Sin soporte** | `#view-unsupported` | todo lo demás |

### 3. Fórmula y validaciones

```
notaDefinitiva = redondear2( Σ (nota_i × porcentaje_i / 100) )
redondear2(x)  = Math.round((x + Number.EPSILON) × 100) / 100
estado         = notaDefinitiva >= 3.0 ? "Aprobado" : "Reprobado"
```

- Se acepta coma o punto como separador decimal.
- La suma de porcentajes se redondea a 2 decimales antes de comparar con 100 (así `33.33 + 33.33 + 33.34 = 100`).
- El estado se evalúa sobre el valor **redondeado** (el que ve el estudiante).
- Validaciones: documento `^\d{5,15}$`; cantidad entero `1..20`; nota `0..5`; porcentaje `(0, 100]`.

### 4. Casos borde

| Caso | Comportamiento |
|---|---|
| Recarga con sesión activa | Se lee `sesion`, se recupera el usuario y se abre el panel. |
| Sesión apunta a un usuario inexistente | Se elimina la sesión y se muestra el acceso. |
| Cantidad 0, negativa o decimal | Error *"Debes evaluar al menos 1 nota"* / *"debe ser entero"*. |
| Nota o porcentaje negativo | Campo resaltado; cálculo bloqueado. |
| Porcentajes que suman 90 o 120 | Alerta *"Falta 10 %"* / *"Sobra 20 %"*. |
| Navegador sin IndexedDB (o bloqueado) | Se muestra `#view-unsupported`. |
| Dos pestañas registrando el mismo documento | Si `add()` falla, se busca el usuario y se inicia sesión. |
