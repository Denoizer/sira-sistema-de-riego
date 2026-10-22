/* =========================================================
   app.js — Router SPA, interfaz, lógica de negocio y simuladores
   ========================================================= */

/* ===== Estado global ===== */
const SIM_SPEED = 20;               // aceleración de la simulación (20x)
let simOffset = 0;                  // desplazamiento temporal para "Avanzar 1 día"
const nowSim = () => new Date(Date.now() + simOffset);
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const state = {
  route: 'dashboard',
  params: null,
  histFilters: { zona: '', tipo: '', estado: '', desde: '', hasta: '' },
  alertaFilter: { prioridad: '', tipo: '' },
  iaZonaSel: null
};

/* ===== Formato ===== */
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return String(d.getDate()).padStart(2, '0') + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
}
function fmtFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return fmtFecha(iso) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function relativo(iso) {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace ' + Math.round(s) + ' seg';
  if (s < 3600) return 'hace ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'hace ' + Math.round(s / 3600) + ' h';
  return 'hace ' + Math.round(s / 86400) + ' d';
}
/** Fecha local AAAA-MM-DD (evita desfases por usar UTC con toISOString) */
function dayKey(v) {
  const d = v instanceof Date ? v : new Date(v);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/** ISO -> valor para <input type="datetime-local"> en hora local */
function toLocalInput(iso) {
  const d = new Date(iso);
  return dayKey(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function zonaName(id) { const z = zonaById(id); return z ? z.nombre : '—'; }
function dispName(id) { const d = dispById(id); return d ? d.nombre : '—'; }

/* ===== Pills de estado ===== */
function pill(txt, cls) { return '<span class="pill ' + cls + '">' + txt + '</span>'; }
function pillEstadoDisp(d) {
  const map = { activo: ['Activo', 'pill--success'], inactivo: ['Inactivo', 'pill--muted'], mantenimiento: ['Mantenimiento', 'pill--warning'], dañado: ['Dañado', 'pill--danger'] };
  const m = map[d.estado_operativo] || ['—', 'pill--muted'];
  return pill(m[0], m[1]);
}
function pillPrioridad(p) {
  const map = { baja: 'pill--muted', media: 'pill--info', alta: 'pill--warning', critica: 'pill--danger' };
  return pill(p.charAt(0).toUpperCase() + p.slice(1), map[p] || 'pill--muted');
}
function pillEstadoRiego(r) {
  const map = { en_curso: ['En curso', 'pill--info'], completado: ['Completado', 'pill--success'], cancelado: ['Cancelado', 'pill--muted'], programado: ['Programado', 'pill--warning'] };
  const m = map[r.estado] || ['—', 'pill--muted'];
  return pill(m[0], m[1]);
}

/* ===== Navegación SPA ===== */
const ROUTES = {
  dashboard: { title: 'Dashboard', render: renderDashboard },
  zonas: { title: 'Zonas de Riego', render: renderZonas },
  zona: { title: 'Detalle de Zona', render: renderZonaDetail },
  distribuidores: { title: 'Distribuidores', render: renderDistribuidores },
  distribuidor: { title: 'Control de Distribuidor', render: renderDistribuidorDetail },
  agua: { title: 'Fuentes de Agua e Infraestructura', render: renderAgua },
  clima: { title: 'Clima y Necesidad Hídrica', render: renderClima },
  ia: { title: 'IA — Optimización de Riego', render: renderIA },
  historial: { title: 'Historial de Riegos', render: renderHistorial },
  dispositivos: { title: 'Dispositivos y Sensores', render: renderDispositivos },
  alertas: { title: 'Alertas y Notificaciones', render: renderAlertas },
  programacion: { title: 'Programación de Riegos', render: renderProgramacion },
  mantenimiento: { title: 'Mantenimiento', render: renderMantenimiento },
  configuracion: { title: 'Configuración del Sistema', render: renderConfig }
};

function navigate(route, params = null) {
  if (!ROUTES[route]) route = 'dashboard';
  state.route = route;
  state.params = params;
  const hash = '#' + route + (params != null ? '/' + params : '');
  if (window.location.hash !== hash) { state.ignoreHash = true; window.location.hash = hash; }
  $('#sectionTitle').textContent = ROUTES[route].title;
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === route || (route === 'zona' && a.dataset.route === 'zonas') || (route === 'distribuidor' && a.dataset.route === 'distribuidores')));
  $('#sidebar').classList.remove('open');
  render();
  window.scrollTo(0, 0);
  $('#view').focus({ preventScroll: true });
}

function parseHash() {
  const [route, param] = (window.location.hash || '#dashboard').slice(1).split('/');
  return { route: ROUTES[route] ? route : 'dashboard', params: param ? Number(param) : null };
}

function render() {
  const r = ROUTES[state.route];
  r.render(state.params);
  actualizarBadges();
  state.firma = firmaDatos();
}

/**
 * Re-renderiza la vista actual conservando la posición de scroll.
 * No interrumpe si hay un modal abierto o el usuario está escribiendo en un campo.
 */
function rerenderSilencioso(forzar = false) {
  if (!forzar) {
    if ($('#modalRoot').children.length) return false;
    const act = document.activeElement;
    if (act && $('#view').contains(act) && /^(INPUT|SELECT|TEXTAREA)$/.test(act.tagName) &&
        !['checkbox', 'radio', 'button', 'submit'].includes(act.type)) return false;
  }
  const y = window.scrollY;
  Charts.quiet = true;
  try { render(); } finally { Charts.quiet = false; }
  window.scrollTo(0, y);
  return true;
}

/**
 * Firma de los datos "estructurales": si cambia, la vista se vuelve a dibujar.
 * (El avance de litros cada segundo se actualiza en sitio con refreshLive.)
 */
function firmaDatos() {
  const raw = k => localStorage.getItem(k) || '';
  const riegos = getRiegos().map(r => r.id + ':' + r.estado).join(',');
  const alertas = DB.get(DB.KEYS.alertas, []);
  const pozo = fuente('pozo') || {};
  const clima = DB.get(DB.KEYS.clima, null);
  const b = getBomba();
  return [
    raw(DB.KEYS.zonas), raw(DB.KEYS.dispositivos), raw(DB.KEYS.programas), raw(DB.KEYS.mantenimiento),
    raw(DB.KEYS.config), raw(DB.KEYS.modelo), riegos,
    alertas.length + '/' + alertas.filter(a => !a.leida).length + '/' + (alertas[0] ? alertas[0].id : ''),
    b.activa + '/' + pozo.caudal_entrada_lpm,
    clima ? clima.actual.actualizado : '',
    state.route === 'dispositivos' ? (DB.get(DB.KEYS.lecturas, [])[0] || {}).id : '',
    simOffset
  ].join('|');
}

/** Llamar después de cualquier cambio: refresca la vista si los datos cambiaron */
function sincronizarVista(forzar = false) {
  const f = firmaDatos();
  if (f !== state.firma || forzar) {
    if (rerenderSilencioso(forzar)) state.firma = f;
  }
  actualizarBadges();
}

/* ===== Modal ===== */
function openModal(titulo, bodyHTML, opts = {}) {
  const root = $('#modalRoot');
  root.innerHTML =
    '<div class="modal-overlay" data-close>' +
      '<div class="modal' + (opts.wide ? ' modal--wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal__head"><h3>' + titulo + '</h3><button type="button" class="btn btn--icon btn--ghost" data-close>✕</button></div>' +
        '<form id="modalForm" class="modal__body" novalidate>' + bodyHTML +
          '<div class="modal__foot">' +
            '<button type="button" class="btn btn--ghost" data-close>Cancelar</button>' +
            '<button type="submit" class="btn btn--primary">' + (opts.submitLabel || 'Guardar') + '</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</div>';
  root.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', e => {
    if (el.classList.contains('modal-overlay')) { if (e.target === el) closeModal(); }
    else closeModal();
  }));
  if (opts.onOpen) opts.onOpen(root);
  const form = $('#modalForm');
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (opts.onSubmit) {
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      if (opts.onSubmit(data) === false) return;
    }
    closeModal();
  });
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ===== Cálculos del sistema ===== */
function riegosActivos() { return getRiegos().filter(r => r.estado === 'en_curso'); }

function aguaUsadaHoy() {
  const hoy = dayKey(new Date());
  let total = 0;
  getRiegos().forEach(r => {
    if (r.fecha_inicio && dayKey(r.fecha_inicio) === hoy && r.estado !== 'cancelado') {
      total += r.estado === 'en_curso'
        ? (r.cantidad_programada_litros - (r._restantes != null ? r._restantes : r.cantidad_programada_litros))
        : (r.cantidad_agua_litros || 0);
    }
  });
  return Math.round(total);
}

function aguaUsadaAyer() {
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  const key = dayKey(ayer);
  return Math.round(getRiegos()
    .filter(r => r.fecha_inicio && dayKey(r.fecha_inicio) === key && r.estado === 'completado')
    .reduce((s, r) => s + (r.cantidad_agua_litros || 0), 0));
}

function consumoPorDias(n = 7) {
  const labels = [], values = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dayKey(d);
    labels.push(String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'));
    values.push(Math.round(getRiegos()
      .filter(r => r.fecha_inicio && dayKey(r.fecha_inicio) === key && r.estado !== 'cancelado')
      .reduce((s, r) => s + (r.cantidad_agua_litros || litrosConsumidos(r)), 0)));
  }
  return { labels, values };
}

function fuente(tipo) { return getFuentes().find(f => f.tipo === tipo); }
function tanquePct() {
  const t = fuente('tanque');
  return t && t.capacidad_total_litros ? Math.round(100 * t.nivel_actual_litros / t.capacidad_total_litros) : 0;
}
function pozoPct() {
  const p = fuente('pozo');
  return p && p.capacidad_total_litros ? Math.round(100 * p.nivel_actual_litros / p.capacidad_total_litros) : 0;
}
function estadoGeneralSistema() {
  const bomb = getBomba();
  const t = fuente('tanque'), p = fuente('pozo');
  if (!bomb.activa || tanquePct() < getConfig().umbral_nivel_critico || (p && p.caudal_entrada_lpm === 0)) return 'critico';
  if (bomb.presion_kpa < getConfig().umbral_presion_baja || tanquePct() < 50) return 'advertencia';
  return 'normal';
}
function pillSistemaGeneral() {
  const e = estadoGeneralSistema();
  return e === 'normal' ? pill('● NORMAL', 'pill--success') : e === 'advertencia' ? pill('● ADVERTENCIA', 'pill--warning') : pill('● CRÍTICO', 'pill--danger');
}

/* =========================================================
   SECCIÓN: DASHBOARD
   ========================================================= */
function renderDashboard() {
  const activos = riegosActivos();
  const danados = getDispositivos().filter(d => d.estado_operativo === 'dañado').length;
  const noLeidas = alertasNoLeidas();
  const hoy = aguaUsadaHoy(), ayer = aguaUsadaAyer();
  const diff = ayer > 0 ? Math.round((hoy - ayer) / ayer * 100) : 0;
  const diffTxt = (diff >= 0 ? '+' : '') + diff + '% vs ayer';
  const alertas = DB.get(DB.KEYS.alertas, []).slice(0, 5);

  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="stats-grid">' +
      statCard('🚿', 'vActivos', activos, 'Riegos activos', activos > 0 ? '<span class="dot dot--info dot--live"></span> en curso' : 'sin riegos en curso', activos > 0 ? 'stat-card--warning' : '') +
      statCard('💧', 'vAguaHoy', hoy.toLocaleString('es-CL') + ' <small>L</small>', 'Agua utilizada hoy', diffTxt) +
      statCard('🔧', 'vFallas', danados, 'Dispositivos con falla', danados > 0 ? 'requieren atención' : 'todo operativo', danados > 0 ? 'stat-card--danger' : '') +
      statCard('🔔', 'vAlertas', noLeidas, 'Alertas sin leer', noLeidas > 0 ? 'pendientes de revisión' : 'bandeja limpia', noLeidas > 0 ? 'stat-card--warning' : '') +
    '</div>' +

    '<div class="card">' +
      '<div class="card__title">💧 Estado del Sistema de Agua <span style="margin-left:auto">' + pillSistemaGeneral() + '</span></div>' +
      '<div class="grid-2">' +
        nivelAguaRow('Pozo', 'barPozo', 'txtPozo', pozoPct(), fuente('pozo')) +
        nivelAguaRow('Tanque', 'barTanque', 'txtTanque', tanquePct(), fuente('tanque')) +
      '</div>' +
      '<hr class="divider">' +
      '<div class="flex-row" style="justify-content:space-between">' +
        '<div class="flex-row" style="gap:1.4rem">' +
          '<span class="hint">🔩 Bomba principal: <b id="txtBomba">—</b></span>' +
          '<span class="hint">📊 Presión: <b id="txtPresion">—</b></span>' +
          '<span class="hint">⏱️ Caudal de distribución: <b id="txtCaudal">—</b></span>' +
        '</div>' +
        '<button class="btn btn--secondary btn--sm" data-action="go" data-route="agua">Ver infraestructura →</button>' +
      '</div>' +
    '</div>' +

    '<div class="grid-2">' +
      '<div class="card"><div class="card__title">🚿 Riegos Activos</div><div id="liveActivos">' + htmlRiegosActivos(activos) + '</div></div>' +
      '<div class="card"><div class="card__title">🔔 Alertas Recientes <button class="btn btn--ghost btn--sm" data-action="go" data-route="alertas">Ver todas →</button></div>' +
        '<div id="liveAlertas">' + htmlAlertasRecientes(alertas) + '</div></div>' +
    '</div>' +

    '<div class="card"><div class="card__title">📊 Consumo de Agua — Últimos 7 días</div>' +
      '<div class="chart-wrap"><canvas id="chartConsumo"></canvas></div></div>' +

    '<div class="card"><div class="card__title">🍩 Distribución del Consumo por Zona (mes actual)</div>' +
      '<div class="chart-wrap"><canvas id="chartDonut"></canvas></div></div>' +
  '</div>';

  const c = consumoPorDias(7);
  Charts.bar($('#chartConsumo'), { labels: c.labels, values: c.values });
  const zonas = getZonas();
  const mes = dayKey(new Date()).slice(0, 7);
  const porZona = zonas.map(z => Math.round(getRiegos()
    .filter(r => r.zona_id === z.id && r.fecha_inicio && dayKey(r.fecha_inicio).slice(0, 7) === mes && r.estado === 'completado')
    .reduce((s, r) => s + (r.cantidad_agua_litros || 0), 0)));
  Charts.donut($('#chartDonut'), { labels: zonas.map(z => z.nombre), values: porZona });
  refreshLive();
}

function statCard(icono, idValor, valor, label, sub, extraCls) {
  return '<div class="stat-card ' + (extraCls || '') + '">' +
    '<div class="stat-card__icon">' + icono + '</div>' +
    '<div><div class="stat-card__value"' + (idValor ? ' id="' + idValor + '"' : '') + '>' + valor + '</div>' +
    '<div class="stat-card__label">' + label + '</div>' +
    '<div class="stat-card__sub">' + sub + '</div></div></div>';
}

function nivelAguaRow(nombre, idBar, idTxt, pct, f) {
  const cls = pct < 20 ? 'progress--danger' : pct < 50 ? 'progress--warning' : 'progress--success';
  return '<div>' +
    '<div class="flex-row" style="justify-content:space-between;margin-bottom:.35rem">' +
      '<span class="hint">' + nombre + '</span><b id="' + idTxt + '">' + pct + '% · ' + Math.round(f ? f.nivel_actual_litros : 0).toLocaleString('es-CL') + ' L</b></div>' +
    '<div class="progress ' + cls + '"><div class="progress__fill" id="' + idBar + '" style="width:' + pct + '%"></div></div></div>';
}

/* ===== Progreso de riegos en curso (se actualiza en sitio cada segundo) ===== */
function litrosConsumidos(r) {
  if (r.estado !== 'en_curso') return r.cantidad_agua_litros || 0;
  const rest = r._restantes != null ? r._restantes : r.cantidad_programada_litros;
  return Math.max(0, Math.round(r.cantidad_programada_litros - rest));
}
function progresoRiego(r) {
  const rest = Math.max(0, r._restantes != null ? r._restantes : r.cantidad_programada_litros);
  const pct = Math.min(100, Math.round(100 * (1 - rest / r.cantidad_programada_litros)));
  const caudal = r._caudal || dispCaudal(r.dispositivo_id);
  // tiempo real restante considerando la aceleración de la simulación
  const seg = Math.max(0, Math.ceil(rest / (caudal / 60) / SIM_SPEED));
  return {
    pct,
    texto: litrosConsumidos(r).toLocaleString('es-CL') + ' / ' + r.cantidad_programada_litros.toLocaleString('es-CL') +
      ' L · ' + pct + '% · ~' + Math.max(1, Math.round(rest / caudal)) + ' min de riego (' + seg + ' s simulados)'
  };
}
function htmlRiegoProgreso(r, conBoton = true, conTitulo = true) {
  const p = progresoRiego(r);
  return '<div class="riego-live" style="padding:.6rem 0;border-bottom:1px dashed var(--border)">' +
    '<div class="flex-row" style="justify-content:space-between">' +
      (conTitulo ? '<b>🌱 ' + esc(zonaName(r.zona_id)) + ' <span class="hint">· ' + esc(dispName(r.dispositivo_id)) + '</span> <span class="dot dot--info dot--live"></span></b>'
                 : '<b><span class="dot dot--info dot--live"></span> Riego en curso <span class="hint">· ' + esc(dispName(r.dispositivo_id)) + '</span></b>') +
      (conBoton ? '<button type="button" class="btn btn--danger btn--sm" data-action="detener-riego" data-id="' + r.id + '">⏹ DETENER</button>' : '') + '</div>' +
    '<div class="hint" style="margin:.25rem 0" data-riego-txt="' + r.id + '">' + p.texto + '</div>' +
    '<div class="progress progress--info"><div class="progress__fill" data-riego-bar="' + r.id + '" style="width:' + p.pct + '%;background:var(--info)"></div></div></div>';
}

function htmlRiegosActivos(activos) {
  if (!activos.length) {
    return '<div class="empty"><div class="empty__icon">🌵</div>No hay riegos en curso.<br>Active un distribuidor o programe un riego.</div>';
  }
  return activos.map(r => htmlRiegoProgreso(r)).join('');
}

function htmlAlertasRecientes(alertas) {
  if (!alertas.length) return '<div class="empty"><div class="empty__icon">✨</div>Sin alertas registradas.</div>';
  return alertas.map(a =>
    '<div class="flex-row" style="justify-content:space-between;padding:.5rem 0;border-bottom:1px dashed var(--border)">' +
      '<div style="min-width:0"><div style="font-size:.85rem">' + esc(a.mensaje) + '</div>' +
      '<div class="hint">' + (TIPO_ALERTA_LABEL[a.tipo] || a.tipo) + ' · ' + relativo(a.fecha_hora) + '</div></div>' +
      pillPrioridad(a.prioridad) + '</div>'
  ).join('');
}

/* =========================================================
   SECCIÓN: ZONAS
   ========================================================= */
function renderZonas() {
  const zonas = getZonas();
  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="flex-row" style="justify-content:space-between">' +
      '<p class="hint">' + zonas.length + ' zonas configuradas. Haga clic en una tarjeta para ver su detalle.</p>' +
      '<button class="btn btn--primary" data-action="nueva-zona">＋ Agregar Zona</button></div>' +
    '<div class="grid-3">' + zonas.map(z => {
      const riegoZ = riegosActivos().filter(r => r.zona_id === z.id);
      const disp = getDispositivos().filter(d => d.zona_id === z.id && d.tipo === 'valvula');
      return '<div class="card" style="cursor:pointer' + (z.estado !== 'activa' ? ';opacity:.7' : '') + '" data-action="ver-zona" data-id="' + z.id + '">' +
        '<div class="card__title">🌱 ' + esc(z.nombre) + ' ' + (riegoZ.length ? pill('Regando', 'pill--info') : '') +
          '<label class="toggle" style="margin-left:auto" title="' + (z.estado === 'activa' ? 'Desactivar zona' : 'Activar zona') + '" data-stop>' +
          '<input type="checkbox" data-action="toggle-zona" data-id="' + z.id + '" ' + (z.estado === 'activa' ? 'checked' : '') + '><span class="toggle__slider"></span></label></div>' +
        '<div class="kv"><span class="kv__k">Cultivo</span><span class="kv__v">' + esc(z.tipo_cultivo) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Suelo</span><span class="kv__v">' + esc(z.tipo_suelo) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Extensión</span><span class="kv__v">' + z.extension_m2.toLocaleString('es-CL') + ' m²</span></div>' +
        '<div class="kv"><span class="kv__k">Kc</span><span class="kv__v">' + z.coeficiente_cultivo_kc + '</span></div>' +
        '<div class="kv"><span class="kv__k">Estado</span><span class="kv__v">' + (z.estado === 'activa' ? pill('Activa', 'pill--success') : pill('Inactiva', 'pill--muted')) + '</span></div>' +
        '<div class="hint" style="margin-top:.5rem">' + disp.length + ' distribuidor(es) asignado(s)</div>' +
        riegoZ.map(r => htmlRiegoProgreso(r, false, false)).join('') +
        '<div class="actions-row" style="margin-top:.7rem">' +
          (riegoZ.length
            ? '<button type="button" class="btn btn--danger btn--sm" data-action="detener-riego" data-id="' + riegoZ[0].id + '">⏹ Detener Riego</button>'
            : '<button type="button" class="btn btn--secondary btn--sm" data-action="regar-ahora" data-id="' + z.id + '" ' + (z.estado !== 'activa' ? 'disabled title="Zona inactiva"' : '') + '>💧 Regar Ahora</button>') +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="editar-zona" data-id="' + z.id + '">✏️ Editar</button>' +
        '</div></div>';
    }).join('') + '</div></div>';
}

function zonaFormHTML(z) {
  z = z || {};
  return '<div class="form-grid">' +
    fRow('Nombre', '<input name="nombre" required value="' + esc(z.nombre || '') + '" placeholder="Ej: Papa">') +
    fRow('Tipo de cultivo', '<input name="tipo_cultivo" required value="' + esc(z.tipo_cultivo || '') + '" placeholder="Ej: Cereal">') +
    fRow('Tipo de suelo', '<select name="tipo_suelo">' + ['Franco', 'Arcilloso', 'Arenoso', 'Franco arcilloso', 'Franco arenoso'].map(t => '<option ' + (z.tipo_suelo === t ? 'selected' : '') + '>' + t + '</option>').join('') + '</select>') +
    fRow('Extensión (m²)', '<input type="number" name="extension_m2" min="10" required value="' + (z.extension_m2 || '') + '">') +
    fRow('Coeficiente Kc', '<input type="number" step="0.01" min="0.2" max="1.4" name="coeficiente_cultivo_kc" required value="' + (z.coeficiente_cultivo_kc || 1.1) + '">') +
    fRow('Caudal esperado (L/min)', '<input type="number" name="caudal_esperado_lpm" min="1" value="' + (z.caudal_esperado_lpm || getConfig().caudal_default_lpm) + '">') +
    fRow('Estado', '<select name="estado"><option value="activa" ' + (z.estado !== 'inactiva' ? 'selected' : '') + '>Activa</option><option value="inactiva" ' + (z.estado === 'inactiva' ? 'selected' : '') + '>Inactiva</option></select>') +
  '</div>';
}
function fRow(label, input) { return '<div class="form-row"><label>' + label + '</label>' + input + '</div>'; }

function renderZonaDetail(id) {
  const z = zonaById(id);
  if (!z) { navigate('zonas'); return; }
  const riegos = getRiegos().filter(r => r.zona_id === z.id).sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
  const disp = getDispositivos().filter(d => d.zona_id === z.id && d.tipo === 'valvula');
  const pred = IAEstudio.predecirRiego(z.id, 3);
  const nec = IAEstudio.necesidadLitros(z);
  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<button class="btn btn--ghost btn--sm" data-action="go" data-route="zonas">← Volver a zonas</button>' +
    '<div class="card card--pad-lg">' +
      '<div class="card__title" style="font-size:1.4rem">🌱 ' + esc(z.nombre) + ' ' + (z.estado === 'activa' ? pill('Activa', 'pill--success') : pill('Inactiva', 'pill--muted')) + '</div>' +
      '<div class="grid-3">' +
        '<div><div class="kv"><span class="kv__k">Cultivo</span><span class="kv__v">' + esc(z.tipo_cultivo) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Suelo</span><span class="kv__v">' + esc(z.tipo_suelo) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Extensión</span><span class="kv__v">' + z.extension_m2.toLocaleString('es-CL') + ' m²</span></div></div>' +
        '<div><div class="kv"><span class="kv__k">Kc</span><span class="kv__v">' + z.coeficiente_cultivo_kc + '</span></div>' +
        '<div class="kv"><span class="kv__k">Caudal esperado</span><span class="kv__v">' + (z.caudal_esperado_lpm || getConfig().caudal_default_lpm) + ' L/min</span></div>' +
        '<div class="kv"><span class="kv__k">Riegos históricos</span><span class="kv__v">' + riegos.length + '</span></div></div>' +
        '<div><div class="kv"><span class="kv__k">ET0 (hoy)</span><span class="kv__v">' + (nec ? nec.ET0 : '—') + ' mm/día</span></div>' +
        '<div class="kv"><span class="kv__k">ETc (hoy)</span><span class="kv__v">' + (nec ? nec.ETc : '—') + ' mm/día</span></div>' +
        '<div class="kv"><span class="kv__k">Necesidad hoy</span><span class="kv__v">' + (nec ? nec.litros.toLocaleString('es-CL') + ' L' : '—') + '</span></div></div>' +
      '</div>' +
      riegosActivos().filter(r => r.zona_id === z.id).map(r => htmlRiegoProgreso(r, true, false)).join('') +
      '<div class="actions-row" style="margin-top:1rem">' +
        '<button type="button" class="btn btn--primary" data-action="regar-ahora" data-id="' + z.id + '" ' + (z.estado !== 'activa' ? 'disabled title="Zona inactiva"' : '') + '>💧 Regar Ahora</button>' +
        '<button type="button" class="btn btn--secondary" data-action="editar-zona" data-id="' + z.id + '">✏️ Editar Zona</button>' +
        '<button type="button" class="btn ' + (z.estado === 'activa' ? 'btn--warning' : 'btn--secondary') + '" data-action="estado-zona" data-id="' + z.id + '">' + (z.estado === 'activa' ? '⏸ Desactivar Zona' : '▶ Activar Zona') + '</button>' +
      '</div></div>' +

    '<div class="grid-2">' +
      '<div class="card"><div class="card__title">🚰 Distribuidores Asignados</div>' +
        (disp.length ? disp.map(d => '<div class="flex-row" style="justify-content:space-between;padding:.5rem 0;border-bottom:1px dashed var(--border);flex-wrap:wrap">' +
          '<span>🔩 <b>' + esc(d.nombre) + '</b> <span class="hint">' + esc(d.ubicacion) + '</span></span>' +
          '<span class="flex-row">' + (riegosActivos().some(r => r.dispositivo_id === d.id) ? pill('En riego', 'pill--info') + '<span class="dot dot--info dot--live"></span>' : pillEstadoDisp(d)) +
          '<button class="btn btn--ghost btn--sm" data-action="ver-distribuidor" data-id="' + d.id + '">Control →</button></span></div>').join('')
        : '<div class="empty"><div class="empty__icon">🔩</div>Sin distribuidores asignados.</div>') +
      '</div>' +
      '<div class="card"><div class="card__title">🤖 Predicción IA — Próximos 3 días</div>' +
        (pred.length ? '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Necesidad</th><th>Litros</th><th>Duración</th><th>Recomendación</th></tr></thead><tbody>' +
          pred.map(p => '<tr><td>' + fmtFecha(p.fecha) + '</td>' +
            '<td>' + (p.necesita ? pill('Sí', 'pill--success') : pill('No', 'pill--muted')) + '</td>' +
            '<td>' + p.litros.toLocaleString('es-CL') + ' L</td><td>' + p.duracion_min + ' min</td>' +
            '<td>' + pill(p.recomendacion_label, p.pill) + '</td></tr>').join('') +
          '</tbody></table></div>' +
          '<p class="section-note">Confianza del modelo: <b>' + IAEstudio.confianzaModelo() + '%</b> (entrenar en la sección IA para mejorar).</p>'
        : '<div class="empty"><div class="empty__icon">🤖</div>Sin predicción disponible.</div>') +
      '</div>' +
    '</div>' +

    '<div class="card"><div class="card__title">📅 Riegos Programados de la Zona <button type="button" class="btn btn--secondary btn--sm" style="margin-left:auto" data-action="programar-zona" data-id="' + z.id + '">＋ Programar</button></div>' +
      htmlListaProgramas(DB.get(DB.KEYS.programas, []).filter(p => p.activo && p.zona_id === z.id).sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora)), true) + '</div>' +

    '<div class="card"><div class="card__title">📋 Historial de Riegos de la Zona</div>' +
      (riegos.length ? '<div class="table-wrap"><table><thead><tr><th>Inicio</th><th>Distribuidor</th><th>Tipo</th><th>Duración</th><th>Agua</th><th>Estado</th></tr></thead><tbody>' +
        riegos.slice(0, 12).map(r => '<tr><td>' + fmtFechaHora(r.fecha_inicio) + '</td><td>' + esc(dispName(r.dispositivo_id)) + '</td>' +
          '<td>' + esc(r.tipo) + '</td><td>' + (r.duracion_minutos || r.duracion_estimada_min) + ' min</td>' +
          '<td>' + (r.cantidad_agua_litros || r.cantidad_programada_litros) + ' L</td><td>' + pillEstadoRiego(r) + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty"><div class="empty__icon">📋</div>Aún no hay riegos registrados en esta zona.</div>') +
    '</div>' +
  '</div>';
}

/* =========================================================
   SECCIÓN: DISTRIBUIDORES
   ========================================================= */
function renderDistribuidores() {
  const valvulas = getDispositivos().filter(d => d.tipo === 'valvula');
  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<p class="hint">' + valvulas.length + ' distribuidores. Active, desactive, riegue ahora o programe horarios.</p>' +
    '<div class="grid-3" id="distGrid">' + htmlDistribuidoresGrid(valvulas) + '</div></div>';
}

function htmlDistribuidoresGrid(valvulas) {
  return valvulas.map(d => {
    const riegoD = riegosActivos().find(r => r.dispositivo_id === d.id);
    const enRiego = !!riegoD;
    const programas = DB.get(DB.KEYS.programas, []).filter(p => p.dispositivo_id === d.id && p.activo).sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
    return '<div class="card device-card">' +
      '<div class="device-card__head">' +
        '<span style="font-size:1.4rem">' + (enRiego ? '🟢' : d.estado_operativo === 'dañado' ? '🔴' : '⚪') + '</span>' +
        '<div><div class="device-card__name">🔩 ' + esc(d.nombre) + '</div>' +
        '<div class="device-card__meta">' + esc(d.ubicacion) + ' · ' + esc(zonaName(d.zona_id)) + '</div></div>' +
        '<span style="margin-left:auto">' + (enRiego ? pill('En riego', 'pill--info') + ' <span class="dot dot--info dot--live"></span>' : pillEstadoDisp(d)) + '</span></div>' +
      '<div class="device-card__meta">Modelo ' + esc(d.modelo) + ' · ' + esc(d.numero_serie) + '</div>' +
      (programas.length ? '<div class="device-card__meta">📅 Próximo: ' + fmtFechaHora(programas[0].fecha_hora) + ' (' + programas[0].litros + ' L) ' +
        '<button type="button" class="btn btn--ghost btn--sm" data-action="editar-programa" data-id="' + programas[0].id + '">✏️ Editar hora</button></div>' : '') +
      (riegoD ? htmlRiegoProgreso(riegoD, false, false) : '') +
      '<div class="flex-row" style="justify-content:space-between;margin-top:.2rem">' +
        '<label class="toggle" title="' + (d.estado_operativo === 'dañado' ? 'Dañado: reparar en Mantenimiento' : 'Activar/desactivar') + '"><input type="checkbox" data-action="toggle-dispositivo" data-id="' + d.id + '" ' + (d.estado_operativo === 'activo' ? 'checked' : '') + ' ' + (d.estado_operativo === 'dañado' ? 'disabled' : '') + '><span class="toggle__slider"></span></label>' +
        '<div class="actions-row">' +
          (enRiego
            ? '<button type="button" class="btn btn--danger btn--sm" data-action="detener-riego" data-id="' + riegoD.id + '">⏹ Detener</button>'
            : '<button type="button" class="btn btn--primary btn--sm" data-action="activar-distribuidor" data-id="' + d.id + '" ' + (d.estado_operativo !== 'activo' ? 'disabled' : '') + '>Activar Ahora</button>') +
          '<button type="button" class="btn btn--secondary btn--sm" data-action="programar-distribuidor" data-id="' + d.id + '" ' + (d.estado_operativo === 'dañado' ? 'disabled' : '') + '>Programar</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="ver-distribuidor" data-id="' + d.id + '">Detalle</button>' +
        '</div></div></div>';
  }).join('');
}

function renderDistribuidorDetail(id) {
  const d = dispById(id);
  if (!d) { navigate('distribuidores'); return; }
  const historial = getRiegos().filter(r => r.dispositivo_id === d.id).sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
  const enRiego = riegosActivos().find(r => r.dispositivo_id === d.id);
  const programas = DB.get(DB.KEYS.programas, []).filter(p => p.dispositivo_id === d.id && p.activo);
  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<button class="btn btn--ghost btn--sm" data-action="go" data-route="distribuidores">← Volver a distribuidores</button>' +
    '<div class="card card--pad-lg">' +
      '<div class="card__title" style="font-size:1.35rem">🔩 ' + esc(d.nombre) + ' ' + (enRiego ? pill('En riego', 'pill--info') : pillEstadoDisp(d)) + '</div>' +
      '<div class="grid-3">' +
        '<div><div class="kv"><span class="kv__k">Zona asignada</span><span class="kv__v">' + esc(zonaName(d.zona_id)) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Ubicación</span><span class="kv__v">' + esc(d.ubicacion) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Modelo</span><span class="kv__v">' + esc(d.modelo) + '</span></div></div>' +
        '<div><div class="kv"><span class="kv__k">N° serie</span><span class="kv__v">' + esc(d.numero_serie) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Instalación</span><span class="kv__v">' + fmtFecha(d.fecha_instalacion) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Último mantenimiento</span><span class="kv__v">' + fmtFecha(d.ultimo_mantenimiento) + '</span></div></div>' +
        '<div><div class="kv"><span class="kv__k">Última activación</span><span class="kv__v">' + (historial.length ? fmtFechaHora(historial[0].fecha_inicio) : '—') + '</span></div>' +
        '<div class="kv"><span class="kv__k">Riegos realizados</span><span class="kv__v">' + historial.length + '</span></div>' +
        '<div class="kv"><span class="kv__k">Caudal</span><span class="kv__v">' + dispCaudal(d.id) + ' L/min</span></div></div>' +
      '</div>' +
      '<div class="actions-row" style="margin-top:1rem">' +
        '<button type="button" class="btn btn--primary" data-action="activar-distribuidor" data-id="' + d.id + '" ' + (d.estado_operativo !== 'activo' || enRiego ? 'disabled' : '') + '>▶ Activar Ahora</button>' +
        '<button type="button" class="btn btn--secondary" data-action="programar-distribuidor" data-id="' + d.id + '" ' + (d.estado_operativo === 'dañado' ? 'disabled' : '') + '>📅 Programar</button>' +
        (enRiego ? '<button type="button" class="btn btn--danger" data-action="detener-riego" data-id="' + enRiego.id + '">⏹ Detener Riego</button>' : '') +
      '</div>' +
      (enRiego ? htmlRiegoProgreso(enRiego, false, false) : '') +
    '</div>' +
    '<div class="grid-2">' +
      '<div class="card"><div class="card__title">📅 Programaciones Activas</div>' +
        htmlListaProgramas(programas) + '</div>' +
      '<div class="card"><div class="card__title">📋 Historial de Activaciones</div>' +
        (historial.length ? '<div class="table-wrap"><table><thead><tr><th>Inicio</th><th>Tipo</th><th>Agua</th><th>Estado</th></tr></thead><tbody>' +
          historial.slice(0, 10).map(r => '<tr><td>' + fmtFechaHora(r.fecha_inicio) + '</td><td>' + esc(r.tipo) + '</td><td>' + (r.cantidad_agua_litros || r.cantidad_programada_litros) + ' L</td><td>' + pillEstadoRiego(r) + '</td></tr>').join('') +
          '</tbody></table></div>' : '<div class="empty"><div class="empty__icon">📋</div>Sin activaciones registradas.</div>') + '</div>' +
    '</div></div>';
}

/* =========================================================
   SECCIÓN: AGUA
   ========================================================= */
function renderAgua() {
  const f = getFuentes();
  const pozo = f.find(x => x.tipo === 'pozo'), rio = f.find(x => x.tipo === 'rio'), tanque = f.find(x => x.tipo === 'tanque');
  const b = getBomba();
  const pp = pozoPct(), tp = tanquePct();
  const activos = riegosActivos();
  const caudalSalida = activos.reduce((s, r) => s + dispCaudal(r.dispositivo_id), 0);

  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="grid-3">' +
      '<div class="card"><div class="card__title">🕳️ Pozo</div>' +
        '<div class="flex-row" style="justify-content:space-between"><span class="big-number" id="aguaPozoPct">' + pp + '%</span><span>' + pill(pozo.estado === 'normal' ? 'Normal' : 'Crítico', pozo.estado === 'normal' ? 'pill--success' : 'pill--danger') + '</span></div>' +
        '<div class="progress ' + (pp < 20 ? 'progress--danger' : pp < 50 ? 'progress--warning' : 'progress--success') + '" style="margin:.6rem 0"><div class="progress__fill" id="aguaPozoFill" style="width:' + pp + '%"></div></div>' +
        '<div class="kv"><span class="kv__k">Disponible</span><span class="kv__v" id="aguaPozoL">' + Math.round(pozo.nivel_actual_litros).toLocaleString('es-CL') + ' L</span></div>' +
        '<div class="kv"><span class="kv__k">Capacidad</span><span class="kv__v">' + pozo.capacidad_total_litros.toLocaleString('es-CL') + ' L</span></div>' +
        '<div class="kv"><span class="kv__k">Caudal de entrada</span><span class="kv__v" id="aguaPozoCaudal">' + pozo.caudal_entrada_lpm + ' L/min</span></div>' +
        '<div class="kv"><span class="kv__k">Bomba de succión</span><span class="kv__v">' + (pozo.bomba_succion ? pill('ON', 'pill--success') : pill('OFF', 'pill--muted')) + '</span></div></div>' +

      '<div class="card"><div class="card__title">🏞️ Río / Canal</div>' +
        '<div class="kv"><span class="kv__k">Estado</span><span class="kv__v">' + (rio.caudal_entrada_lpm > 0 ? pill('Activo', 'pill--success') : pill('Seco', 'pill--danger')) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Caudal de entrada</span><span class="kv__v">' + rio.caudal_entrada_lpm + ' L/min</span></div>' +
        '<div class="kv"><span class="kv__k">Calidad de agua</span><span class="kv__v">' + pill('Apta', 'pill--success') + '</span></div>' +
        '<hr class="divider"><div class="card__title" style="font-size:.9rem">🔩 Bomba Principal</div>' +
        '<div class="kv"><span class="kv__k">Estado</span><span class="kv__v" id="aguaBomba">' + (b.activa ? pill('ON', 'pill--success') : pill('OFF', 'pill--danger')) + '</span></div>' +
        '<div class="kv"><span class="kv__k">Presión de salida</span><span class="kv__v" id="aguaPresion">' + Math.round(b.presion_kpa) + ' kPa</span></div>' +
        '<div class="kv"><span class="kv__k">Horas acumuladas</span><span class="kv__v">' + Math.round(b.horas_operacion).toLocaleString('es-CL') + ' h</span></div></div>' +

      '<div class="card"><div class="card__title">🛢️ Tanque de Almacenamiento</div>' +
        '<div class="tank-viz"><div class="tank-viz__water" id="tanqueWater" style="height:' + tp + '%"></div><div class="tank-viz__pct" id="aguaTanquePct">' + tp + '%</div></div>' +
        '<div style="text-align:center;margin-top:.5rem"><b id="aguaTanqueL">' + Math.round(tanque.nivel_actual_litros).toLocaleString('es-CL') + ' L</b> <span class="hint">de ' + tanque.capacidad_total_litros.toLocaleString('es-CL') + ' L</span></div>' +
        '<div class="kv" style="margin-top:.5rem"><span class="kv__k">Caudal de salida</span><span class="kv__v" id="aguaCaudalOut">' + caudalSalida + ' L/min</span></div>' +
        '<div class="kv"><span class="kv__k">Estado</span><span class="kv__v" id="aguaTanqueEstado">' + pill(tp < 20 ? 'Crítico' : tp < 50 ? 'Advertencia' : 'Normal', tp < 20 ? 'pill--danger' : tp < 50 ? 'pill--warning' : 'pill--success') + '</span></div></div>' +
    '</div>' +

    '<div class="card"><div class="card__title">🔀 Diagrama de Flujo de Agua</div>' +
      '<div class="flow">' +
        flowNode('🕳️', 'Pozo', pozo, pozo.caudal_entrada_lpm > 0) +
        '<div class="flow-link ' + (b.activa && pozo.caudal_entrada_lpm > 0 ? 'active' : '') + '"></div>' +
        flowNode('🔩', 'Bomba', b.activa ? { estado: 'normal' } : { estado: 'critico' }, b.activa) +
        '<div class="flow-link ' + (b.activa ? 'active' : '') + '"></div>' +
        flowNode('🛢️', 'Tanque', tanque, tp > 0) +
        '<div class="flow-link ' + (caudalSalida > 0 ? 'active' : '') + '"></div>' +
        flowNode('🚿', 'Distribuidores', caudalSalida > 0 ? { estado: 'normal' } : { estado: 'advertencia' }, caudalSalida > 0) +
        '<div class="flow-link ' + (caudalSalida > 0 ? 'active' : '') + '"></div>' +
        flowNode('🌱', 'Zonas', { estado: 'normal' }, caudalSalida > 0) +
      '</div>' +
      '<div class="flex-row" style="justify-content:center;gap:1.2rem;margin-top:.8rem">' +
        '<span class="hint"><span class="dot dot--success"></span> flujo normal</span>' +
        '<span class="hint"><span class="dot dot--warning"></span> advertencia</span>' +
        '<span class="hint"><span class="dot dot--danger"></span> crítico</span>' +
      '</div></div>' +

    '<div class="card"><div class="card__title">🧪 Simulación de Fallas (demo)</div>' +
      '<div class="actions-row">' +
        '<button class="btn btn--warning" data-action="sim-falla-bomba">💥 Simular Falla de Bomba</button>' +
        '<button class="btn btn--warning" data-action="sim-pozo-seco">🏜️ Simular Pozo Seco</button>' +
        '<button class="btn btn--warning" data-action="sim-fuga">🕳️ Simular Fuga en Tubería</button>' +
        '<button class="btn btn--secondary" data-action="sim-restaurar">✅ Restaurar Infraestructura</button>' +
      '</div></div>' +

    '<div class="card"><div class="card__title">📈 Nivel del Tanque — Últimas 24 h (simulado)</div>' +
      '<div class="chart-wrap"><canvas id="chartTanque"></canvas></div></div>' +
  '</div>';

  // Serie simulada de 24 puntos del nivel del tanque
  const labels = [], values = [];
  const base = tanque.nivel_actual_litros;
  for (let i = 23; i >= 0; i--) {
    const d = new Date(); d.setHours(d.getHours() - i);
    labels.push(String(d.getHours()).padStart(2, '0') + ':00');
    values.push(Math.max(0, Math.round(base - Math.sin(i / 3) * 400 - i * 15)));
  }
  Charts.line($('#chartTanque'), { labels, values, color: '#2980b9', fill: true });
}

function flowNode(icon, name, obj, flowing) {
  const est = obj.estado || 'normal';
  const cls = est === 'critico' ? 'flow-node--crit' : est === 'advertencia' || est === 'advertencia' ? 'flow-node--warn' : 'flow-node--ok';
  return '<div class="flow-node ' + cls + '"><div class="flow-node__icon">' + icon + '</div><div class="flow-node__name">' + name + '</div>' +
    '<div style="margin-top:2px"><span class="dot dot--' + (est === 'critico' ? 'danger' : est === 'advertencia' ? 'warning' : flowing ? 'success' : 'muted') + ' ' + (flowing && est !== 'critico' ? 'dot--live' : '') + '"></span></div></div>';
}

/* =========================================================
   SECCIÓN: CLIMA
   ========================================================= */
function renderClima() {
  const clima = DB.get(DB.KEYS.clima, null);
  if (!clima) return;
  const a = clima.actual;
  const iconosCielo = { soleado: '☀️', parcial: '⛅', nublado: '☁️', lluvia: '🌧️' };
  const cfg = getConfig();

  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="flex-row" style="justify-content:flex-end;gap:.6rem">' +
      '<button class="btn btn--secondary" data-action="sim-lluvia">🌧️ Simular Lluvia</button>' +
      '<button class="btn btn--warning" data-action="sim-calor">🔥 Simular Día Caluroso</button>' +
    '</div>' +
    '<div class="grid-3">' +
      '<div class="card" style="text-align:center"><div class="card__title" style="justify-content:center">🌡️ Condiciones Actuales</div>' +
        '<div style="font-size:3.2rem">' + (iconosCielo[a.cielo] || '🌤️') + '</div>' +
        '<div class="big-number">' + a.temperatura.toFixed(1) + ' °C</div>' +
        '<div class="hint" style="text-transform:capitalize">' + a.cielo + ' · actualizado ' + relativo(a.actualizado) + '</div>' +
        '<hr class="divider">' +
        '<div class="kv"><span class="kv__k">Humedad relativa</span><span class="kv__v">' + Math.round(a.humedad) + ' %</span></div>' +
        '<div class="kv"><span class="kv__k">Radiación solar</span><span class="kv__v">' + a.radiacion + ' MJ/m²/día</span></div>' +
        '<div class="kv"><span class="kv__k">Viento</span><span class="kv__v">' + a.viento + ' km/h ' + a.direccion_viento + '</span></div>' +
        '<div class="kv"><span class="kv__k">Presión atmosférica</span><span class="kv__v">' + a.presion + ' hPa</span></div></div>' +

      '<div class="card"><div class="card__title">📅 Pronóstico 5 Días</div>' +
        clima.pronostico.map(p => '<div class="flex-row" style="justify-content:space-between;padding:.55rem 0;border-bottom:1px dashed var(--border)">' +
          '<span class="flex-row"><span style="font-size:1.3rem">' + p.cielo + '</span><span><b>' + fmtFecha(p.fecha) + '</b><br><span class="hint">máx ' + p.temp_max + '° / mín ' + p.temp_min + '°</span></span></span>' +
          '<span>' + pill('💧 ' + p.lluvia_pct + '%', p.lluvia_pct > 50 ? 'pill--info' : 'pill--muted') + '</span></div>').join('') + '</div>' +

      '<div class="card"><div class="card__title">🧮 Cálculo ET0 / ETc</div>' +
        '<div class="kv"><span class="kv__k">ET0 (Braney-Criddle adaptada)</span><span class="kv__v">' + IAEstudio.necesidadLitros(getZonas()[0]).ET0 + ' mm/día</span></div>' +
        '<div class="kv"><span class="kv__k">Factor de ajuste ET0</span><span class="kv__v">× ' + cfg.et0_factor_ajuste + '</span></div>' +
        '<div class="kv"><span class="kv__k">mm necesarios</span><span class="kv__v">ETc × 0.8</span></div>' +
        '<p class="section-note">Fórmula: ET0 = 0.0023 × (T+17.8) × ((T+273.16)/273.16) × Rs × 0.408, con correcciones por humedad y viento. ETc = ET0 × Kc.</p></div>' +
    '</div>' +

    '<div class="card"><div class="card__title">🌱 Necesidad Hídrica por Zona (hoy)</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Zona</th><th>Kc</th><th>Extensión</th><th>ET0</th><th>ETc</th><th>mm/día</th><th>Litros necesarios</th><th>Recomendación</th></tr></thead><tbody>' +
        getZonas().map(z => {
          const n = IAEstudio.necesidadLitros(z);
          const c = IAEstudio.clasificar(n.litros);
          return '<tr><td><b>' + esc(z.nombre) + '</b></td><td>' + z.coeficiente_cultivo_kc + '</td><td>' + z.extension_m2.toLocaleString('es-CL') + ' m²</td>' +
            '<td>' + n.ET0 + '</td><td>' + n.ETc + '</td><td>' + n.mm + '</td><td><b>' + n.litros.toLocaleString('es-CL') + ' L</b></td>' +
            '<td>' + pill(c.label, c.pill) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' +

    '<div class="card"><div class="card__title">📉 ETc vs Precipitación — Historial (5 días)</div>' +
      '<div class="chart-wrap"><canvas id="chartETc"></canvas></div></div>' +
  '</div>';

  Charts.line($('#chartETc'), {
    labels: clima.historial.map(h => h.fecha.slice(5)),
    values: clima.historial.map(h => Math.round(h.radiacion * 0.408 * 10) / 10),
    color: '#d4a017', fill: false, unit: ' mm'
  });
}

/* =========================================================
   SECCIÓN: IA
   ========================================================= */
function renderIA() {
  const modelo = DB.get(DB.KEYS.modelo, null);
  const cfg = getConfig();
  if (!state.iaZonaSel) state.iaZonaSel = getZonas()[0] ? getZonas()[0].id : null;
  const zonas = getZonas();
  const pred = state.iaZonaSel ? IAEstudio.predecirRiego(state.iaZonaSel, 3) : [];
  const riegosCompletados = getRiegos().filter(r => r.estado === 'completado').length;

  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="card"><div class="card__title">🧠 Modelo de IA Estadístico</div>' +
      '<div class="flex-row" style="justify-content:space-between;flex-wrap:wrap;gap:1rem">' +
        '<div class="flex-row" style="gap:1.2rem">' +
          '<div class="mini-stat"><b>' + riegosCompletados + '</b><span>Registros de entrenamiento</span></div>' +
          '<div class="mini-stat"><b>' + (modelo ? modelo.score : '—') + '%</b><span>Confianza del modelo</span></div>' +
          '<div class="mini-stat"><b>' + (modelo ? modelo.zonas.length : 0) + '</b><span>Zonas analizadas</span></div>' +
          '<div class="mini-stat"><b>' + (modelo ? fmtFechaHora(modelo.entrenado_en) : 'Nunca') + '</b><span>Último entrenamiento</span></div>' +
        '</div>' +
        '<button class="btn btn--primary" data-action="entrenar-ia">🧠 Entrenar Modelo IA</button></div>' +
      (modelo ? '<p class="section-note">El modelo calcula media, desviación estándar y coeficiente de variación por zona. Confianza = 1 − CV.</p>' : '<p class="section-note">Modelo no entrenado. Se requieren mínimo ' + cfg.ia_min_registros + ' registros históricos (actuales: ' + riegosCompletados + ').</p>') +
    '</div>' +

    (modelo ? '<div class="card"><div class="card__title">📊 Estadísticas por Zona</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Zona</th><th>Muestras</th><th>Promedio (L)</th><th>Desviación σ</th><th>Coef. variación</th><th>Confianza</th></tr></thead><tbody>' +
        modelo.zonas.map(st => '<tr><td><b>' + esc(zonaName(st.zona_id)) + '</b></td><td>' + st.n + '</td><td>' + st.promedio.toLocaleString('es-CL') + '</td><td>' + st.desviacion + '</td><td>' + st.cv + '</td>' +
          '<td><div class="flex-row"><div class="progress" style="width:90px"><div class="progress__fill" style="width:' + st.confianza + '%"></div></div><b>' + st.confianza + '%</b></div></td></tr>').join('') +
      '</tbody></table></div></div>' : '') +

    '<div class="card"><div class="card__title">🔮 Predicciones de Riego</div>' +
      '<div class="form-row" style="max-width:320px"><label>Zona a consultar</label>' +
        '<select id="iaZonaSel">' + zonas.map(z => '<option value="' + z.id + '" ' + (z.id === state.iaZonaSel ? 'selected' : '') + '>' + esc(z.nombre) + '</option>').join('') + '</select></div>' +
      (pred.length ? '<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Necesidad</th><th>Agua estimada</th><th>Duración estimada</th><th>Recomendación</th><th>Confianza</th></tr></thead><tbody>' +
        pred.map(p => '<tr><td>' + fmtFecha(p.fecha) + '</td><td>' + (p.necesita ? pill('Sí', 'pill--success') : pill('No', 'pill--muted')) + '</td>' +
          '<td><b>' + p.litros.toLocaleString('es-CL') + ' L</b></td><td>' + p.duracion_min + ' min</td>' +
          '<td>' + pill(p.recomendacion_label, p.pill) + '</td><td>' + p.confianza + '%</td></tr>').join('') +
        '</tbody></table></div>' +
        '<p class="section-note">Lógica: ETc actual + historial de la zona, con incremento del 10% por día de sequía. Umbral: &lt;30 L no necesario · 30–100 L corto · 100–300 L normal · &gt;300 L extendido.</p>'
      : '<div class="empty"><div class="empty__icon">🔮</div>Seleccione una zona.</div>') +
    '</div></div>';
}

/* =========================================================
   SECCIÓN: HISTORIAL
   ========================================================= */
function renderHistorial() {
  const f = state.histFilters;
  let riegos = getRiegos().slice().sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
  if (f.zona) riegos = riegos.filter(r => r.zona_id === Number(f.zona));
  if (f.tipo) riegos = riegos.filter(r => r.tipo === f.tipo);
  if (f.estado) riegos = riegos.filter(r => r.estado === f.estado);
  if (f.desde) riegos = riegos.filter(r => dayKey(r.fecha_inicio) >= f.desde);
  if (f.hasta) riegos = riegos.filter(r => dayKey(r.fecha_inicio) <= f.hasta);

  const mes = dayKey(new Date()).slice(0, 7);
  const delMes = riegos.filter(r => r.fecha_inicio && dayKey(r.fecha_inicio).slice(0, 7) === mes && r.estado === 'completado');
  const totalMes = Math.round(delMes.reduce((s, r) => s + (r.cantidad_agua_litros || 0), 0));
  const promedio = delMes.length ? Math.round(totalMes / delMes.length) : 0;
  const porZona = {};
  delMes.forEach(r => porZona[r.zona_id] = (porZona[r.zona_id] || 0) + r.cantidad_agua_litros);
  const topZona = Object.keys(porZona).length ? zonaName(Object.keys(porZona).sort((a, b) => porZona[b] - porZona[a])[0]) : '—';

  const zonas = getZonas();
  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="stats-grid">' +
      statCard('📋', null, delMes.length, 'Riegos este mes', 'completados') +
      statCard('💧', null, totalMes.toLocaleString('es-CL') + ' <small>L</small>', 'Agua total este mes', 'consumo acumulado') +
      statCard('📊', null, promedio.toLocaleString('es-CL') + ' <small>L</small>', 'Promedio por riego', 'este mes') +
      statCard('🏆', null, esc(topZona), 'Zona con mayor consumo', 'este mes') +
    '</div>' +
    '<div class="card"><div class="card__title">🔍 Filtros</div>' +
      '<div class="filters">' +
        '<div class="form-row"><label>Zona</label><select data-filter="zona"><option value="">Todas</option>' + zonas.map(z => '<option value="' + z.id + '" ' + (f.zona == z.id ? 'selected' : '') + '>' + esc(z.nombre) + '</option>').join('') + '</select></div>' +
        '<div class="form-row"><label>Tipo</label><select data-filter="tipo"><option value="">Todos</option>' + ['manual', 'programado', 'ia_optimizado'].map(t => '<option ' + (f.tipo === t ? 'selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
        '<div class="form-row"><label>Estado</label><select data-filter="estado"><option value="">Todos</option>' + ['en_curso', 'completado', 'cancelado'].map(t => '<option ' + (f.estado === t ? 'selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
        '<div class="form-row"><label>Desde</label><input type="date" data-filter="desde" value="' + f.desde + '"></div>' +
        '<div class="form-row"><label>Hasta</label><input type="date" data-filter="hasta" value="' + f.hasta + '"></div>' +
        '<button class="btn btn--ghost" data-action="limpiar-filtros">Limpiar</button>' +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Zona</th><th>Distribuidor</th><th>Tipo</th><th>Inicio</th><th>Duración</th><th>Agua</th><th>Estado</th><th>Motivo</th></tr></thead><tbody>' +
        (riegos.length ? riegos.map(r => '<tr><td class="hint">#' + String(r.id).slice(-6) + '</td><td><b>' + esc(zonaName(r.zona_id)) + '</b></td><td>' + esc(dispName(r.dispositivo_id)) + '</td>' +
          '<td>' + esc(r.tipo) + '</td><td>' + fmtFechaHora(r.fecha_inicio) + '</td><td>' + (r.duracion_minutos || r.duracion_estimada_min) + ' min</td>' +
          '<td>' + (r.cantidad_agua_litros || r.cantidad_programada_litros || 0) + ' L</td><td>' + pillEstadoRiego(r) + '</td><td class="hint">' + esc(r.motivo_riego || '') + '</td></tr>').join('')
        : '<tr><td colspan="9"><div class="empty"><div class="empty__icon">📋</div>Sin resultados para los filtros aplicados.</div></td></tr>') +
      '</tbody></table></div>' +
      '<p class="section-note">' + riegos.length + ' registro(s) encontrado(s).</p></div>' +
  '</div>';
}

/* =========================================================
   SECCIÓN: DISPOSITIVOS
   ========================================================= */
const SENSOR_RANGO_VALORES = {
  sensor_humedad: { tipo: 'humedad', unidad: '%', min: 15, max: 50, dec: 0 },
  sensor_temperatura: { tipo: 'temperatura', unidad: '°C', min: 5, max: 34, dec: 1 },
  sensor_ph: { tipo: 'ph', unidad: 'pH', min: 5.5, max: 8, dec: 1 },
  sensor_conductividad: { tipo: 'conductividad', unidad: 'μS/cm', min: 300, max: 1800, dec: 0 }
};

function renderDispositivos() {
  const dispositivos = getDispositivos();
  const lecturas = DB.get(DB.KEYS.lecturas, []).slice(0, 15);
  const TIPO_LABEL = { valvula: 'Válvula solenoide', sensor_humedad: 'Sensor humedad', sensor_temperatura: 'Sensor temperatura', sensor_ph: 'Sensor pH', sensor_conductividad: 'Sensor conductividad', estacion_meteo: 'Estación meteorológica', bomba: 'Bomba', flujometro: 'Flujómetro', controlador: 'Controlador' };

  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="flex-row" style="justify-content:space-between">' +
      '<p class="hint">' + dispositivos.length + ' dispositivos registrados en la red.</p>' +
      '<div class="actions-row">' +
        '<button class="btn btn--secondary" data-action="sim-lectura">📡 Simular Nueva Lectura</button>' +
        '<button class="btn btn--warning" data-action="sim-anomalia">⚠️ Simular Anomalía</button>' +
      '</div></div>' +
    '<div class="card"><div class="card__title">📡 Dispositivos</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Modelo</th><th>Ubicación</th><th>Zona</th><th>Estado</th><th>Cambiar estado</th></tr></thead><tbody>' +
        dispositivos.map(d => '<tr><td><b>' + esc(d.nombre) + '</b><br><span class="hint">' + esc(d.numero_serie) + '</span></td>' +
          '<td>' + (TIPO_LABEL[d.tipo] || d.tipo) + '</td><td>' + esc(d.modelo) + '</td><td>' + esc(d.ubicacion) + '</td><td>' + esc(zonaName(d.zona_id)) + '</td>' +
          '<td>' + (riegosActivos().some(r => r.dispositivo_id === d.id) ? pill('En riego', 'pill--info') : pillEstadoDisp(d)) + '</td>' +
          '<td><select data-action="estado-dispositivo" data-id="' + d.id + '">' +
            ['activo', 'inactivo', 'mantenimiento', 'dañado'].map(e => '<option value="' + e + '" ' + (d.estado_operativo === e ? 'selected' : '') + '>' + e.charAt(0).toUpperCase() + e.slice(1) + '</option>').join('') +
          '</select></td></tr>').join('') +
      '</tbody></table></div></div>' +
    '<div class="card"><div class="card__title">📈 Últimas Lecturas de Sensores</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Sensor</th><th>Tipo</th><th>Valor</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>' +
        (lecturas.length ? lecturas.map(l => '<tr class="' + (l.anomalia ? 'row-anomaly' : '') + '"><td><b>' + esc(dispName(l.dispositivo_id)) + '</b></td><td>' + esc(l.tipo_sensor) + '</td>' +
          '<td><b>' + l.valor + ' ' + esc(l.unidad) + '</b></td><td>' + fmtFechaHora(l.fecha_hora) + '</td>' +
          '<td>' + (l.anomalia ? pill('⚠ Anomalía', 'pill--danger') : pill('Normal', 'pill--success')) + '</td></tr>').join('')
        : '<tr><td colspan="5"><div class="empty"><div class="empty__icon">📈</div>Sin lecturas registradas.</div></td></tr>') +
      '</tbody></table></div>' +
      '<p class="section-note">Rangos válidos: humedad 5–55 % · temperatura −5 a 55 °C · pH 3.5–10.5 · conductividad 0–5000 μS/cm · nivel 0–100 % · flujo 0–200 L/min · presión 0–800 kPa.</p></div>' +
  '</div>';
}

/* =========================================================
   SECCIÓN: ALERTAS
   ========================================================= */
function renderAlertas() {
  const f = state.alertaFilter;
  let alertas = DB.get(DB.KEYS.alertas, []);
  if (f.prioridad) alertas = alertas.filter(a => a.prioridad === f.prioridad);
  if (f.tipo) alertas = alertas.filter(a => a.tipo === f.tipo);

  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="card"><div class="card__title">🔔 Bandeja de Alertas <span style="margin-left:auto" class="flex-row">' +
        '<button class="btn btn--secondary btn--sm" data-action="marcar-leidas">✓ Marcar todas como leídas</button>' +
        '<button class="btn btn--ghost btn--sm" data-action="limpiar-antiguas">🧹 Limpiar antiguas</button></span></div>' +
      '<div class="filters">' +
        '<div class="form-row"><label>Prioridad</label><select data-afilter="prioridad"><option value="">Todas</option>' + ['baja', 'media', 'alta', 'critica'].map(p => '<option ' + (f.prioridad === p ? 'selected' : '') + '>' + p + '</option>').join('') + '</select></div>' +
        '<div class="form-row"><label>Tipo</label><select data-afilter="tipo"><option value="">Todos</option>' + Object.keys(TIPO_ALERTA_LABEL).map(t => '<option value="' + t + '" ' + (f.tipo === t ? 'selected' : '') + '>' + TIPO_ALERTA_LABEL[t] + '</option>').join('') + '</select></div>' +
      '</div>' +
      (alertas.length ? alertas.map(a =>
        '<div class="flex-row" style="justify-content:space-between;padding:.65rem .8rem;border:1px solid var(--border);border-radius:12px;margin-bottom:.5rem;' + (a.leida ? 'opacity:.62;' : '') + 'background:' + (a.prioridad === 'critica' ? '#fdf0ee' : a.prioridad === 'alta' ? '#fdf7e6' : '#fff') + '">' +
          '<div style="min-width:0"><div style="font-size:.9rem">' + (a.leida ? '' : '🔵 ') + esc(a.mensaje) + '</div>' +
          '<div class="hint">' + (TIPO_ALERTA_LABEL[a.tipo] || a.tipo) + (a.zona_id ? ' · ' + esc(zonaName(a.zona_id)) : '') + ' · ' + fmtFechaHora(a.fecha_hora) + ' (' + relativo(a.fecha_hora) + ')</div></div>' +
          '<span class="flex-row">' + pillPrioridad(a.prioridad) +
          (a.leida ? '' : '<button class="btn btn--ghost btn--sm" data-action="alerta-leer" data-id="' + a.id + '">Marcar leída</button>') + '</span></div>').join('')
      : '<div class="empty"><div class="empty__icon">✨</div>Sin alertas para los filtros aplicados.</div>') +
    '</div></div>';
}

/* =========================================================
   SECCIÓN: PROGRAMACIÓN
   ========================================================= */
function renderProgramacion() {
  const programas = DB.get(DB.KEYS.programas, []).filter(p => p.activo).sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
  const proximo = programas.find(p => new Date(p.fecha_hora) > nowSim());

  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="card"><div class="card__title">📅 Riegos Programados <span style="margin-left:auto" class="flex-row"><button class="btn btn--ghost btn--sm" data-action="avanzar-dia">⏩ Avanzar 1 Día</button><button class="btn btn--primary btn--sm" data-action="nuevo-programa">＋ Nuevo Programa</button></span></div>' +
      (proximo ? '<p class="section-note" style="margin-bottom:.8rem">⏳ Próximo riego: <b>' + esc(zonaName(proximo.zona_id)) + '</b> en <b id="progCountdown">' + cuentaRegresiva(proximo.fecha_hora) + '</b></p>' : '<p class="section-note" style="margin-bottom:.8rem">Sin riegos programados próximamente.</p>') +
      (programas.length ? '<div class="table-wrap"><table><thead><tr><th>Zona</th><th>Distribuidor</th><th>Litros</th><th>Fecha y hora</th><th>Repetición</th><th>Notas</th><th></th></tr></thead><tbody>' +
        programas.map(p => '<tr><td><b>' + esc(zonaName(p.zona_id)) + '</b></td><td>' + esc(dispName(p.dispositivo_id)) + '</td><td>' + p.litros + ' L</td>' +
          '<td>' + fmtFechaHora(p.fecha_hora) + '</td><td>' + esc(p.repeticion.replace('_', ' ')) + '</td><td class="hint">' + esc(p.notas || '') + '</td>' +
          '<td><div class="actions-row" style="flex-wrap:nowrap">' +
            '<button type="button" class="btn btn--secondary btn--sm" data-action="editar-programa" data-id="' + p.id + '">✏️ Editar</button>' +
            '<button type="button" class="btn btn--danger btn--sm" data-action="cancelar-programa" data-id="' + p.id + '">Cancelar</button></div></td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty"><div class="empty__icon">📅</div>No hay programas activos.</div>') +
    '</div></div>';
}

/** Lista compacta de programaciones con Editar/Cancelar (zona y distribuidor) */
function htmlListaProgramas(programas, mostrarDisp) {
  if (!programas.length) return '<div class="empty"><div class="empty__icon">📅</div>Sin programaciones futuras.</div>';
  return programas.map(p => '<div class="flex-row" style="justify-content:space-between;padding:.5rem 0;border-bottom:1px dashed var(--border);flex-wrap:wrap">' +
    '<span>' + fmtFechaHora(p.fecha_hora) + ' · <b>' + p.litros + ' L</b>' + (mostrarDisp ? ' · ' + esc(dispName(p.dispositivo_id)) : '') +
      ' <span class="hint">(' + esc(p.repeticion.replace('_', ' ')) + ')</span></span>' +
    '<span class="actions-row">' +
      '<button type="button" class="btn btn--secondary btn--sm" data-action="editar-programa" data-id="' + p.id + '">✏️ Editar</button>' +
      '<button type="button" class="btn btn--danger btn--sm" data-action="cancelar-programa" data-id="' + p.id + '">Cancelar</button></span></div>').join('');
}

function cuentaRegresiva(iso) {
  const ms = new Date(iso).getTime() - nowSim().getTime();
  if (ms <= 0) return 'en ejecución…';
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
  return (h > 0 ? h + ' h ' : '') + m + ' min ' + s + ' s';
}

/* =========================================================
   SECCIÓN: MANTENIMIENTO
   ========================================================= */
function renderMantenimiento() {
  const ordenes = DB.get(DB.KEYS.mantenimiento, []).slice().sort((a, b) => new Date(b.fecha_reporte) - new Date(a.fecha_reporte));
  const f = state.mantFilter || '';
  const filtradas = f ? ordenes.filter(o => o.estado === f) : ordenes;
  const TIPOS_FALLA = { mecanica: 'Mecánica', electrica: 'Eléctrica', comunicacion: 'Comunicación', calibracion: 'Calibración', desgaste: 'Desgaste', obstruccion: 'Obstrucción' };
  const pillOrden = o => o.estado === 'pendiente' ? pill('Pendiente', 'pill--warning') : o.estado === 'en_proceso' ? pill('En proceso', 'pill--info') : pill('Resuelto', 'pill--success');

  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<div class="card"><div class="card__title">🛠️ Órdenes de Mantenimiento <button class="btn btn--primary btn--sm" style="margin-left:auto" data-action="reportar-falla">＋ Reportar Falla</button></div>' +
      '<div class="filters"><div class="form-row"><label>Estado</label><select data-mfilter><option value="">Todos</option><option value="pendiente" ' + (f === 'pendiente' ? 'selected' : '') + '>Pendiente</option><option value="en_proceso" ' + (f === 'en_proceso' ? 'selected' : '') + '>En proceso</option><option value="resuelto" ' + (f === 'resuelto' ? 'selected' : '') + '>Resuelto</option></select></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>ID</th><th>Dispositivo</th><th>Tipo de falla</th><th>Descripción</th><th>Reporte</th><th>Técnico</th><th>Estado</th><th></th></tr></thead><tbody>' +
        (filtradas.length ? filtradas.map(o => '<tr><td class="hint">#' + String(o.id).slice(-6) + '</td><td><b>' + esc(dispName(o.dispositivo_id)) + '</b></td>' +
          '<td>' + (TIPOS_FALLA[o.tipo_falla] || o.tipo_falla) + '</td><td style="max-width:280px">' + esc(o.descripcion) + '</td><td>' + fmtFecha(o.fecha_reporte) + '</td>' +
          '<td>' + esc(o.tecnico) + '</td><td>' + pillOrden(o) + '</td>' +
          '<td>' + (o.estado !== 'resuelto' ? '<button class="btn btn--secondary btn--sm" data-action="resolver-orden" data-id="' + o.id + '">✓ Marcar resuelto</button>' : '') + '</td></tr>').join('')
        : '<tr><td colspan="8"><div class="empty"><div class="empty__icon">🛠️</div>Sin órdenes para el filtro seleccionado.</div></td></tr>') +
      '</tbody></table></div></div></div>';
}

/* =========================================================
   SECCIÓN: CONFIGURACIÓN
   ========================================================= */
function renderConfig() {
  const c = getConfig();
  const num = (k, step) => '<input type="number" step="' + (step || 1) + '" name="' + k + '" value="' + c[k] + '">';
  $('#view').innerHTML =
  '<div class="section-gap">' +
    '<form id="configForm" class="card"><div class="card__title">⚙️ Parámetros del Sistema</div>' +
      '<div class="form-grid">' +
        fRow('Umbral humedad mínima (%)', num('umbral_humedad_min')) +
        fRow('Umbral humedad máxima (%)', num('umbral_humedad_max')) +
        fRow('Caudal por defecto (L/min)', num('caudal_default_lpm')) +
        fRow('Hora riego matutino', '<input type="time" name="hora_riego_matutino" value="' + c.hora_riego_matutino + '">') +
        fRow('Hora riego vespertino', '<input type="time" name="hora_riego_vespertino" value="' + c.hora_riego_vespertino + '">') +
        fRow('Factor de ajuste ET0', num('et0_factor_ajuste', 0.01)) +
        fRow('Mín. registros para entrenar IA', num('ia_min_registros')) +
        fRow('Confianza mínima IA (%)', num('ia_confianza_min')) +
        fRow('Zona horaria', '<input name="zona_horaria" value="' + esc(c.zona_horaria) + '">') +
        fRow('Umbral presión baja (kPa)', num('umbral_presion_baja')) +
        fRow('Umbral nivel crítico tanque (%)', num('umbral_nivel_critico')) +
        fRow('Capacidad pozo (L)', num('capacidad_pozo_litros')) +
        fRow('Capacidad tanque (L)', num('capacidad_tanque_litros')) +
      '</div>' +
      '<button class="btn btn--primary" type="submit">💾 Guardar Configuración</button></form>' +

    '<div class="card"><div class="card__title">💾 Gestión de Datos</div>' +
      '<div class="actions-row">' +
        '<button class="btn btn--secondary" data-action="demo">🎲 Generar Datos de Demo</button>' +
        '<button class="btn btn--secondary" data-action="exportar">📤 Exportar Datos (JSON)</button>' +
        '<button class="btn btn--secondary" data-action="importar">📥 Importar Datos</button>' +
        '<input type="file" id="importFile" accept="application/json" hidden>' +
        '<button class="btn btn--danger" data-action="reset">♻️ Restablecer Sistema</button>' +
      '</div>' +
      '<p class="section-note">Todos los datos se almacenan localmente en el navegador (localStorage). Exporte periódicamente para respaldar su información.</p></div>' +
  '</div>';
}

/* =========================================================
   LÓGICA DE RIEGOS
   ========================================================= */
function iniciarRiego(zonaId, dispositivoId, litros, tipo = 'manual', motivo = '', opts = {}) {
  zonaId = Number(zonaId); dispositivoId = Number(dispositivoId);
  const fallo = (msg, t) => { if (!opts.silent) toast(msg, t); return false; };
  const d = dispById(dispositivoId);
  const z = zonaById(zonaId);
  if (!z) return fallo('Seleccione una zona válida.', 'error');
  if (z.estado !== 'activa') return fallo('La zona ' + z.nombre + ' está inactiva. Actívela para poder regar.', 'warning');
  if (!d || d.estado_operativo !== 'activo') return fallo('El distribuidor no está operativo.', 'error');
  if (riegosActivos().some(r => r.dispositivo_id === dispositivoId)) return fallo('Este distribuidor ya tiene un riego en curso.', 'warning');
  if (!getBomba().activa && tanquePct() <= 0) return fallo('Sin agua disponible: bomba apagada y tanque vacío.', 'error');
  litros = Math.max(10, Math.round(Number(litros) || 0));
  const caudal = dispCaudal(dispositivoId);
  const riego = {
    id: uid(),
    zona_id: Number(zonaId), dispositivo_id: Number(dispositivoId),
    tipo, estado: 'en_curso',
    fecha_inicio: new Date().toISOString(), fecha_fin: null,
    duracion_estimada_min: Math.max(1, Math.round(litros / caudal)),
    duracion_minutos: null,
    cantidad_agua_litros: null, cantidad_programada_litros: litros,
    motivo_riego: motivo || (tipo === 'manual' ? 'Riego manual' : tipo === 'programado' ? 'Riego programado' : 'Optimización IA'),
    eficiencia: null,
    _restantes: litros, _caudal: caudal
  };
  const riegos = getRiegos();
  riegos.push(riego);
  DB.set(DB.KEYS.riegos, riegos);
  crearAlerta('riego_iniciado', 'Riego ' + tipo.replace('_', ' ') + ' iniciado en zona ' + zonaName(zonaId) + ' (' + litros + ' L, ' + esc(d.nombre) + ').', 'media', { zona_id: zonaId, dispositivo_id: dispositivoId });
  toast('🚿 Riego iniciado: ' + zonaName(zonaId) + ' — ' + litros + ' L', 'success');
  if (!opts.noSync) sincronizarVista(true);
  return true;
}

function cancelarRiego(id) {
  const riegos = getRiegos();
  const r = riegos.find(x => x.id === Number(id));
  if (!r || r.estado !== 'en_curso') return;
  const consumido = Math.round(r.cantidad_programada_litros - Math.max(0, r._restantes != null ? r._restantes : r.cantidad_programada_litros));
  r.estado = 'cancelado';
  r.fecha_fin = new Date().toISOString();
  r.cantidad_agua_litros = consumido;
  r.duracion_minutos = Math.max(1, Math.round(consumido / (r._caudal || getConfig().caudal_default_lpm)));
  DB.set(DB.KEYS.riegos, riegos);
  crearAlerta('riego_finalizado', 'Riego detenido manualmente en zona ' + zonaName(r.zona_id) + ' (' + consumido + ' de ' + r.cantidad_programada_litros + ' L).', 'baja', { zona_id: r.zona_id, dispositivo_id: r.dispositivo_id });
  toast('⏹ Riego detenido. Consumo parcial: ' + consumido + ' L', 'warning');
  sincronizarVista(true);
}

/** Activa / desactiva una zona. Al desactivar se detienen sus riegos en curso. */
function cambiarEstadoZona(zonaId, activar) {
  const zonas = getZonas();
  const z = zonas.find(x => x.id === Number(zonaId));
  if (!z) return;
  z.estado = activar ? 'activa' : 'inactiva';
  DB.set(DB.KEYS.zonas, zonas);
  if (!activar) riegosActivos().filter(r => r.zona_id === z.id).forEach(r => cancelarRiego(r.id));
  crearAlerta('riego_iniciado', 'Zona ' + z.nombre + (activar ? ' activada.' : ' desactivada' + ' (riegos en curso detenidos).'), 'baja', { zona_id: z.id });
  toast('🌱 Zona ' + z.nombre + (activar ? ' activada' : ' desactivada'), activar ? 'success' : 'info');
  sincronizarVista(true);
}

/** Detiene el riego en curso de un distribuidor (si lo hay) */
function detenerRiegoDispositivo(dispId) {
  riegosActivos().filter(r => r.dispositivo_id === Number(dispId)).forEach(r => cancelarRiego(r.id));
}

function completarRiego(r) {
  const riegos = getRiegos();
  const rr = riegos.find(x => x.id === r.id);
  if (!rr) return;
  rr.estado = 'completado';
  rr.fecha_fin = new Date().toISOString();
  rr.cantidad_agua_litros = rr.cantidad_programada_litros;
  rr.duracion_minutos = rr.duracion_estimada_min;
  rr.eficiencia = 90 + Math.round(Math.random() * 8);
  rr._restantes = 0;
  DB.set(DB.KEYS.riegos, riegos);
  crearAlerta('riego_finalizado', 'Riego completado en zona ' + zonaName(rr.zona_id) + ' (' + rr.cantidad_agua_litros + ' L, ' + rr.duracion_minutos + ' min, eficiencia ' + rr.eficiencia + '%).', 'baja', { zona_id: rr.zona_id, dispositivo_id: rr.dispositivo_id });
  toast('✅ Riego completado en ' + zonaName(rr.zona_id), 'success');
}

/* =========================================================
   SIMULADORES EN TIEMPO REAL
   ========================================================= */
let flags = {}; // banderas para alertar una sola vez por condición

function simTick() {
  const cfg = getConfig();
  let riegos = getRiegos();
  const activos = riegos.filter(r => r.estado === 'en_curso');
  let cambios = activos.length > 0;

  // 1) Avance de riegos activos
  activos.forEach(r => {
    if (r._restantes == null) { r._restantes = r.cantidad_programada_litros; r._caudal = dispCaudal(r.dispositivo_id); }
    r._restantes -= (r._caudal / 60) * SIM_SPEED;
    if (r._restantes <= 0) {
      r.estado = 'completado';
      r.fecha_fin = new Date().toISOString();
      r.cantidad_agua_litros = r.cantidad_programada_litros;
      r.duracion_minutos = r.duracion_estimada_min;
      r.eficiencia = 90 + Math.round(Math.random() * 8);
      r._restantes = 0;
      crearAlerta('riego_finalizado', 'Riego completado en zona ' + zonaName(r.zona_id) + ' (' + r.cantidad_agua_litros + ' L, ' + r.duracion_minutos + ' min, eficiencia ' + r.eficiencia + '%).', 'baja', { zona_id: r.zona_id, dispositivo_id: r.dispositivo_id });
      toast('✅ Riego completado en ' + zonaName(r.zona_id), 'success');
    }
  });
  if (activos.length) DB.set(DB.KEYS.riegos, riegos);

  // 2) Balance hídrico de fuentes
  const fuentes = getFuentes();
  const bomba = getBomba();
  const pozo = fuentes.find(f => f.tipo === 'pozo');
  const tanque = fuentes.find(f => f.tipo === 'tanque');
  const salidaLpm = riegosActivos().reduce((s, r) => s + (r._caudal || dispCaudal(r.dispositivo_id)), 0);
  const entradaLpm = bomba.activa ? pozo.caudal_entrada_lpm : 0;

  if (bomba.activa && pozo.caudal_entrada_lpm > 0) {
    pozo.nivel_actual_litros = Math.max(0, pozo.nivel_actual_litros - (pozo.caudal_entrada_lpm / 60) * SIM_SPEED);
  }
  tanque.caudal_entrada_lpm = entradaLpm;
  tanque.caudal_salida_lpm = salidaLpm;
  tanque.nivel_actual_litros = Math.max(0, Math.min(tanque.capacidad_total_litros,
    tanque.nivel_actual_litros + ((entradaLpm - salidaLpm) / 60) * SIM_SPEED));

  const tp = tanquePct(), pp = pozoPct();
  tanque.estado = tp < cfg.umbral_nivel_critico ? 'critico' : 'normal';
  pozo.estado = pp < 15 ? 'critico' : pp < 40 ? 'advertencia' : 'normal';
  if (bomba.activa) {
    bomba.presion_kpa = Math.max(0, Math.min(600, bomba.presion_kpa + (Math.random() - 0.5) * 8));
    bomba.horas_operacion += SIM_SPEED / 3600;
  }
  fuentes.forEach(f => f.ultima_actualizacion = new Date().toISOString());
  DB.set(DB.KEYS.fuentes, fuentes);
  DB.set(DB.KEYS.bomba, bomba);

  // 3) Detección automática de fallos
  if (bomba.activa && pozo.caudal_entrada_lpm === 0 && !flags.pozoSeco) {
    flags.pozoSeco = true;
    crearAlerta('fuente_agua', 'Posible pozo seco o bomba de succión fallida: caudal de entrada = 0 con bomba encendida.', 'critica');
  }
  if (!bomba.activa) flags.pozoSeco = false;
  if (bomba.presion_kpa < cfg.umbral_presion_baja && bomba.activa && !flags.presionBaja) {
    flags.presionBaja = true;
    crearAlerta('fuente_agua', 'Presión baja en bomba principal: ' + Math.round(bomba.presion_kpa) + ' kPa (umbral ' + cfg.umbral_presion_baja + ' kPa).', 'alta');
  }
  if (bomba.presion_kpa >= cfg.umbral_presion_baja) flags.presionBaja = false;
  if (tp < cfg.umbral_nivel_critico && !flags.tanqueCritico) {
    flags.tanqueCritico = true;
    crearAlerta('fuente_agua', 'Tanque casi vacío: nivel al ' + tp + '% (umbral crítico ' + cfg.umbral_nivel_critico + '%).', 'alta');
  }
  if (tp >= cfg.umbral_nivel_critico) flags.tanqueCritico = false;

  // 4) Scheduler: ejecutar riegos programados
  const programas = DB.get(DB.KEYS.programas, []);
  let cambioProg = false;
  programas.forEach(p => {
    if (!p.activo) return;
    if (new Date(p.fecha_hora).getTime() <= nowSim().getTime()) {
      const ok = iniciarRiego(p.zona_id, p.dispositivo_id, p.litros, 'programado', p.notas || 'Riego programado', { silent: true, noSync: true });
      if (!ok) {
        // No se pudo ejecutar (zona inactiva, válvula ocupada o fuera de servicio): avisar UNA vez y no reintentar cada segundo
        crearAlerta('riego_iniciado', 'No se pudo ejecutar el riego programado en zona ' + zonaName(p.zona_id) + ' (' + dispName(p.dispositivo_id) + '): zona inactiva, distribuidor ocupado o fuera de servicio.', 'alta', { zona_id: p.zona_id, dispositivo_id: p.dispositivo_id });
      }
      if (p.repeticion === 'diario') {
        const nd = new Date(p.fecha_hora);
        while (nd.getTime() <= nowSim().getTime()) nd.setDate(nd.getDate() + 1);
        p.fecha_hora = nd.toISOString();
      } else { p.activo = false; }
      cambioProg = true;
    }
  });
  if (cambioProg) DB.set(DB.KEYS.programas, programas);

  refreshLive();
  sincronizarVista(); // si algo estructural cambió (riego terminó, programa ejecutado, alerta...) se redibuja
}

function refreshLive() {
  const el = id => document.getElementById(id);
  const set = (id, txt) => { const e = el(id); if (e) e.textContent = txt; };
  const cfg = getConfig();
  set('clock', nowSim().toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' }) + ' · ' + nowSim().toLocaleTimeString('es-CL'));

  const activos = riegosActivos();
  const danados = getDispositivos().filter(d => d.estado_operativo === 'dañado').length;

  // Dashboard
  const vA = el('vActivos');
  if (vA) { vA.innerHTML = activos.length + (activos.length ? ' <span class="dot dot--info dot--live"></span>' : ''); }
  const vH = el('vAguaHoy');
  if (vH) vH.innerHTML = aguaUsadaHoy().toLocaleString('es-CL') + ' <small>L</small>';
  set('vFallas', String(danados));
  set('vAlertas', String(alertasNoLeidas()));
  // Progreso de cada riego en curso (en sitio: NO se reconstruyen los botones)
  activos.forEach(r => {
    const p = progresoRiego(r);
    document.querySelectorAll('[data-riego-bar="' + r.id + '"]').forEach(b => b.style.width = p.pct + '%');
    document.querySelectorAll('[data-riego-txt="' + r.id + '"]').forEach(t => t.textContent = p.texto);
  });
  const pp = pozoPct(), tp = tanquePct();
  const bar = el('barPozo');
  if (bar) { bar.style.width = pp + '%'; set('txtPozo', pp + '% · ' + Math.round(fuente('pozo').nivel_actual_litros).toLocaleString('es-CL') + ' L'); }
  const barT = el('barTanque');
  if (barT) { barT.style.width = tp + '%'; barT.parentElement.className = 'progress ' + (tp < 20 ? 'progress--danger' : tp < 50 ? 'progress--warning' : 'progress--success'); set('txtTanque', tp + '% · ' + Math.round(fuente('tanque').nivel_actual_litros).toLocaleString('es-CL') + ' L'); }
  const b = getBomba();
  set('txtBomba', b.activa ? 'ON ●' : 'OFF ○');
  set('txtPresion', Math.round(b.presion_kpa) + ' kPa');
  const caudalOut = activos.reduce((s, r) => s + (r._caudal || dispCaudal(r.dispositivo_id)), 0);
  set('txtCaudal', caudalOut + ' L/min ' + (caudalOut > 0 ? '▲' : '▼'));

  // Agua
  set('aguaPozoPct', pp + '%');
  const apf = el('aguaPozoFill');
  if (apf) apf.style.width = pp + '%';
  set('aguaPozoL', Math.round(fuente('pozo').nivel_actual_litros).toLocaleString('es-CL') + ' L');
  set('aguaPozoCaudal', fuente('pozo').caudal_entrada_lpm + ' L/min');
  set('aguaBomba', b.activa ? 'ON ●' : 'OFF ○');
  set('aguaPresion', Math.round(b.presion_kpa) + ' kPa');
  set('aguaTanquePct', tp + '%');
  set('aguaTanqueL', Math.round(fuente('tanque').nivel_actual_litros).toLocaleString('es-CL') + ' L');
  const tw = el('tanqueWater');
  if (tw) tw.style.height = tp + '%';
  set('aguaCaudalOut', caudalOut + ' L/min');

  // Programación countdown
  const cd = el('progCountdown');
  if (cd) {
    const prox = DB.get(DB.KEYS.programas, []).filter(p => p.activo && new Date(p.fecha_hora) > nowSim()).sort((a, x) => new Date(a.fecha_hora) - new Date(x.fecha_hora))[0];
    cd.textContent = prox ? cuentaRegresiva(prox.fecha_hora) : '—';
  }
}

/** Genera lecturas de sensores (normales o anómalas) */
function simularLectura(forzarAnomalia = false) {
  const sensores = getDispositivos().filter(d => SENSOR_RANGO_VALORES[d.tipo] && d.estado_operativo === 'activo');
  if (!sensores.length) { toast('No hay sensores activos disponibles.', 'warning'); return; }
  const lecturas = DB.get(DB.KEYS.lecturas, []);
  sensores.forEach(d => {
    const p = SENSOR_RANGO_VALORES[d.tipo];
    const anomalia = forzarAnomalia || Math.random() < 0.05;
    let valor;
    if (anomalia) {
      const r = RANGOS_SENSOR[p.tipo];
      valor = Math.random() > 0.5 ? +(r[1] + Math.random() * 10).toFixed(p.dec) : +(r[0] - Math.random() * 5).toFixed(p.dec);
    } else {
      valor = +(p.min + Math.random() * (p.max - p.min)).toFixed(p.dec);
    }
    const esAnomalia = IAEstudio.detectarAnomalia(p.tipo, valor);
    lecturas.unshift({
      id: uid(), dispositivo_id: d.id, tipo_sensor: p.tipo,
      valor, unidad: p.unidad, fecha_hora: new Date().toISOString(),
      anomalia: esAnomalia
    });
    if (esAnomalia) {
      crearAlerta('anomalia_sensor', 'Lectura anómala en ' + d.nombre + ': ' + p.tipo + ' ' + valor + ' ' + p.unidad + ' fuera de rango.', 'alta', { dispositivo_id: d.id, zona_id: d.zona_id });
    }
  });
  if (lecturas.length > 200) lecturas.length = 200;
  DB.set(DB.KEYS.lecturas, lecturas);
}

/** Simulación de clima: deriva aleatoria realista */
function simularClima() {
  const clima = DB.get(DB.KEYS.clima, null);
  if (!clima) return;
  const a = clima.actual;
  a.temperatura = Math.max(-4, Math.min(44, +(a.temperatura + (Math.random() - 0.5) * 1.6).toFixed(1)));
  a.humedad = Math.max(15, Math.min(95, Math.round(a.humedad + (Math.random() - 0.5) * 6)));
  a.radiacion = Math.max(2, Math.min(26, +(a.radiacion + (Math.random() - 0.5) * 1.4).toFixed(1)));
  a.viento = Math.max(0, +(a.viento + (Math.random() - 0.5) * 2).toFixed(1));
  a.presion = +(a.presion + (Math.random() - 0.5) * 1.2).toFixed(1);
  a.actualizado = new Date().toISOString();
  DB.set(DB.KEYS.clima, clima);
}

/* =========================================================
   ACCIONES (delegación de eventos)
   ========================================================= */
/** Mantiene sincronizados los selects Zona ↔ Distribuidor dentro de un modal */
function enlazarZonaDistribuidor(root, selZ, selD, onChange) {
  const z = root.querySelector(selZ), d = root.querySelector(selD);
  z.addEventListener('change', () => {
    // al cambiar de zona, preseleccionar un distribuidor asignado a esa zona (si existe)
    const opt = Array.from(d.options).find(o => o.dataset.zona === z.value && !o.disabled);
    if (opt) d.value = opt.value;
    onChange && onChange();
  });
  d.addEventListener('change', () => {
    const zon = d.selectedOptions[0] && d.selectedOptions[0].dataset.zona;
    if (zon && Array.from(z.options).some(o => o.value === zon)) z.value = zon;
    onChange && onChange();
  });
}

function modalRiego(zonaIdPre, dispIdPre) {
  const zonas = getZonas().filter(z => z.estado === 'activa');
  const ocupadas = riegosActivos().map(r => r.dispositivo_id);
  const valvulas = getDispositivos().filter(d => d.tipo === 'valvula' && d.estado_operativo === 'activo');
  if (zonaIdPre && !zonas.some(z => z.id === Number(zonaIdPre))) { toast('La zona está inactiva. Actívela primero.', 'warning'); return; }
  if (!zonas.length) { toast('No hay zonas activas.', 'error'); return; }
  const libres = valvulas.filter(d => !ocupadas.includes(d.id));
  if (!libres.length) { toast(valvulas.length ? 'Todos los distribuidores operativos ya están regando.' : 'No hay distribuidores operativos.', 'error'); return; }
  // distribuidor por defecto: el indicado, o uno libre de la zona, o el primero libre
  let defD = dispIdPre && libres.find(d => d.id === Number(dispIdPre));
  if (!defD && zonaIdPre) defD = libres.find(d => d.zona_id === Number(zonaIdPre));
  if (!defD) defD = libres[0];
  const defZ = Number(zonaIdPre) || defD.zona_id || zonas[0].id;
  const nec = IAEstudio.necesidadLitros(zonaById(defZ));
  const litrosDef = nec && nec.litros >= 30 ? nec.litros : 300;
  const optsZ = zonas.map(z => '<option value="' + z.id + '" ' + (z.id === Number(defZ) ? 'selected' : '') + '>' + esc(z.nombre) + '</option>').join('');
  const optsD = valvulas.map(d => '<option value="' + d.id + '" ' + (d.id === defD.id ? 'selected' : '') + (ocupadas.includes(d.id) ? ' disabled' : '') + ' data-zona="' + d.zona_id + '">' +
    esc(d.nombre) + ' — ' + esc(zonaName(d.zona_id)) + (ocupadas.includes(d.id) ? ' (regando)' : '') + '</option>').join('');
  openModal('💧 Iniciar Riego Manual', '<div class="form-grid">' +
    fRow('Zona', '<select name="zona_id" id="mrZona">' + optsZ + '</select>') +
    fRow('Distribuidor', '<select name="dispositivo_id" id="mrDisp">' + optsD + '</select>') +
    fRow('Litros a distribuir', '<input type="number" name="litros" id="mrLitros" min="10" value="' + litrosDef + '" required>') +
    fRow('Duración estimada', '<input id="mrDur" disabled value="—">') +
    '</div><p class="hint">La duración se calcula como litros ÷ caudal del distribuidor. Valor sugerido según la necesidad hídrica (ETc) de la zona.</p>', {
    submitLabel: '▶ Iniciar Riego',
    onOpen(root) {
      const upd = () => {
        const lit = Number(root.querySelector('#mrLitros').value) || 0;
        const caudal = dispCaudal(root.querySelector('#mrDisp').value);
        root.querySelector('#mrDur').value = Math.max(1, Math.round(lit / caudal)) + ' min (' + caudal + ' L/min)';
      };
      root.querySelector('#mrLitros').addEventListener('input', upd);
      enlazarZonaDistribuidor(root, '#mrZona', '#mrDisp', upd);
      upd();
    },
    onSubmit(data) {
      if (!(Number(data.litros) >= 10)) { toast('Ingrese al menos 10 litros.', 'error'); return false; }
      return iniciarRiego(data.zona_id, data.dispositivo_id, data.litros, 'manual') !== false;
    }
  });
}

/**
 * Crear o editar una programación.
 * opts: { dispId, zonaId, programaId }  — con programaId edita la existente.
 */
function modalProgramar(opts = {}) {
  const programas = DB.get(DB.KEYS.programas, []);
  const prog = opts.programaId ? programas.find(p => p.id === Number(opts.programaId)) : null;
  if (opts.programaId && !prog) { toast('La programación ya no existe.', 'error'); sincronizarVista(true); return; }
  const zonas = getZonas().filter(z => z.estado === 'activa' || (prog && z.id === prog.zona_id));
  const valvulas = getDispositivos().filter(d => d.tipo === 'valvula' && (d.estado_operativo !== 'dañado' || (prog && d.id === prog.dispositivo_id)));
  if (!valvulas.length) { toast('No hay distribuidores disponibles.', 'error'); return; }
  if (!zonas.length) { toast('No hay zonas activas.', 'error'); return; }
  const cfg = getConfig();

  let defD = prog ? prog.dispositivo_id : Number(opts.dispId) || null;
  let defZ = prog ? prog.zona_id : Number(opts.zonaId) || null;
  if (!defD && defZ) { const v = valvulas.find(d => d.zona_id === defZ); defD = v ? v.id : valvulas[0].id; }
  if (!defD) defD = valvulas[0].id;
  if (!defZ) defZ = (dispById(defD) || {}).zona_id || zonas[0].id;

  let dtLocal;
  if (prog) dtLocal = toLocalInput(prog.fecha_hora);
  else {
    const f = nowSim(); f.setDate(f.getDate() + 1);
    dtLocal = dayKey(f) + 'T' + cfg.hora_riego_matutino;
  }
  const horaRapida = h => '<button type="button" class="btn btn--ghost btn--sm" data-hora="' + h + '">' + h + '</button>';

  openModal(prog ? '✏️ Editar Programación' : '📅 Programar Riego', '<div class="form-grid">' +
    fRow('Zona', '<select name="zona_id" id="mpZona">' + zonas.map(z => '<option value="' + z.id + '" ' + (z.id === defZ ? 'selected' : '') + '>' + esc(z.nombre) + '</option>').join('') + '</select>') +
    fRow('Distribuidor', '<select name="dispositivo_id" id="mpDisp">' + valvulas.map(d => '<option value="' + d.id + '" data-zona="' + d.zona_id + '" ' + (d.id === defD ? 'selected' : '') + '>' + esc(d.nombre) + ' — ' + esc(zonaName(d.zona_id)) + '</option>').join('') + '</select>') +
    fRow('Litros', '<input type="number" name="litros" min="10" value="' + (prog ? prog.litros : 250) + '" required>') +
    fRow('Fecha y hora', '<input type="datetime-local" name="fecha_hora" id="mpFecha" value="' + dtLocal + '" required>' +
      '<div class="actions-row" style="margin-top:.35rem">' + horaRapida(cfg.hora_riego_matutino) + horaRapida(cfg.hora_riego_vespertino) +
      '<button type="button" class="btn btn--ghost btn--sm" data-mas="60">+1 h</button><button type="button" class="btn btn--ghost btn--sm" data-mas="-60">−1 h</button></div>') +
    fRow('Repetición', '<select name="repeticion"><option value="una_vez" ' + (prog && prog.repeticion === 'una_vez' ? 'selected' : '') + '>Una vez</option><option value="diario" ' + (prog && prog.repeticion === 'diario' ? 'selected' : '') + '>Diario</option></select>') +
    fRow('Notas (opcional)', '<input name="notas" placeholder="Ej: riego de apoyo" value="' + esc(prog ? prog.notas : '') + '">') +
    '</div><p class="hint">El sistema revisa cada segundo si hay riegos programados por ejecutar (según el reloj simulado).</p>', {
    submitLabel: prog ? '💾 Guardar cambios' : '💾 Programar',
    onOpen(root) {
      enlazarZonaDistribuidor(root, '#mpZona', '#mpDisp');
      const fecha = root.querySelector('#mpFecha');
      root.querySelectorAll('[data-hora]').forEach(b => b.addEventListener('click', () => {
        fecha.value = (fecha.value ? fecha.value.slice(0, 10) : dayKey(nowSim())) + 'T' + b.dataset.hora;
      }));
      root.querySelectorAll('[data-mas]').forEach(b => b.addEventListener('click', () => {
        const d = fecha.value ? new Date(fecha.value) : nowSim();
        d.setMinutes(d.getMinutes() + Number(b.dataset.mas));
        fecha.value = toLocalInput(d.toISOString());
      }));
    },
    onSubmit(data) {
      if (!data.fecha_hora) { toast('Ingrese fecha y hora.', 'error'); return false; }
      const fecha = new Date(data.fecha_hora);
      if (isNaN(fecha)) { toast('Fecha inválida.', 'error'); return false; }
      if (fecha.getTime() <= nowSim().getTime() && data.repeticion === 'una_vez') {
        toast('La fecha y hora deben ser futuras.', 'error'); return false;
      }
      const litros = Math.round(Number(data.litros));
      if (!(litros >= 10)) { toast('Ingrese al menos 10 litros.', 'error'); return false; }
      const lista = DB.get(DB.KEYS.programas, []);
      const campos = {
        zona_id: Number(data.zona_id), dispositivo_id: Number(data.dispositivo_id),
        litros, fecha_hora: fecha.toISOString(),
        repeticion: data.repeticion, notas: data.notas || '', activo: true
      };
      if (prog) {
        const p = lista.find(x => x.id === prog.id);
        if (!p) { toast('La programación ya no existe.', 'error'); return; }
        Object.assign(p, campos);
        toast('✏️ Programación actualizada: ' + fmtFechaHora(campos.fecha_hora), 'success');
      } else {
        lista.push({ id: uid(), ...campos });
        toast('📅 Riego programado para ' + fmtFechaHora(campos.fecha_hora), 'success');
      }
      DB.set(DB.KEYS.programas, lista);
      sincronizarVista(true);
    }
  });
}

function handleAction(a, id) {
  switch (a) {
    case 'go': navigate(id); break;
    case 'ver-zona': navigate('zona', Number(id)); break;
    case 'ver-distribuidor': navigate('distribuidor', Number(id)); break;
    case 'nueva-zona':
      openModal('🌱 Nueva Zona', zonaFormHTML(), {
        onSubmit(data) {
          if (!data.nombre || !data.extension_m2) { toast('Complete los campos obligatorios.', 'error'); return false; }
          const zonas = getZonas();
          zonas.push({ id: uid(), nombre: data.nombre, tipo_cultivo: data.tipo_cultivo, tipo_suelo: data.tipo_suelo, extension_m2: Number(data.extension_m2), coeficiente_cultivo_kc: Number(data.coeficiente_cultivo_kc), caudal_esperado_lpm: Number(data.caudal_esperado_lpm) || getConfig().caudal_default_lpm, estado: 'activa' });
          zonas[zonas.length - 1].estado = data.estado || 'activa';
          DB.set(DB.KEYS.zonas, zonas);
          toast('Zona "' + esc(data.nombre) + '" creada.', 'success');
          sincronizarVista(true);
        }
      });
      break;
    case 'editar-zona': {
      const z = zonaById(id);
      if (!z) { sincronizarVista(true); break; }
      openModal('✏️ Editar Zona: ' + esc(z.nombre), zonaFormHTML(z), {
        onSubmit(data) {
          if (!data.nombre || !(Number(data.extension_m2) > 0)) { toast('Complete los campos obligatorios.', 'error'); return false; }
          const zonas = getZonas();
          const zz = zonas.find(x => x.id === z.id);
          if (!zz) return;
          Object.assign(zz, { nombre: data.nombre, tipo_cultivo: data.tipo_cultivo, tipo_suelo: data.tipo_suelo, extension_m2: Number(data.extension_m2), coeficiente_cultivo_kc: Number(data.coeficiente_cultivo_kc), caudal_esperado_lpm: Number(data.caudal_esperado_lpm) || getConfig().caudal_default_lpm });
          DB.set(DB.KEYS.zonas, zonas);
          if (data.estado && data.estado !== zz.estado) cambiarEstadoZona(zz.id, data.estado === 'activa');
          toast('Zona actualizada.', 'success');
          sincronizarVista(true);
        }
      });
      break;
    }
    case 'estado-zona': { const z = zonaById(id); if (z) cambiarEstadoZona(z.id, z.estado !== 'activa'); break; }
    case 'regar-ahora': modalRiego(Number(id)); break;
    case 'activar-distribuidor': { const d = dispById(id); if (d) modalRiego(d.zona_id, d.id); break; }
    case 'programar-distribuidor': modalProgramar({ dispId: Number(id) }); break;
    case 'programar-zona': modalProgramar({ zonaId: Number(id) }); break;
    case 'editar-programa': modalProgramar({ programaId: Number(id) }); break;
    case 'detener-riego': cancelarRiego(id); break;
    case 'cancelar-programa': {
      const programas = DB.get(DB.KEYS.programas, []);
      const p = programas.find(x => x.id === Number(id));
      if (p) { p.activo = false; DB.set(DB.KEYS.programas, programas); toast('Programa cancelado.', 'info'); sincronizarVista(true); }
      break;
    }
    case 'nuevo-programa': modalProgramar(); break;
    case 'toggle-dispositivo': case 'toggle-zona': break; // manejado en 'change'
    case 'entrenar-ia': {
      const res = IAEstudio.entrenarModelo();
      if (res.exito) {
        toast('🧠 Modelo entrenado: ' + res.modelo.registros_usados + ' registros, confianza ' + res.modelo.score + '%', 'success');
        crearAlerta('ia', 'Modelo IA entrenado con ' + res.modelo.registros_usados + ' registros. Score de confianza: ' + res.modelo.score + '%.', 'media');
      } else {
        toast('Faltan ' + res.faltan + ' registro(s) histórico(s) para entrenar (mínimo ' + getConfig().ia_min_registros + ').', 'warning');
      }
      sincronizarVista(true);
      break;
    }
    case 'marcar-leidas': marcarTodasLeidas(); toast('Todas las alertas marcadas como leídas.', 'success'); sincronizarVista(true); break;
    case 'limpiar-antiguas': {
      const antes = DB.get(DB.KEYS.alertas, []).length;
      limpiarAlertasAntiguas(7);
      const n = antes - DB.get(DB.KEYS.alertas, []).length;
      toast(n ? n + ' alerta(s) de más de 7 días eliminada(s).' : 'No hay alertas de más de 7 días.', 'info');
      sincronizarVista(true);
      break;
    }
    case 'alerta-leer': {
      const alertas = DB.get(DB.KEYS.alertas, []);
      const al = alertas.find(x => x.id === Number(id));
      if (al) { al.leida = true; DB.set(DB.KEYS.alertas, alertas); sincronizarVista(true); }
      break;
    }
    case 'reportar-falla': {
      const dispositivos = getDispositivos();
      openModal('🛠️ Reportar Falla', '<div class="form-grid">' +
        fRow('Dispositivo', '<select name="dispositivo_id">' + dispositivos.map(d => '<option value="' + d.id + '">' + esc(d.nombre) + ' — ' + esc(d.ubicacion) + '</option>').join('') + '</select>') +
        fRow('Tipo de falla', '<select name="tipo_falla">' + [['mecanica', 'Mecánica'], ['electrica', 'Eléctrica'], ['comunicacion', 'Comunicación'], ['calibracion', 'Calibración'], ['desgaste', 'Desgaste'], ['obstruccion', 'Obstrucción']].map(t => '<option value="' + t[0] + '">' + t[1] + '</option>').join('') + '</select>') +
        fRow('Técnico responsable', '<input name="tecnico" required placeholder="Nombre del técnico">') +
        fRow('Descripción', '<textarea name="descripcion" rows="3" required placeholder="Describa la falla..."></textarea>') +
        '</div>', {
        submitLabel: 'Reportar',
        onSubmit(data) {
          if (!data.descripcion || !data.tecnico) { toast('Complete todos los campos.', 'error'); return false; }
          const ordenes = DB.get(DB.KEYS.mantenimiento, []);
          const did = Number(data.dispositivo_id);
          ordenes.unshift({ id: uid(), dispositivo_id: did, tipo_falla: data.tipo_falla, descripcion: data.descripcion, estado: 'pendiente', fecha_reporte: new Date().toISOString(), tecnico: data.tecnico });
          DB.set(DB.KEYS.mantenimiento, ordenes);
          const disp = dispById(did);
          if (disp && data.tipo_falla !== 'calibracion') {
            const dispositivos = getDispositivos();
            dispositivos.find(d => d.id === did).estado_operativo = 'mantenimiento';
            DB.set(DB.KEYS.dispositivos, dispositivos);
          }
          crearAlerta('dispositivo_danado', 'Nueva orden de mantenimiento para ' + dispName(did) + ': ' + data.descripcion, 'media', { dispositivo_id: did });
          toast('Falla reportada correctamente.', 'success');
          sincronizarVista(true);
        }
      });
      break;
    }
    case 'resolver-orden': {
      const ordenes = DB.get(DB.KEYS.mantenimiento, []);
      const o = ordenes.find(x => x.id === Number(id));
      if (o) {
        o.estado = 'resuelto';
        DB.set(DB.KEYS.mantenimiento, ordenes);
        const dispositivos = getDispositivos();
        const d = dispositivos.find(x => x.id === o.dispositivo_id);
        if (d && d.estado_operativo === 'mantenimiento') { d.estado_operativo = 'activo'; DB.set(DB.KEYS.dispositivos, dispositivos); }
        toast('Orden marcada como resuelta.', 'success');
        sincronizarVista(true);
      }
      break;
    }
    case 'sim-falla-bomba': {
      const b = getBomba(); b.activa = false; b.presion_kpa = 40; DB.set(DB.KEYS.bomba, b);
      crearAlerta('fuente_agua', 'FALLA SIMULADA: bomba principal apagada. Presión de salida caída a ' + Math.round(b.presion_kpa) + ' kPa.', 'critica');
      toast('💥 Falla de bomba simulada.', 'error');
      sincronizarVista(true);
      break;
    }
    case 'sim-pozo-seco': {
      const fuentes = getFuentes();
      fuentes.find(f => f.tipo === 'pozo').caudal_entrada_lpm = 0;
      DB.set(DB.KEYS.fuentes, fuentes);
      crearAlerta('fuente_agua', 'FALLA SIMULADA: pozo sin caudal de entrada. Posible pozo seco.', 'critica');
      toast('🏜️ Pozo seco simulado.', 'error');
      sincronizarVista(true);
      break;
    }
    case 'sim-fuga': {
      const valvulas = getDispositivos().filter(d => d.tipo === 'valvula' && d.estado_operativo === 'activo');
      const v = valvulas[Math.floor(Math.random() * valvulas.length)];
      crearAlerta('fuente_agua', 'FUGA SIMULADA: caudal esperado ≠ caudal real en distribuidor ' + (v ? v.nombre : '—') + '. Posible fuga en tubería.', 'alta', { dispositivo_id: v ? v.id : null });
      toast('🕳️ Fuga simulada en ' + (v ? v.nombre : 'tubería'), 'warning');
      sincronizarVista(true);
      break;
    }
    case 'sim-restaurar': {
      const fuentes = getFuentes();
      fuentes.find(f => f.tipo === 'pozo').caudal_entrada_lpm = 22;
      DB.set(DB.KEYS.fuentes, fuentes);
      const b = getBomba(); b.activa = true; b.presion_kpa = 320; DB.set(DB.KEYS.bomba, b);
      flags = {};
      toast('✅ Infraestructura restaurada.', 'success');
      sincronizarVista(true);
      break;
    }
    case 'sim-lluvia': {
      const clima = DB.get(DB.KEYS.clima);
      clima.actual.cielo = 'lluvia';
      clima.actual.humedad = Math.min(95, clima.actual.humedad + 25);
      clima.actual.temperatura = Math.max(2, clima.actual.temperatura - 6);
      clima.actual.radiacion = 4;
      clima.actual.actualizado = new Date().toISOString();
      DB.set(DB.KEYS.clima, clima);
      crearAlerta('prediccion_lluvia', 'Lluvia en curso: se recomienda suspender riegos programados.', 'media');
      toast('🌧️ Lluvia simulada.', 'info');
      sincronizarVista(true);
      break;
    }
    case 'sim-calor': {
      const clima = DB.get(DB.KEYS.clima);
      clima.actual.temperatura = +(clima.actual.temperatura + 9).toFixed(1);
      clima.actual.cielo = 'soleado';
      clima.actual.radiacion = Math.min(26, clima.actual.radiacion + 7);
      clima.actual.humedad = Math.max(15, clima.actual.humedad - 15);
      clima.actual.actualizado = new Date().toISOString();
      DB.set(DB.KEYS.clima, clima);
      crearAlerta('clima', 'Ola de calor: temperatura extrema de ' + clima.actual.temperatura + ' °C. Aumentar necesidad hídrica.', 'alta');
      toast('🔥 Día caluroso simulado.', 'warning');
      sincronizarVista(true);
      break;
    }
    case 'avanzar-dia':
      simOffset += 86400000;
      toast('⏩ Tiempo simulado avanzado 1 día. Reloj: ' + nowSim().toLocaleString('es-CL'), 'info');
      sincronizarVista(true);
      break;
    case 'sim-lectura': simularLectura(false); toast('📡 Nuevas lecturas generadas.', 'success'); sincronizarVista(true); break;
    case 'sim-anomalia': simularLectura(true); toast('⚠️ Anomalía de sensor simulada.', 'warning'); sincronizarVista(true); break;
    case 'limpiar-filtros': state.histFilters = { zona: '', tipo: '', estado: '', desde: '', hasta: '' }; sincronizarVista(true); break;
    case 'exportar': exportarDatos(); toast('📤 Datos exportados a JSON.', 'success'); break;
    case 'importar': document.getElementById('importFile').click(); break;
    case 'demo':
      openModal('🎲 Generar Datos de Demo', '<p>Se reemplazarán todos los datos actuales por el set de demostración inicial. ¿Desea continuar?</p>', {
        submitLabel: 'Sí, generar',
        onSubmit() { generarDatosDemo(); flags = {}; toast('Datos de demo generados.', 'success'); navigate('dashboard'); }
      });
      break;
    case 'reset':
      openModal('♻️ Restablecer Sistema', '<p>Esta acción limpia <b>todos los datos</b> almacenados en el navegador y vuelve a los valores iniciales. ¿Continuar?</p>', {
        submitLabel: 'Sí, restablecer',
        onSubmit() { resetSistema(); flags = {}; toast('Sistema restablecido.', 'success'); navigate('dashboard'); }
      });
      break;
  }
}

/* ===== Event delegation ===== */
document.addEventListener('click', e => {
  if (e.target.closest('[data-stop]')) return;            // interruptores dentro de tarjetas clicables
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  if (['toggle-dispositivo', 'toggle-zona', 'estado-dispositivo'].includes(el.dataset.action)) return; // se manejan en 'change'
  e.preventDefault();
  // 'go' usa data-route (antes se pasaba data-id = undefined y siempre volvía al Dashboard)
  handleAction(el.dataset.action, el.dataset.action === 'go' ? el.dataset.route : el.dataset.id);
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.closest('#modalRoot')) return; // los cambios dentro de modales los maneja cada modal
  if (t.matches('[data-filter]')) {
    state.histFilters[t.dataset.filter] = t.value;
    sincronizarVista(true);
  } else if (t.matches('[data-afilter]')) {
    state.alertaFilter[t.dataset.afilter] = t.value;
    sincronizarVista(true);
  } else if (t.matches('[data-mfilter]')) {
    state.mantFilter = t.value;
    sincronizarVista(true);
  } else if (t.matches('#iaZonaSel')) {
    state.iaZonaSel = Number(t.value);
    sincronizarVista(true);
  } else if (t.matches('[data-action="toggle-zona"]')) {
    cambiarEstadoZona(Number(t.dataset.id), t.checked);
  } else if (t.matches('[data-action="toggle-dispositivo"]')) {
    const dispositivos = getDispositivos();
    const d = dispositivos.find(x => x.id === Number(t.dataset.id));
    if (d) {
      if (!t.checked) detenerRiegoDispositivo(d.id); // apagar la válvula corta el riego en curso
      const lista = getDispositivos();
      lista.find(x => x.id === d.id).estado_operativo = t.checked ? 'activo' : 'inactivo';
      DB.set(DB.KEYS.dispositivos, lista);
      toast('🔩 ' + d.nombre + (t.checked ? ' activado.' : ' desactivado.'), 'info');
      sincronizarVista(true);
    }
  } else if (t.matches('[data-action="estado-dispositivo"]')) {
    const d = dispById(t.dataset.id);
    if (d) {
      if (t.value !== 'activo') detenerRiegoDispositivo(d.id);
      const lista = getDispositivos();
      lista.find(x => x.id === d.id).estado_operativo = t.value;
      DB.set(DB.KEYS.dispositivos, lista);
      if (t.value === 'dañado') crearAlerta('dispositivo_danado', 'Dispositivo ' + d.nombre + ' marcado como dañado.', 'alta', { dispositivo_id: d.id, zona_id: d.zona_id });
      toast(d.nombre + ': estado → ' + t.value, 'info');
      sincronizarVista(true);
    }
  } else if (t.id === 'importFile' && t.files.length) {
    importarDatos(t.files[0], (ok, n) => {
      toast(ok ? 'Datos importados (' + n + ' claves).' : 'Archivo inválido.', ok ? 'success' : 'error');
      if (ok) { flags = {}; navigate('dashboard'); }
    });
    t.value = '';
  }
});

document.addEventListener('submit', e => {
  if (e.target.id === 'configForm') {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    const cfg = getConfig();
    for (const k of Object.keys(data)) {
      if (k === 'zona_horaria' || k.startsWith('hora_')) { cfg[k] = data[k]; continue; }
      const n = Number(data[k]);
      if (data[k] === '' || isNaN(n)) { toast('Valor inválido en "' + k + '".', 'error'); return; }
      cfg[k] = n;
    }
    DB.set(DB.KEYS.config, cfg);
    // Aplicar capacidades a fuentes
    const fuentes = getFuentes();
    fuentes.forEach(f => {
      if (f.tipo === 'pozo') { f.capacidad_total_litros = cfg.capacidad_pozo_litros; f.nivel_actual_litros = Math.min(f.nivel_actual_litros, f.capacidad_total_litros); }
      if (f.tipo === 'tanque') { f.capacidad_total_litros = cfg.capacidad_tanque_litros; f.nivel_actual_litros = Math.min(f.nivel_actual_litros, f.capacidad_total_litros); }
    });
    DB.set(DB.KEYS.fuentes, fuentes);
    toast('⚙️ Configuración guardada y aplicada.', 'success');
    sincronizarVista(true);
  }
});

/* ===== Navegación con botones Atrás/Adelante del navegador ===== */
window.addEventListener('hashchange', () => {
  if (state.ignoreHash) { state.ignoreHash = false; return; }
  const h = parseHash();
  navigate(h.route, h.params);
});

/* ===== Tiempo real entre pestañas: si otra pestaña cambia datos, esta se actualiza ===== */
window.addEventListener('storage', e => {
  if (e.key && e.key.startsWith('sira_')) sincronizarVista();
});

/* ===== Navegación sidebar / header ===== */
$('#nav').addEventListener('click', e => {
  const link = e.target.closest('.nav-link');
  if (link) { e.preventDefault(); navigate(link.dataset.route); }
});
$('#btnMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#btnAlerts').addEventListener('click', () => navigate('alertas'));
$('#btnConfigQuick').addEventListener('click', () => navigate('configuracion'));

/* Botón "Avanzar 1 día" global accesible desde programación */
// (se incluye dentro de la vista de programación mediante acción 'avanzar-dia')

/* ===== Redibujar gráficos al cambiar tamaño (con debounce) ===== */
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (['dashboard', 'agua', 'clima'].includes(state.route)) rerenderSilencioso(); }, 220);
});

/* =========================================================
   ARRANQUE
   ========================================================= */
function init() {
  seedIfNeeded();
  actualizarBadges();
  const h = parseHash();
  navigate(h.route, h.params);
  // Simuladores: reloj/riegos cada segundo, sensores cada 30 s, clima cada 5 min
  setInterval(simTick, 1000);
  setInterval(() => { simularLectura(false); sincronizarVista(); }, 30000);
  setInterval(() => { simularClima(); sincronizarVista(); }, 300000);
}

document.addEventListener('DOMContentLoaded', init);
