/* =========================================================
   notifications.js — Toasts emergentes + alertas persistentes
   ========================================================= */

const Toast = {
  MAX: 5,
  DUR: 4000,
  icons: { success: '✅', warning: '⚠️', error: '⛔', info: 'ℹ️' },

  show(mensaje, tipo = 'info', duracion = Toast.DUR) {
    const container = document.getElementById('toastContainer');
    while (container.children.length >= Toast.MAX) container.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'toast toast--' + tipo;
    el.innerHTML = '<span class="toast__icon">' + (Toast.icons[tipo] || 'ℹ️') + '</span><span>' + mensaje + '</span>';
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, duracion);
  }
};
function toast(mensaje, tipo) { Toast.show(mensaje, tipo); }

/* ===== Alertas persistentes (localStorage) ===== */

function crearAlerta(tipo, mensaje, prioridad = 'media', extra = {}) {
  const alertas = DB.get(DB.KEYS.alertas, []);
  const alerta = {
    id: uid(),
    tipo, mensaje, prioridad,
    zona_id: extra.zona_id || null,
    dispositivo_id: extra.dispositivo_id || null,
    fecha_hora: new Date().toISOString(),
    leida: false
  };
  alertas.unshift(alerta);
  if (alertas.length > 200) alertas.length = 200; // límite de historial
  DB.set(DB.KEYS.alertas, alertas);
  actualizarBadges();
  if (prioridad === 'alta' || prioridad === 'critica') {
    Toast.show(mensaje, prioridad === 'critica' ? 'error' : 'warning');
  }
  return alerta;
}

function alertasNoLeidas() {
  return DB.get(DB.KEYS.alertas, []).filter(a => !a.leida).length;
}

function actualizarBadges() {
  const n = alertasNoLeidas();
  const b1 = document.getElementById('alertBadge');
  const b2 = document.getElementById('navAlertBadge');
  [b1, b2].forEach(b => {
    if (!b) return;
    b.textContent = n > 99 ? '99+' : n;
    b.hidden = n === 0;
  });
}

function marcarTodasLeidas() {
  const alertas = DB.get(DB.KEYS.alertas, []);
  alertas.forEach(a => a.leida = true);
  DB.set(DB.KEYS.alertas, alertas);
  actualizarBadges();
}

function limpiarAlertasAntiguas(dias = 7) {
  const limite = Date.now() - dias * 86400000;
  const alertas = DB.get(DB.KEYS.alertas, []).filter(a => new Date(a.fecha_hora).getTime() >= limite);
  DB.set(DB.KEYS.alertas, alertas);
  actualizarBadges();
}

const TIPO_ALERTA_LABEL = {
  riego_iniciado: 'Riego iniciado',
  riego_finalizado: 'Riego finalizado',
  dispositivo_danado: 'Dispositivo dañado',
  fuente_agua: 'Fuente de agua',
  anomalia_sensor: 'Anomalía de sensor',
  clima: 'Clima adverso',
  prediccion_lluvia: 'Predicción de lluvia',
  ia: 'Optimización IA'
};
