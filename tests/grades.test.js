// Pruebas de las reglas de negocio. Ejecutar con: npm test  (Node >= 18, sin dependencias)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  redondear2,
  parseNumero,
  validarDocumento,
  validarCantidad,
  validarNota,
  validarPorcentaje,
  estadoPorcentajes,
  validarFormulario,
  calcularDefinitiva,
  repartoEquitativo,
} from '../js/grades.js';

test('redondear2 maneja coma flotante', () => {
  assert.equal(redondear2(1.005), 1.01);
  assert.equal(redondear2(2.675), 2.68);
  assert.equal(redondear2(0.1 + 0.2), 0.3);
});

test('parseNumero acepta coma y punto, rechaza texto/vacío', () => {
  assert.equal(parseNumero('3,5'), 3.5);
  assert.equal(parseNumero(' 4.25 '), 4.25);
  assert.ok(Number.isNaN(parseNumero('')));
  assert.ok(Number.isNaN(parseNumero('abc')));
  assert.ok(Number.isNaN(parseNumero('3.5.1')));
  assert.ok(Number.isNaN(parseNumero('1e2')));
});

test('RN-01 documento: solo dígitos, 5–15', () => {
  assert.equal(validarDocumento('1020304050').ok, true);
  assert.equal(validarDocumento('').ok, false);
  assert.equal(validarDocumento('12a45').ok, false);
  assert.equal(validarDocumento('1234').ok, false);
  assert.equal(validarDocumento('1234567890123456').ok, false);
});

test('Cantidad: entero 1–20 (cero y negativos rechazados)', () => {
  assert.deepEqual(validarCantidad('3'), { ok: true, valor: 3 });
  assert.equal(validarCantidad('0').ok, false);
  assert.equal(validarCantidad('-2').ok, false);
  assert.equal(validarCantidad('2.5').ok, false);
  assert.equal(validarCantidad('21').ok, false);
  assert.equal(validarCantidad('').ok, false);
});

test('RN-02 / FA-02 nota en rango 0.0–5.0', () => {
  assert.equal(validarNota('0').ok, true);
  assert.equal(validarNota('5').ok, true);
  assert.equal(validarNota('5.01').ok, false);
  assert.equal(validarNota('-0.1').ok, false);
  assert.equal(validarNota('').ok, false); // FA-03
});

test('Porcentaje: > 0 y <= 100', () => {
  assert.equal(validarPorcentaje('30').ok, true);
  assert.equal(validarPorcentaje('0').ok, false);
  assert.equal(validarPorcentaje('-10').ok, false);
  assert.equal(validarPorcentaje('101').ok, false);
});

test('RN-03 / FA-01 suma de porcentajes indica faltante o sobrante', () => {
  assert.equal(estadoPorcentajes([30, 30, 40]).ok, true);
  assert.equal(estadoPorcentajes([33.33, 33.33, 33.34]).ok, true);
  const falta = estadoPorcentajes([30, 30, 30]);
  assert.equal(falta.ok, false);
  assert.equal(falta.faltante, 10);
  const sobra = estadoPorcentajes([50, 30, 40]);
  assert.equal(sobra.ok, false);
  assert.equal(sobra.sobrante, 20);
});

test('validarFormulario bloquea con errores y deja pasar datos válidos', () => {
  const malo = validarFormulario([{ nota: '6', porcentaje: '50' }, { nota: '', porcentaje: '50' }]);
  assert.equal(malo.ok, false);
  assert.equal(malo.errores.length, 2);
  assert.equal(malo.notas, null);

  const bueno = validarFormulario([{ nota: '3,5', porcentaje: '60' }, { nota: '4', porcentaje: '40' }]);
  assert.equal(bueno.ok, true);
  assert.deepEqual(bueno.notas, [{ valor: 3.5, porcentaje: 60 }, { valor: 4, porcentaje: 40 }]);
});

test('Promedio ponderado y RN-04 (aprueba con >= 3.0)', () => {
  // 3.0*30% + 4.0*30% + 2.5*40% = 0.9 + 1.2 + 1.0 = 3.10
  assert.deepEqual(
    calcularDefinitiva([{ valor: 3, porcentaje: 30 }, { valor: 4, porcentaje: 30 }, { valor: 2.5, porcentaje: 40 }]),
    { notaDefinitiva: 3.1, estado: 'Aprobado' }
  );
  // Límite exacto
  assert.equal(calcularDefinitiva([{ valor: 3, porcentaje: 100 }]).estado, 'Aprobado');
  assert.deepEqual(
    calcularDefinitiva([{ valor: 2.99, porcentaje: 100 }]),
    { notaDefinitiva: 2.99, estado: 'Reprobado' }
  );
  // 2.995 se redondea a 3.00 → Aprobado (se evalúa lo que ve el estudiante)
  assert.equal(calcularDefinitiva([{ valor: 2.99, porcentaje: 50 }, { valor: 3, porcentaje: 50 }]).notaDefinitiva, 3);
  assert.throws(() => calcularDefinitiva([]));
});

test('repartoEquitativo suma exactamente 100', () => {
  assert.deepEqual(repartoEquitativo(3), [33.33, 33.33, 33.34]);
  assert.deepEqual(repartoEquitativo(4), [25, 25, 25, 25]);
  for (let n = 1; n <= 20; n++) {
    assert.equal(estadoPorcentajes(repartoEquitativo(n)).ok, true, `n=${n}`);
  }
});
