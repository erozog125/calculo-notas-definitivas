/**
 * grades.js — Reglas de negocio puras (sin DOM ni IndexedDB).
 * Al no depender del navegador, este módulo se prueba directamente con Node (tests/).
 *
 * RN-02: escala 0.0 – 5.0
 * RN-03: la suma de porcentajes debe ser exactamente 100 %
 * RN-04: aprueba con nota definitiva >= 3.0
 */

export const NOTA_MIN = 0;
export const NOTA_MAX = 5;
export const NOTA_APROBATORIA = 3;
export const PORCENTAJE_TOTAL = 100;
export const MIN_NOTAS = 1;
export const MAX_NOTAS = 20;

/** Redondeo a 2 decimales evitando errores de coma flotante (p. ej. 1.005 → 1.01). */
export function redondear2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Convierte el texto de un input en número. Acepta coma o punto decimal.
 * Devuelve NaN si está vacío o no es numérico (FA-03).
 */
export function parseNumero(texto) {
  if (texto === null || texto === undefined) return NaN;
  const limpio = String(texto).trim().replace(',', '.');
  if (limpio === '' || !/^-?\d+(\.\d+)?$/.test(limpio)) return NaN;
  return Number(limpio);
}

/** Documento: solo dígitos, entre 5 y 15 caracteres (RN-01). */
export function validarDocumento(texto) {
  const doc = String(texto ?? '').trim();
  if (doc === '') return { ok: false, error: 'Ingresa tu número de documento.' };
  if (!/^\d+$/.test(doc)) return { ok: false, error: 'El documento solo puede contener números.' };
  if (doc.length < 5 || doc.length > 15) {
    return { ok: false, error: 'El documento debe tener entre 5 y 15 dígitos.' };
  }
  return { ok: true, valor: doc };
}

/** Cantidad de notas: entero entre 1 y 20 (caso borde: cero o negativos). */
export function validarCantidad(texto) {
  const n = parseNumero(texto);
  if (Number.isNaN(n)) return { ok: false, error: 'Ingresa un número entero.' };
  if (!Number.isInteger(n)) return { ok: false, error: 'La cantidad debe ser un número entero.' };
  if (n < MIN_NOTAS) return { ok: false, error: 'Debes evaluar al menos 1 nota.' };
  if (n > MAX_NOTAS) return { ok: false, error: `El máximo es ${MAX_NOTAS} notas.` };
  return { ok: true, valor: n };
}

/** Valida una nota individual (FA-02, FA-03). */
export function validarNota(texto) {
  const n = parseNumero(texto);
  if (Number.isNaN(n)) return { ok: false, error: 'Requerida y numérica.' };
  if (n < NOTA_MIN || n > NOTA_MAX) return { ok: false, error: 'Debe estar entre 0.0 y 5.0.' };
  return { ok: true, valor: n };
}

/** Valida un porcentaje individual: > 0 y <= 100 (FA-03 y caso borde de negativos). */
export function validarPorcentaje(texto) {
  const n = parseNumero(texto);
  if (Number.isNaN(n)) return { ok: false, error: 'Requerido y numérico.' };
  if (n <= 0) return { ok: false, error: 'Debe ser mayor que 0.' };
  if (n > PORCENTAJE_TOTAL) return { ok: false, error: 'No puede superar 100.' };
  return { ok: true, valor: n };
}

/**
 * Estado de la suma de porcentajes (FA-01).
 * La suma se redondea a 2 decimales antes de comparar, así 33.33+33.33+33.34 = 100.
 */
export function estadoPorcentajes(porcentajes) {
  const suma = redondear2(porcentajes.reduce((acc, p) => acc + (Number.isFinite(p) ? p : 0), 0));
  const diferencia = redondear2(PORCENTAJE_TOTAL - suma);
  if (diferencia === 0) return { suma, ok: true, mensaje: 'Los porcentajes suman 100%.' };
  if (diferencia > 0) {
    return { suma, ok: false, faltante: diferencia, mensaje: `Falta ${diferencia}% para completar el 100%.` };
  }
  return { suma, ok: false, sobrante: -diferencia, mensaje: `Sobra ${-diferencia}%: la suma supera el 100%.` };
}

/**
 * Valida el formulario completo. Recibe filas en texto crudo [{nota, porcentaje}].
 * Devuelve errores por fila y la lista numérica si todo es válido.
 */
export function validarFormulario(filas) {
  const errores = [];
  const notas = [];
  filas.forEach((fila, i) => {
    const vn = validarNota(fila.nota);
    const vp = validarPorcentaje(fila.porcentaje);
    if (!vn.ok) errores.push({ indice: i, campo: 'nota', error: vn.error });
    if (!vp.ok) errores.push({ indice: i, campo: 'porcentaje', error: vp.error });
    notas.push({ valor: vn.ok ? vn.valor : NaN, porcentaje: vp.ok ? vp.valor : NaN });
  });
  const pct = estadoPorcentajes(notas.map((n) => n.porcentaje));
  const ok = errores.length === 0 && pct.ok;
  return { ok, errores, porcentajes: pct, notas: ok ? notas : null };
}

/**
 * Promedio ponderado: Σ (nota_i × porcentaje_i / 100), redondeado a 2 decimales.
 * El estado se evalúa sobre el valor redondeado (lo que ve el estudiante).
 */
export function calcularDefinitiva(notas) {
  if (!Array.isArray(notas) || notas.length === 0) {
    throw new Error('Se requiere al menos una nota.');
  }
  const bruto = notas.reduce((acc, n) => acc + (n.valor * n.porcentaje) / PORCENTAJE_TOTAL, 0);
  const notaDefinitiva = redondear2(bruto);
  const estado = notaDefinitiva >= NOTA_APROBATORIA ? 'Aprobado' : 'Reprobado';
  return { notaDefinitiva, estado };
}

/**
 * Reparte el 100 % en partes iguales con 2 decimales.
 * Ej: 3 → [33.33, 33.33, 33.34]
 */
export function repartoEquitativo(cantidad) {
  if (cantidad < 1) return [];
  const base = Math.floor((PORCENTAJE_TOTAL / cantidad) * 100) / 100;
  const resultado = Array(cantidad).fill(base);
  // El último absorbe el residuo para que la suma sea exactamente 100.
  resultado[cantidad - 1] = redondear2(PORCENTAJE_TOTAL - base * (cantidad - 1));
  return resultado;
}
