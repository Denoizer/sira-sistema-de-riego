/* =========================================================
   ia.js — Motor de IA estadístico y cálculo de necesidad hídrica
   - ET0 con fórmula simplificada tipo Blaney-Criddle adaptada
   - Entrenamiento estadístico sobre el historial de riegos
   - Predicción a 3 días con factor de sequía
   - Detección de anomalías por rangos
   ========================================================= */

const RANGOS_SENSOR = {
  humedad: [5, 55],
  temperatura: [-5, 55],
  ph: [3.5, 10.5],
  conductividad: [0, 5000],
  nivel: [0, 100],
  flujo: [0, 200],
  presion: [0, 800]
};

class IAEstudio {

  /** ET0 (mm/día) con fórmula adaptada + factores de corrección */
  static calcularET0(T, HR, Rs, V) {
    const ET0 = 0.0023 * (T + 17.8) * ((T + 273.16) / 273.16) * Rs * 0.408;
    const factorHumedad = 1 + (50 - HR) / 200;
    const factorViento = 1 + (V - 2) / 20;
    return Math.max(0, ET0 * factorHumedad * factorViento);
  }

  /** Necesidad hídrica de una zona en litros, a partir del clima actual */
  static necesidadLitros(zona) {
    const c = getConfig();
    const clima = DB.get(DB.KEYS.clima, null);
    if (!clima || !zona) return null;
    const a = clima.actual;
    const ET0 = IAEstudio.calcularET0(a.temperatura, a.humedad, a.radiacion, a.viento) * c.et0_factor_ajuste;
    const ETc = ET0 * zona.coeficiente_cultivo_kc;
    const mmNecesarios = ETc * 0.8;
    const litros = Math.round(mmNecesarios * zona.extension_m2 / 1000);
    return { ET0: +ET0.toFixed(2), ETc: +ETc.toFixed(2), mm: +mmNecesarios.toFixed(2), litros };
  }

  /** Entrenamiento: estadísticas por zona sobre riegos completados */
  static entrenarModelo() {
    const cfg = getConfig();
    const riegos = getRiegos().filter(r => r.estado === 'completado' && r.cantidad_agua_litros > 0);
    if (riegos.length < cfg.ia_min_registros) {
      return { exito: false, faltan: cfg.ia_min_registros - riegos.length, registros: riegos.length };
    }
    const porZona = {};
    riegos.forEach(r => {
      (porZona[r.zona_id] = porZona[r.zona_id] || []).push(r.cantidad_agua_litros);
    });
    const zonasStats = Object.keys(porZona).map(zid => {
      const vals = porZona[zid];
      const n = vals.length;
      const promedio = vals.reduce((s, v) => s + v, 0) / n;
      const varianza = vals.reduce((s, v) => s + Math.pow(v - promedio, 2), 0) / n;
      const desviacion = Math.sqrt(varianza);
      const cv = promedio > 0 ? desviacion / promedio : 1;
      return {
        zona_id: Number(zid), n,
        promedio: +promedio.toFixed(1),
        desviacion: +desviacion.toFixed(2),
        cv: +cv.toFixed(3),
        confianza: Math.round(Math.max(0, Math.min(1, 1 - cv)) * 100)
      };
    });
    const score = Math.round(zonasStats.reduce((s, z) => s + z.confianza, 0) / zonasStats.length);
    const modelo = {
      entrenado_en: new Date().toISOString(),
      registros_usados: riegos.length,
      zonas: zonasStats,
      score
    };
    DB.set(DB.KEYS.modelo, modelo);
    return { exito: true, modelo };
  }

  /** Clasificación por umbral de litros */
  static clasificar(litros) {
    if (litros < 30) return { key: 'riego_no_necesario', label: 'No necesario', pill: 'pill--muted' };
    if (litros <= 100) return { key: 'riego_corto', label: 'Riego corto', pill: 'pill--info' };
    if (litros <= 300) return { key: 'riego_normal', label: 'Riego normal', pill: 'pill--success' };
    return { key: 'riego_extendido', label: 'Riego extendido', pill: 'pill--warning' };
  }

  /** Predicción de riego para N días (factor de sequía +10%/día) */
  static predecirRiego(zonaId, dias = 3) {
    const zona = zonaById(zonaId);
    if (!zona) return [];
    const base = IAEstudio.necesidadLitros(zona);
    const modelo = DB.get(DB.KEYS.modelo, null);
    const stat = modelo ? modelo.zonas.find(z => z.zona_id === Number(zonaId)) : null;
    const predicciones = [];
    for (let i = 0; i < dias; i++) {
      const f = new Date(); f.setDate(f.getDate() + i + 1);
      const factorSequia = 1 + 0.10 * i;
      let litros = base.litros * factorSequia;
      // Fusión con historial si el modelo fue entrenado
      if (stat && stat.n >= getConfig().ia_min_registros) {
        litros = litros * 0.6 + stat.promedio * 0.4 * factorSequia;
      }
      litros = Math.round(litros);
      const clase = IAEstudio.clasificar(litros);
      const dur = Math.max(1, Math.round(litros / getConfig().caudal_default_lpm));
      predicciones.push({
        fecha: f.toISOString().slice(0, 10),
        necesita: litros >= 30,
        litros,
        duracion_min: dur,
        recomendacion: clase.key,
        recomendacion_label: clase.label,
        pill: clase.pill,
        confianza: stat ? stat.confianza : 0
      });
    }
    return predicciones;
  }

  /** Detección de anomalía por rango del sensor */
  static detectarAnomalia(tipoSensor, valor) {
    const r = RANGOS_SENSOR[tipoSensor];
    if (!r) return false;
    return valor < r[0] || valor > r[1];
  }

  /** Confianza global del modelo entrenado (0-100) */
  static confianzaModelo() {
    const m = DB.get(DB.KEYS.modelo, null);
    return m ? m.score : 0;
  }
}
