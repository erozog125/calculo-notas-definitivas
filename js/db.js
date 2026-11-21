/**
 * db.js — Capa de persistencia con IndexedDB nativa (envuelta en Promesas).
 *
 * Base de datos: "CalculoNotasDB" (versión 1)
 *  - usuarios : keyPath "documento"                 { documento, nombre, fechaRegistro }
 *  - calculos : keyPath "id" (autoIncrement)         { id, documento, notas[], notaDefinitiva, estado, fecha }
 *               índice "por_documento" sobre "documento"
 *  - sesion   : keyPath "clave"                      { clave: "activa", documento, inicio }
 *
 * La sesión también vive en IndexedDB (no en localStorage) para que sobreviva a recargas.
 */

const DB_NOMBRE = 'CalculoNotasDB';
const DB_VERSION = 1;
const CLAVE_SESION = 'activa';

let conexion = null;

export function soportaIndexedDB() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/** Abre (o crea) la base de datos. Reutiliza la conexión si ya existe. */
export function abrirDB() {
  if (conexion) return Promise.resolve(conexion);

  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(DB_NOMBRE, DB_VERSION);

    // Solo se ejecuta al crear la BD o subir de versión: aquí se definen los ObjectStores.
    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains('usuarios')) {
        db.createObjectStore('usuarios', { keyPath: 'documento' });
      }
      if (!db.objectStoreNames.contains('calculos')) {
        const store = db.createObjectStore('calculos', { keyPath: 'id', autoIncrement: true });
        store.createIndex('por_documento', 'documento', { unique: false });
      }
      if (!db.objectStoreNames.contains('sesion')) {
        db.createObjectStore('sesion', { keyPath: 'clave' });
      }
    };

    solicitud.onsuccess = () => {
      conexion = solicitud.result;
      // Si otra pestaña actualiza la versión, cerramos para no bloquearla.
      conexion.onversionchange = () => {
        conexion.close();
        conexion = null;
      };
      resolve(conexion);
    };
    solicitud.onerror = () => reject(solicitud.error);
    solicitud.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
}

/** Convierte un IDBRequest en Promesa. */
function promesa(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Ejecuta una operación sobre un store y espera a que la transacción termine. */
async function conStore(nombre, modo, operacion) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(nombre, modo);
    const store = tx.objectStore(nombre);
    let resultado;
    Promise.resolve(operacion(store))
      .then((r) => { resultado = r; })
      .catch(reject);
    tx.oncomplete = () => resolve(resultado);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transacción abortada.'));
  });
}

/* ---------------- Usuarios ---------------- */

export function obtenerUsuario(documento) {
  return conStore('usuarios', 'readonly', (s) => promesa(s.get(documento)));
}

export function registrarUsuario(documento, nombre = '') {
  const usuario = {
    documento,
    nombre: nombre.trim(),
    fechaRegistro: new Date().toISOString(),
  };
  // add() falla si el documento ya existe: protege contra registros duplicados.
  return conStore('usuarios', 'readwrite', (s) => promesa(s.add(usuario))).then(() => usuario);
}

/* ---------------- Sesión ---------------- */

export function guardarSesion(documento) {
  const sesion = { clave: CLAVE_SESION, documento, inicio: new Date().toISOString() };
  return conStore('sesion', 'readwrite', (s) => promesa(s.put(sesion))).then(() => sesion);
}

export function obtenerSesion() {
  return conStore('sesion', 'readonly', (s) => promesa(s.get(CLAVE_SESION)));
}

export function cerrarSesion() {
  return conStore('sesion', 'readwrite', (s) => promesa(s.delete(CLAVE_SESION)));
}

/* ---------------- Cálculos (historial) ---------------- */

export function guardarCalculo({ documento, notas, notaDefinitiva, estado }) {
  const registro = {
    documento,
    notas: notas.map((n) => ({ valor: n.valor, porcentaje: n.porcentaje })),
    notaDefinitiva,
    estado,
    fecha: new Date().toISOString(),
  };
  return conStore('calculos', 'readwrite', (s) => promesa(s.add(registro))).then((id) => ({ id, ...registro }));
}

/** Historial del estudiante, del más reciente al más antiguo. */
export function listarCalculos(documento) {
  return conStore('calculos', 'readonly', (s) =>
    promesa(s.index('por_documento').getAll(IDBKeyRange.only(documento)))
  ).then((lista) => lista.sort((a, b) => b.id - a.id));
}

export function eliminarCalculo(id) {
  return conStore('calculos', 'readwrite', (s) => promesa(s.delete(id)));
}

export function borrarHistorial(documento) {
  // Se recorre con cursor para borrar dentro de la misma transacción sin depender de microtareas.
  return conStore('calculos', 'readwrite', (s) => new Promise((resolve, reject) => {
    const req = s.index('por_documento').openCursor(IDBKeyRange.only(documento));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  }));
}
