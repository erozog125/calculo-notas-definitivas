# Cálculo de Notas Definitivas

Aplicación web para calcular la nota definitiva de una asignatura a partir de notas y porcentajes personalizados. Implementa el caso de uso **CU-01 Gestión y Cálculo de Nota Definitiva** de la guía de laboratorio.

**Stack:** HTML5 · CSS3 · JavaScript Vanilla (ES modules) · IndexedDB · Vercel. Sin frameworks, sin backend, sin dependencias.

## Funcionalidades

- **Acceso solo con documento** (RN-01): si no existe, registro rápido con nombre opcional; si existe, inicia sesión. La sesión persiste al recargar.
- **Campos dinámicos**: indicas cuántas notas (1–20) y se generan los inputs de nota y porcentaje.
- **Validación en tiempo real**: notas fuera de `0.0–5.0` (RN-02, FA-02), campos vacíos o no numéricos (FA-03) y medidor de porcentaje que indica faltante o sobrante (RN-03, FA-01).
- **Cálculo ponderado** `Σ (nota × % / 100)` con redondeo a 2 decimales y estado **Aprobado / Reprobado** (RN-04, ≥ 3.0).
- **Historial** por estudiante en IndexedDB: cargar, eliminar o borrar todo.
- Diseño responsive, modo oscuro automático y accesible (labels, `aria-live`, foco al primer error).

## Estructura

```
├── index.html          # Estructura y estados de la UI
├── css/styles.css      # Estilos (mobile-first, modo oscuro)
├── js/
│   ├── app.js          # Controlador de UI (DOM y eventos)
│   ├── db.js           # Capa IndexedDB (usuarios, calculos, sesion)
│   └── grades.js       # Reglas de negocio puras (validación y cálculo)
├── tests/              # Pruebas unitarias con node:test
├── docs/SPECS.md       # Épicas, HU, Specs y criterios de aceptación
└── vercel.json         # Configuración de despliegue estático
```

## Ejecutar localmente

Los ES modules requieren servirse por HTTP (no abrir el archivo con doble clic):

```bash
npm start          # sirve en http://localhost:3000
npm test           # ejecuta las pruebas de reglas de negocio
```

## Despliegue

Sitio estático en Vercel, sin paso de build. Cada push a `main` despliega automáticamente si el repositorio está conectado; también puede desplegarse con `npx vercel --prod`.

> Los datos se guardan únicamente en el navegador del usuario (IndexedDB). Cambiar de navegador o borrar los datos del sitio elimina usuarios e historial.
