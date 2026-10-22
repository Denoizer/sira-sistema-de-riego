/* =========================================================
   data.js — Datos iniciales, persistencia localStorage y CRUD
   Todos los datos viven en el navegador (localStorage).
   La estructura está pensada para migrar luego a una API REST.
   ========================================================= */

const DB = {
  KEYS: {
    zonas: 'sira_zonas',
    dispositivos: 'sira_dispositivos',
    riegos: 'sira_riegos',
    lecturas: 'sira_lecturas',
    clima: 'sira_clima',
    alertas: 'sira_alertas',
    config: 'sira_config',
    mantenimiento: 'sira_mantenimiento',
    fuentes: 'sira_fuentes_agua',
    bomba: 'sira_bomba',
    modelo: 'sira_modelo_ia',
    programas: 'sira_programas'
  },
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch (e) { console.warn('DB.get error en', key, e); return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error('DB.set error en', key, e); }
  }
};

/** IDs únicos: timestamp + aleatorio */
function uid() {
  return Math.floor(Date.now() * 1000 + Math.random() * 999);
}

function isoDaysAgo(n, h = 9, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const DEFAULT_CONFIG = {
  umbral_humedad_min: 30,
  umbral_humedad_max: 75,
  caudal_default_lpm: 16,
  hora_riego_matutino: '07:00',
  hora_riego_vespertino: '20:00',
  et0_factor_ajuste: 1.0,
  ia_min_registros: 5,
  ia_confianza_min: 60,
  zona_horaria: 'America/Santiago',
  umbral_presion_baja: 150,
  umbral_nivel_critico: 20,
  capacidad_pozo_litros: 50000,
  capacidad_tanque_litros: 30000
};

function defaultZonas() {
  return [
    { id: uid() + 1, nombre: 'Papa',    tipo_cultivo: 'Tubérculo', tipo_suelo: 'Franco',   extension_m2: 5000, coeficiente_cultivo_kc: 1.10, caudal_esperado_lpm: 18, estado: 'activa' },
    { id: uid() + 2, nombre: 'Trigo',   tipo_cultivo: 'Cereal',    tipo_suelo: 'Arcilloso', extension_m2: 4000, coeficiente_cultivo_kc: 1.10, caudal_esperado_lpm: 16, estado: 'activa' },
    { id: uid() + 3, nombre: 'Tomate',  tipo_cultivo: 'Hortaliza', tipo_suelo: 'Franco',   extension_m2: 2500, coeficiente_cultivo_kc: 1.20, caudal_esperado_lpm: 14, estado: 'activa' },
    { id: uid() + 4, nombre: 'Haba',    tipo_cultivo: 'Leguminosa', tipo_suelo: 'Franco arcilloso', extension_m2: 3000, coeficiente_cultivo_kc: 1.05, caudal_esperado_lpm: 20, estado: 'activa' },
    { id: uid() + 5, nombre: 'Cebolla', tipo_cultivo: 'Hortaliza', tipo_suelo: 'Arenoso',  extension_m2: 1800, coeficiente_cultivo_kc: 1.05, caudal_esperado_lpm: 12, estado: 'activa' }
  ];
}

function defaultDispositivos(zonas) {
  const z = id => zonas.find(zz => zz.nombre === id).id;
  const base = { tipo: 'valvula', modelo: 'Hunter PGV-101', fecha_instalacion: '2025-09-14', ultimo_mantenimiento: '2026-08-02' };
  return [
    { ...base, id: uid() + 11, nombre: 'V-01', numero_serie: 'PGV-0117', ubicacion: 'Sector norte', estado_operativo: 'activo',      zona_id: z('Papa') },
    { ...base, id: uid() + 12, nombre: 'V-02', numero_serie: 'PGV-0221', ubicacion: 'Sector oriente', estado_operativo: 'activo',    zona_id: z('Trigo') },
    { ...base, id: uid() + 13, nombre: 'V-03', numero_serie: 'PGV-0330', ubicacion: 'Sector poniente', estado_operativo: 'dañado',   zona_id: z('Cebolla') },
    { ...base, id: uid() + 14, nombre: 'V-04', numero_serie: 'PGV-0408', ubicacion: 'Sector sur', estado_operativo: 'activo',        zona_id: z('Haba') },
    { id: uid() + 15, nombre: 'SH-01', tipo: 'sensor_humedad', modelo: 'Capacitivo SEN0193', numero_serie: 'SH-5521', ubicacion: 'Zona Papa, 20 cm prof.', estado_operativo: 'activo', zona_id: z('Papa'), fecha_instalacion: '2025-10-01', ultimo_mantenimiento: '2026-07-15' },
    { id: uid() + 16, nombre: 'ST-01', tipo: 'sensor_temperatura', modelo: 'DS18B20', numero_serie: 'ST-7780', ubicacion: 'Zona Tomate', estado_operativo: 'activo', zona_id: z('Tomate'), fecha_instalacion: '2025-10-01', ultimo_mantenimiento: null },
    { id: uid() + 17, nombre: 'BP-01', tipo: 'bomba', modelo: 'Grundfos SQE-3', numero_serie: 'BP-2210', ubicacion: 'Estación de bombeo', estado_operativo: 'activo', zona_id: null, fecha_instalacion: '2024-03-20', ultimo_mantenimiento: '2026-05-11' },
    { id: uid() + 18, nombre: 'FL-01', tipo: 'flujometro', modelo: 'YF-S201', numero_serie: 'FL-0917', ubicacion: 'Salida de tanque', estado_operativo: 'activo', zona_id: null, fecha_instalacion: '2025-09-14', ultimo_mantenimiento: null }
  ];
}

function defaultRiegos(zonas, dispositivos) {
  const zid = n => zonas.find(z => z.nombre === n).id;
  const did = n => dispositivos.find(d => d.nombre === n).id;
  const plan = [
    ['Papa', 'V-01', 320, 13, 'manual', 8], ['Trigo', 'V-02', 280, 12, 'programado', 8],
    ['Tomate', 'V-01', 210, 11, 'manual', 9], ['Haba', 'V-04', 380, 12, 'ia_optimizado', 9],
    ['Cebolla', 'V-02', 190, 10, 'manual', 10], ['Papa', 'V-01', 350, 13, 'programado', 10],
    ['Trigo', 'V-02', 260, 11, 'ia_optimizado', 11], ['Tomate', 'V-01', 230, 12, 'programado', 11],
    ['Haba', 'V-04', 400, 14, 'manual', 12], ['Papa', 'V-01', 310, 12, 'ia_optimizado', 12],
    ['Trigo', 'V-02', 300, 12, 'manual', 13], ['Cebolla', 'V-02', 170, 9, 'programado', 13],
    ['Tomate', 'V-01', 240, 13, 'manual', 14], ['Haba', 'V-04', 360, 13, 'programado', 14],
    ['Papa', 'V-01', 330, 13, 'ia_optimizado', 14]
  ];
  return plan.map((p, i) => {
    const litros = p[2] + (i % 3) * 10;
    const dur = Math.round(litros / 15);
    return {
      id: uid() + 100 + i,
      zona_id: zid(p[0]), dispositivo_id: did(p[1]),
      tipo: p[4], estado: 'completado',
      fecha_inicio: isoDaysAgo(p[5] - 7, (i * 5) % 12 + 7), // (antes usaba p[6], que no existe -> fecha inválida y la app no arrancaba)
      fecha_fin: null, duracion_estimada_min: dur, duracion_minutos: dur,
      cantidad_agua_litros: litros, cantidad_programada_litros: litros,
      motivo_riego: p[4] === 'ia_optimizado' ? 'Optimización IA (ETc + historial)' : (p[4] === 'programado' ? 'Riego programado' : 'Riego manual'),
      eficiencia: 90 + (i % 8)
    };
  });
}

function defaultLecturas(dispositivos) {
  const sh = dispositivos.find(d => d.nombre === 'SH-01').id;
  const st = dispositivos.find(d => d.nombre === 'ST-01').id;
  const arr = [];
  for (let i = 0; i < 20; i++) {
    const esSH = i % 2 === 0;
    let valor, tipo, unidad, anomalia = false;
    if (esSH) { tipo = 'humedad'; unidad = '%'; valor = 18 + Math.round(Math.random() * 30); }
    else { tipo = 'temperatura'; unidad = '°C'; valor = Math.round((6 + Math.random() * 26) * 10) / 10; }
    if (i === 6) { valor = 4; anomalia = true; }   // anomalía 1: humedad muy baja
    if (i === 15) { valor = 61.5; anomalia = true; } // anomalía 2: temperatura fuera de rango
    arr.push({
      id: uid() + 200 + i,
      dispositivo_id: esSH ? sh : st,
      tipo_sensor: tipo, valor, unidad,
      fecha_hora: isoDaysAgo(Math.floor(i / 6), 8 + (i % 10)),
      anomalia
    });
  }
  return arr;
}

function defaultClima() {
  const cielos = ['soleado', 'parcial', 'nublado', 'lluvia', 'soleado'];
  const historial = [];
  for (let i = 5; i >= 1; i--) {
    historial.push({
      fecha: isoDaysAgo(i).slice(0, 10),
      temp_max: 22 + Math.round(Math.random() * 8),
      temp_min: 6 + Math.round(Math.random() * 6),
      humedad: 38 + Math.round(Math.random() * 30),
      radiacion: +(10 + Math.random() * 10).toFixed(1),
      viento: +(5 + Math.random() * 12).toFixed(1),
      precipitacion_mm: Math.random() > .6 ? +(2 + Math.random() * 6).toFixed(1) : 0,
      cielo: cielos[i % 5]
    });
  }
  const pronostico = [];
  const icons = ['☀️', '⛅', '🌧️', '🌤️', '⛅'];
  for (let i = 1; i <= 5; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    pronostico.push({
      fecha: d.toISOString().slice(0, 10),
      temp_max: 20 + Math.round(Math.random() * 10),
      temp_min: 5 + Math.round(Math.random() * 8),
      lluvia_pct: Math.round(Math.random() * 80),
      cielo: icons[i - 1]
    });
  }
  return {
    actual: {
      temperatura: 24.6, humedad: 42, radiacion: 16.4, viento: 8.5,
      direccion_viento: 'SW', presion: 1013.2, cielo: 'soleado',
      actualizado: new Date().toISOString()
    },
    historial, pronostico
  };
}

function defaultFuentes(config) {
  const now = new Date().toISOString();
  return [
    { id: uid() + 31, nombre: 'Pozo principal', tipo: 'pozo', capacidad_total_litros: config.capacidad_pozo_litros, nivel_actual_litros: config.capacidad_pozo_litros * 0.80, caudal_entrada_lpm: 22, caudal_salida_lpm: 0, estado: 'normal', bomba_succion: true, ultima_actualizacion: now },
    { id: uid() + 32, nombre: 'Canal de derivación', tipo: 'rio', capacidad_total_litros: 0, nivel_actual_litros: 0, caudal_entrada_lpm: 30, caudal_salida_lpm: 0, estado: 'normal', bomba_succion: false, ultima_actualizacion: now },
    { id: uid() + 33, nombre: 'Tanque de almacenamiento', tipo: 'tanque', capacidad_total_litros: config.capacidad_tanque_litros, nivel_actual_litros: config.capacidad_tanque_litros * 0.65, caudal_entrada_lpm: 0, caudal_salida_lpm: 0, estado: 'normal', bomba_succion: false, ultima_actualizacion: now }
  ];
}

const defaultBomba = () => ({ activa: true, presion_kpa: 320, horas_operacion: 1240.5 });

function defaultMantenimiento(dispositivos) {
  const v03 = dispositivos.find(d => d.nombre === 'V-03').id;
  const bp = dispositivos.find(d => d.nombre === 'BP-01').id;
  return [
    { id: uid() + 41, dispositivo_id: v03, tipo_falla: 'mecanica', descripcion: 'Fuga en cuerpo de válvula: se requiere empaque y tuerca de ajuste nuevos.', estado: 'pendiente', fecha_reporte: isoDaysAgo(2, 11), tecnico: 'J. Pérez' },
    { id: uid() + 42, dispositivo_id: bp, tipo_falla: 'calibracion', descripcion: 'Calibración anual del presostato y verificación de amperaje.', estado: 'en_proceso', fecha_reporte: isoDaysAgo(5, 9), tecnico: 'M. Soto' }
  ];
}

function defaultAlertas(zonas, dispositivos) {
  const zid = n => zonas.find(z => z.nombre === n).id;
  const did = n => dispositivos.find(d => d.nombre === n).id;
  return [
    { id: uid() + 51, tipo: 'dispositivo_danado', mensaje: 'Distribuidor V-03 reportado con fuga. Mantener apagado hasta reparación.', zona_id: zid('Cebolla'), dispositivo_id: did('V-03'), prioridad: 'alta', fecha_hora: isoDaysAgo(2, 11), leida: false },
    { id: uid() + 52, tipo: 'anomalia_sensor', mensaje: 'Lectura anómala: temperatura 61.5 °C fuera de rango (ST-01).', zona_id: zid('Tomate'), dispositivo_id: did('ST-01'), prioridad: 'alta', fecha_hora: isoDaysAgo(1, 14), leida: false },
    { id: uid() + 53, tipo: 'riego_finalizado', mensaje: 'Riego completado en zona Papa (330 L, 22 min).', zona_id: zid('Papa'), dispositivo_id: null, prioridad: 'baja', fecha_hora: isoDaysAgo(1, 9), leida: true },
    { id: uid() + 54, tipo: 'clima', mensaje: 'Sequía pronosticada para los próximos 3 días. Ajustar programa de riego.', zona_id: null, dispositivo_id: null, prioridad: 'media', fecha_hora: isoDaysAgo(1, 8), leida: true },
    { id: uid() + 55, tipo: 'ia', mensaje: 'Modelo IA sugiere riego extendido en zona Haba.', zona_id: zid('Haba'), dispositivo_id: null, prioridad: 'media', fecha_hora: isoDaysAgo(2, 8), leida: true },
    { id: uid() + 56, tipo: 'prediccion_lluvia', mensaje: '60% de probabilidad de lluvia en 48 horas.', zona_id: null, dispositivo_id: null, prioridad: 'baja', fecha_hora: isoDaysAgo(3, 10), leida: true },
    { id: uid() + 57, tipo: 'fuente_agua', mensaje: 'Nivel del tanque bajo del 50%. Verificar entrada desde pozo.', zona_id: null, dispositivo_id: null, prioridad: 'media', fecha_hora: isoDaysAgo(4, 18), leida: true },
    { id: uid() + 58, tipo: 'riego_iniciado', mensaje: 'Riego programado iniciado en zona Trigo.', zona_id: zid('Trigo'), dispositivo_id: did('V-02'), prioridad: 'baja', fecha_hora: isoDaysAgo(5, 7), leida: true }
  ];
}

function defaultProgramas(zonas, dispositivos) {
  const z = zonas.find(x => x.nombre === 'Trigo');
  const d = dispositivos.find(x => x.nombre === 'V-02');
  const f = new Date(); f.setDate(f.getDate() + 1); f.setHours(7, 0, 0, 0);
  return [{ id: uid() + 61, zona_id: z.id, dispositivo_id: d.id, litros: 300, fecha_hora: f.toISOString(), repeticion: 'una_vez', notas: 'Riego matutino de apoyo', activo: true }];
}

/** Carga todos los datos iniciales (primera vez o demo) */
function cargarDatosIniciales() {
  const config = { ...DEFAULT_CONFIG };
  const zonas = defaultZonas();
  const dispositivos = defaultDispositivos(zonas);
  const riegos = defaultRiegos(zonas, dispositivos);
  const clima = defaultClima();
  DB.set(DB.KEYS.config, config);
  DB.set(DB.KEYS.zonas, zonas);
  DB.set(DB.KEYS.dispositivos, dispositivos);
  DB.set(DB.KEYS.riegos, riegos);
  DB.set(DB.KEYS.lecturas, defaultLecturas(dispositivos));
  DB.set(DB.KEYS.clima, clima);
  DB.set(DB.KEYS.fuentes, defaultFuentes(config));
  DB.set(DB.KEYS.bomba, defaultBomba());
  DB.set(DB.KEYS.mantenimiento, defaultMantenimiento(dispositivos));
  DB.set(DB.KEYS.alertas, defaultAlertas(zonas, dispositivos));
  DB.set(DB.KEYS.programas, defaultProgramas(zonas, dispositivos));
  DB.set(DB.KEYS.modelo, null);
}

function seedIfNeeded() {
  if (!localStorage.getItem(DB.KEYS.config)) cargarDatosIniciales();
}

function generarDatosDemo() {
  cargarDatosIniciales();
}

function resetSistema() {
  Object.values(DB.KEYS).forEach(k => localStorage.removeItem(k));
  cargarDatosIniciales();
}

/* ===== Helpers de acceso ===== */
function getConfig() { return DB.get(DB.KEYS.config, { ...DEFAULT_CONFIG }); }
function getZonas() { return DB.get(DB.KEYS.zonas, []); }
function getDispositivos() { return DB.get(DB.KEYS.dispositivos, []); }
function getRiegos() { return DB.get(DB.KEYS.riegos, []); }
function getFuentes() { return DB.get(DB.KEYS.fuentes, []); }
function getBomba() { return DB.get(DB.KEYS.bomba, defaultBomba()); }
function zonaById(id) { return getZonas().find(z => z.id === Number(id)) || null; }
function dispById(id) { return getDispositivos().find(d => d.id === Number(id)) || null; }
function dispCaudal(id) {
  const d = dispById(id);
  return d && d.caudal_lpm ? d.caudal_lpm : getConfig().caudal_default_lpm;
}

/* ===== Exportar / Importar ===== */
function exportarDatos() {
  const data = { app: 'SIRA', version: 1, exportado: new Date().toISOString() };
  Object.values(DB.KEYS).forEach(k => { data[k] = DB.get(k, null); });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sira_backup_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function importarDatos(file, callback) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      let ok = 0;
      Object.values(DB.KEYS).forEach(k => {
        if (data[k] !== undefined) { DB.set(k, data[k]); ok++; }
      });
      callback && callback(ok > 0, ok);
    } catch (e) { callback && callback(false, 0); }
  };
  reader.readAsText(file);
}
