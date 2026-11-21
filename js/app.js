/**
 * app.js — Controlador de la interfaz.
 * Orquesta los tres estados de UI (acceso → configuración → resultado)
 * usando db.js (persistencia) y grades.js (reglas de negocio).
 */
import * as db from './db.js';
import {
  validarDocumento,
  validarCantidad,
  validarNota,
  validarPorcentaje,
  validarFormulario,
  estadoPorcentajes,
  calcularDefinitiva,
  parseNumero,
  repartoEquitativo,
  NOTA_APROBATORIA,
} from './grades.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  unsupported: $('#view-unsupported'),
  login: $('#view-login'),
  dashboard: $('#view-dashboard'),
  sessionBar: $('#session-bar'),
  sessionDoc: $('#session-doc'),
  btnLogout: $('#btn-logout'),

  formLogin: $('#form-login'),
  inputDoc: $('#input-doc'),
  docError: $('#doc-error'),
  formRegister: $('#form-register'),
  registerDoc: $('#register-doc'),
  inputName: $('#input-name'),
  btnRegisterCancel: $('#btn-register-cancel'),

  greeting: $('#greeting'),
  stepCount: $('#step-count'),
  formCount: $('#form-count'),
  inputCount: $('#input-count'),
  countError: $('#count-error'),

  stepGrades: $('#step-grades'),
  formGrades: $('#form-grades'),
  gradesList: $('#grades-list'),
  gradesAlert: $('#grades-alert'),
  pctFill: $('#pct-meter-fill'),
  pctText: $('#pct-meter-text'),
  pctMeter: $('#pct-meter'),
  btnReset: $('#btn-reset'),
  btnEqual: $('#btn-equal'),

  stepResult: $('#step-result'),
  resultValue: $('#result-value'),
  resultBadge: $('#result-badge'),
  resultDetail: $('#result-detail'),

  historyList: $('#history-list'),
  historyEmpty: $('#history-empty'),
  btnClearHistory: $('#btn-clear-history'),

  toast: $('#toast'),
};

/** Estado en memoria de la sesión actual. */
const estado = {
  usuario: null,
  documentoPendiente: null,
};

/* =========================================================
 * Utilidades de UI
 * ========================================================= */

function mostrar(nodo, visible) {
  nodo.hidden = !visible;
}

let toastTimer;
function toast(mensaje) {
  el.toast.textContent = mensaje;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3000);
}

function setError(input, nodoError, mensaje) {
  nodoError.textContent = mensaje || '';
  input.classList.toggle('is-invalid', Boolean(mensaje));
  input.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
}

function formatoNota(n) {
  return n.toFixed(2);
}

function formatoFecha(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

/* =========================================================
 * Estado 1: Acceso (RN-01)
 * ========================================================= */

function irALogin() {
  estado.usuario = null;
  estado.documentoPendiente = null;
  mostrar(el.dashboard, false);
  mostrar(el.sessionBar, false);
  mostrar(el.login, true);
  mostrar(el.formRegister, false);
  mostrar(el.formLogin, true);
  el.formLogin.reset();
  setError(el.inputDoc, el.docError, '');
  el.inputDoc.focus();
}

async function onLogin(evento) {
  evento.preventDefault();
  const v = validarDocumento(el.inputDoc.value);
  if (!v.ok) {
    setError(el.inputDoc, el.docError, v.error);
    el.inputDoc.focus();
    return;
  }
  setError(el.inputDoc, el.docError, '');

  try {
    const usuario = await db.obtenerUsuario(v.valor);
    if (usuario) {
      await iniciarSesion(usuario);
      toast(`Bienvenido de nuevo${usuario.nombre ? ', ' + usuario.nombre : ''}.`);
    } else {
      // Flujo rápido de registro
      estado.documentoPendiente = v.valor;
      el.registerDoc.textContent = v.valor;
      el.inputName.value = '';
      mostrar(el.formLogin, false);
      mostrar(el.formRegister, true);
      el.inputName.focus();
    }
  } catch (err) {
    console.error(err);
    setError(el.inputDoc, el.docError, 'No se pudo acceder a la base de datos local.');
  }
}

async function onRegister(evento) {
  evento.preventDefault();
  const documento = estado.documentoPendiente;
  if (!documento) return irALogin();
  try {
    const usuario = await db.registrarUsuario(documento, el.inputName.value);
    await iniciarSesion(usuario);
    toast('Registro exitoso. ¡Ya puedes calcular tu nota!');
  } catch (err) {
    console.error(err);
    // Si otra pestaña lo registró justo antes, simplemente inicia sesión.
    const existente = await db.obtenerUsuario(documento).catch(() => null);
    if (existente) return iniciarSesion(existente);
    toast('No se pudo completar el registro.');
  }
}

async function iniciarSesion(usuario) {
  await db.guardarSesion(usuario.documento);
  estado.usuario = usuario;
  estado.documentoPendiente = null;
  await irAlPanel();
}

async function onLogout() {
  await db.cerrarSesion();
  reiniciarPanel();
  irALogin();
  toast('Sesión cerrada.');
}

/* =========================================================
 * Estado 2: Panel — cantidad e inputs dinámicos
 * ========================================================= */

async function irAlPanel() {
  const u = estado.usuario;
  el.sessionDoc.textContent = u.documento;
  el.greeting.textContent = u.nombre ? `Hola, ${u.nombre}` : 'Hola';
  mostrar(el.login, false);
  mostrar(el.sessionBar, true);
  mostrar(el.dashboard, true);
  reiniciarPanel();
  await renderHistorial();
  el.inputCount.focus();
}

function reiniciarPanel() {
  el.formCount.reset();
  setError(el.inputCount, el.countError, '');
  el.gradesList.innerHTML = '';
  mostrar(el.stepCount, true);
  mostrar(el.stepGrades, false);
  mostrar(el.stepResult, false);
  mostrar(el.gradesAlert, false);
}

function onCount(evento) {
  evento.preventDefault();
  const v = validarCantidad(el.inputCount.value);
  if (!v.ok) {
    setError(el.inputCount, el.countError, v.error);
    el.inputCount.focus();
    return;
  }
  setError(el.inputCount, el.countError, '');
  generarCampos(v.valor);
}

/** Genera dinámicamente N filas con inputs de nota y porcentaje. */
function generarCampos(cantidad, valores = []) {
  const fragmento = document.createDocumentFragment();
  for (let i = 0; i < cantidad; i++) {
    const fila = document.createElement('div');
    fila.className = 'grade-row';
    fila.dataset.index = String(i);
    const n = i + 1;
    fila.innerHTML = `
      <span class="grade-row__num" aria-hidden="true">${n}</span>
      <div class="field field--compact">
        <label class="sr-only" for="nota-${i}">Nota ${n}</label>
        <input id="nota-${i}" data-campo="nota" type="text" inputmode="decimal"
               placeholder="Nota ${n}" autocomplete="off" aria-describedby="nota-${i}-err" />
        <p class="field__error" id="nota-${i}-err"></p>
      </div>
      <div class="field field--compact field--suffix">
        <label class="sr-only" for="pct-${i}">Porcentaje de la nota ${n}</label>
        <input id="pct-${i}" data-campo="porcentaje" type="text" inputmode="decimal"
               placeholder="%" autocomplete="off" aria-describedby="pct-${i}-err" />
        <span class="suffix" aria-hidden="true">%</span>
        <p class="field__error" id="pct-${i}-err"></p>
      </div>`;
    const v = valores[i];
    if (v) {
      fila.querySelector('[data-campo="nota"]').value = v.valor;
      fila.querySelector('[data-campo="porcentaje"]').value = v.porcentaje;
    }
    fragmento.appendChild(fila);
  }
  el.gradesList.innerHTML = '';
  el.gradesList.appendChild(fragmento);

  mostrar(el.stepCount, false);
  mostrar(el.stepGrades, true);
  mostrar(el.stepResult, false);
  mostrar(el.gradesAlert, false);
  actualizarMedidor();
  el.gradesList.querySelector('input')?.focus();
}

function leerFilas() {
  return [...el.gradesList.querySelectorAll('.grade-row')].map((fila) => ({
    nota: fila.querySelector('[data-campo="nota"]').value,
    porcentaje: fila.querySelector('[data-campo="porcentaje"]').value,
  }));
}

/** Validación en tiempo real de un input concreto. */
function validarInput(input, forzar = false) {
  const valor = input.value;
  const errorNodo = document.getElementById(input.getAttribute('aria-describedby'));
  // No marcar en rojo un campo vacío mientras el usuario aún no lo ha tocado.
  if (!forzar && valor.trim() === '') {
    setError(input, errorNodo, '');
    return true;
  }
  const v = input.dataset.campo === 'nota' ? validarNota(valor) : validarPorcentaje(valor);
  setError(input, errorNodo, v.ok ? '' : v.error);
  return v.ok;
}

function actualizarMedidor() {
  const porcentajes = leerFilas().map((f) => parseNumero(f.porcentaje));
  const p = estadoPorcentajes(porcentajes);
  el.pctFill.style.width = `${Math.min(p.suma, 100)}%`;
  el.pctText.textContent = `${p.suma}% de 100%`;
  el.pctMeter.dataset.state = p.ok ? 'ok' : p.sobrante ? 'over' : 'under';
}

function onGradesInput(evento) {
  const input = evento.target;
  if (!(input instanceof HTMLInputElement)) return;
  validarInput(input);
  if (input.dataset.campo === 'porcentaje') actualizarMedidor();
  mostrar(el.gradesAlert, false);
}

function onEqual() {
  const filas = [...el.gradesList.querySelectorAll('[data-campo="porcentaje"]')];
  repartoEquitativo(filas.length).forEach((p, i) => {
    filas[i].value = String(p);
    validarInput(filas[i]);
  });
  actualizarMedidor();
  mostrar(el.gradesAlert, false);
}

/* =========================================================
 * Estado 3: Cálculo, resultado y guardado
 * ========================================================= */

async function onCalcular(evento) {
  evento.preventDefault();
  const filas = leerFilas();
  const resultado = validarFormulario(filas);

  // Marcar todos los campos inválidos (FA-02 / FA-03)
  el.gradesList.querySelectorAll('input').forEach((input) => validarInput(input, true));

  if (!resultado.ok) {
    const mensajes = [];
    if (resultado.errores.length > 0) {
      mensajes.push('Corrige los campos resaltados: todas las notas deben estar entre 0.0 y 5.0 y los porcentajes ser mayores que 0.');
    }
    if (!resultado.porcentajes.ok) mensajes.push(resultado.porcentajes.mensaje); // FA-01
    el.gradesAlert.innerHTML = mensajes.map((m) => `<p>${m}</p>`).join('');
    mostrar(el.gradesAlert, true);
    mostrar(el.stepResult, false);
    const primero = el.gradesList.querySelector('.is-invalid');
    (primero || el.gradesList.querySelector('[data-campo="porcentaje"]'))?.focus();
    return;
  }

  mostrar(el.gradesAlert, false);
  const { notaDefinitiva, estado: estadoAcad } = calcularDefinitiva(resultado.notas);
  renderResultado(notaDefinitiva, estadoAcad, resultado.notas.length);

  try {
    await db.guardarCalculo({
      documento: estado.usuario.documento,
      notas: resultado.notas,
      notaDefinitiva,
      estado: estadoAcad,
    });
    await renderHistorial();
  } catch (err) {
    console.error(err);
    toast('El resultado no se pudo guardar en el historial.');
  }
}

function renderResultado(nota, estadoAcad, cantidad) {
  const aprobado = estadoAcad === 'Aprobado';
  el.resultValue.textContent = formatoNota(nota);
  el.resultBadge.textContent = estadoAcad;
  el.resultBadge.className = `badge ${aprobado ? 'badge--ok' : 'badge--fail'}`;
  el.stepResult.dataset.state = aprobado ? 'ok' : 'fail';
  el.resultDetail.textContent = aprobado
    ? `Promedio ponderado de ${cantidad} nota${cantidad > 1 ? 's' : ''}. Superaste el mínimo de ${NOTA_APROBATORIA.toFixed(1)}.`
    : `Promedio ponderado de ${cantidad} nota${cantidad > 1 ? 's' : ''}. Te faltaron ${formatoNota(NOTA_APROBATORIA - nota)} para aprobar.`;
  mostrar(el.stepResult, true);
  el.stepResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* =========================================================
 * Historial
 * ========================================================= */

async function renderHistorial() {
  const lista = await db.listarCalculos(estado.usuario.documento);
  el.historyList.innerHTML = '';
  mostrar(el.historyEmpty, lista.length === 0);
  mostrar(el.btnClearHistory, lista.length > 0);

  for (const c of lista) {
    const li = document.createElement('li');
    li.className = 'history__item';
    const aprobado = c.estado === 'Aprobado';
    const detalle = c.notas.map((n) => `${formatoNota(n.valor)} × ${n.porcentaje}%`).join(' · ');
    li.innerHTML = `
      <div class="history__top">
        <span class="history__score ${aprobado ? 'is-ok' : 'is-fail'}">${formatoNota(c.notaDefinitiva)}</span>
        <span class="badge badge--sm ${aprobado ? 'badge--ok' : 'badge--fail'}">${c.estado}</span>
      </div>
      <p class="history__detail"></p>
      <div class="history__bottom">
        <time datetime="${c.fecha}">${formatoFecha(c.fecha)}</time>
        <span class="history__actions">
          <button type="button" class="btn btn--link" data-accion="cargar" data-id="${c.id}">Cargar</button>
          <button type="button" class="btn btn--link btn--danger" data-accion="eliminar" data-id="${c.id}">Eliminar</button>
        </span>
      </div>`;
    li.querySelector('.history__detail').textContent = detalle;
    li._calculo = c;
    el.historyList.appendChild(li);
  }
}

async function onHistoryClick(evento) {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;
  const item = boton.closest('.history__item');
  const calculo = item?._calculo;
  if (!calculo) return;

  if (boton.dataset.accion === 'eliminar') {
    await db.eliminarCalculo(calculo.id);
    await renderHistorial();
    toast('Cálculo eliminado.');
  } else if (boton.dataset.accion === 'cargar') {
    el.inputCount.value = calculo.notas.length;
    generarCampos(calculo.notas.length, calculo.notas);
    renderResultado(calculo.notaDefinitiva, calculo.estado, calculo.notas.length);
  }
}

async function onClearHistory() {
  if (!confirm('¿Borrar todo tu historial de cálculos? Esta acción no se puede deshacer.')) return;
  await db.borrarHistorial(estado.usuario.documento);
  await renderHistorial();
  toast('Historial borrado.');
}

/* =========================================================
 * Arranque: restaurar sesión si existe (caso borde: recarga)
 * ========================================================= */

async function iniciar() {
  if (!db.soportaIndexedDB()) {
    mostrar(el.unsupported, true);
    return;
  }

  el.formLogin.addEventListener('submit', onLogin);
  el.inputDoc.addEventListener('input', () => {
    // Solo dígitos mientras se escribe
    const limpio = el.inputDoc.value.replace(/\D/g, '');
    if (limpio !== el.inputDoc.value) el.inputDoc.value = limpio;
    setError(el.inputDoc, el.docError, '');
  });
  el.formRegister.addEventListener('submit', onRegister);
  el.btnRegisterCancel.addEventListener('click', irALogin);
  el.btnLogout.addEventListener('click', onLogout);
  el.formCount.addEventListener('submit', onCount);
  el.inputCount.addEventListener('input', () => setError(el.inputCount, el.countError, ''));
  el.gradesList.addEventListener('input', onGradesInput);
  el.gradesList.addEventListener('focusout', (e) => {
    if (e.target instanceof HTMLInputElement) validarInput(e.target);
  });
  el.formGrades.addEventListener('submit', onCalcular);
  el.btnReset.addEventListener('click', reiniciarPanel);
  el.btnEqual.addEventListener('click', onEqual);
  el.historyList.addEventListener('click', onHistoryClick);
  el.btnClearHistory.addEventListener('click', onClearHistory);

  try {
    await db.abrirDB();
    const sesion = await db.obtenerSesion();
    const usuario = sesion ? await db.obtenerUsuario(sesion.documento) : null;
    if (usuario) {
      estado.usuario = usuario;
      await irAlPanel();
    } else {
      if (sesion) await db.cerrarSesion(); // sesión huérfana
      irALogin();
    }
  } catch (err) {
    console.error(err);
    mostrar(el.unsupported, true);
  }
}

iniciar();
