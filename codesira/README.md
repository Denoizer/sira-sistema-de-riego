# 💧 SIRA — Sistema de Riego Inteligente Adaptativo

## 📌 Datos del proyecto

| | |
|---|---|
| **Nombre del proyecto** | SIRA — Sistema de Riego Inteligente Adaptativo |
| **Estudiante** | Carlos Daniel Soldado Quispe |
| **Carrera / Universidad** | Ingeniería de Sistemas — Universidad Privada Franz Tamayo (UNIFRANZ), sede El Alto |

## 📝 Descripción del sistema

SIRA es una aplicación web de gestión de riego agrícola que automatiza y optimiza el uso del agua. Permite administrar zonas de cultivo, distribuidores (válvulas), fuentes de agua (pozo, tanque y bomba), dispositivos y sensores, además de programar riegos y recibir alertas. Incorpora un motor de IA que calcula la evapotranspiración (ET0 / ETc) con datos del clima y analiza el historial de riegos para predecir y recomendar la cantidad de agua que necesita cada zona.

---

Aplicación web **profesional y completa** de gestión de riego agrícola. Funciona
íntegramente en el navegador con **HTML5 + CSS3 + JavaScript vanilla**:
sin backend, sin base de datos y sin conexión a internet.

## 🚀 Cómo usar

1. Descomprima el archivo `.zip`.
2. Abra `index.html` en su navegador (doble clic). ¡Eso es todo!

> No requiere instalación ni servidor. Todos los datos se almacenan localmente
> en el navegador (`localStorage`).

## ✨ Funcionalidades principales

| Módulo | Descripción |
|---|---|
| 🏠 **Dashboard** | Estadísticas en vivo, riegos activos con progreso, alertas recientes, estado del sistema de agua, gráficos de consumo |
| 🌱 **Zonas de Riego** | CRUD de zonas (cultivo, suelo, extensión, Kc), detalle con historial y predicción IA, "Regar Ahora" |
| 🚰 **Distribuidores** | Activación individual, encendido/apagado con toggle, activar ahora con litros, programación, historial por válvula |
| 💧 **Fuentes de Agua** | Pozo, río/canal, tanque (visual animado) y bomba principal; diagrama de flujo animado; **simulación de fallas** (bomba, pozo seco, fuga) |
| 🌤️ **Clima y ETc** | Condiciones actuales, pronóstico 5 días, cálculo ET0 (fórmula adaptada) y ETc por zona, necesidad en litros |
| 🤖 **IA** | Entrenamiento estadístico sobre el historial (media, σ, CV, score de confianza) y predicción a 3 días con recomendación |
| 📋 **Historial** | Tabla completa con filtros (zona, tipo, estado, rango de fechas) y estadísticas del mes |
| 📡 **Dispositivos** | Inventario con estados operativos, lecturas de sensores, simulación de lecturas y anomalías por rangos |
| 🔔 **Alertas** | Bandeja con filtros, prioridades, contador de no leídas, toasts emergentes para eventos altos/críticos |
| 📅 **Programación** | Riegos futuros con repetición (una vez/diario), ejecución automática, cuenta regresiva, botón "Avanzar 1 Día" |
| 🛠️ **Mantenimiento** | Órdenes de trabajo con tipo de falla, técnico y estado |
| ⚙️ **Configuración** | Umbrales, caudales, capacidades, parámetros de IA, exportar/importar JSON, datos demo y reset |

## 🧠 Motor de IA

- **ET0** (Blaney-Criddle adaptada): `ET0 = 0.0023 × (T+17.8) × ((T+273.16)/273.16) × Rs × 0.408`, con factores de corrección por humedad y viento.
- **ETc = ET0 × Kc**; mm necesarios = ETc × 0.8; litros = mm × extensión / 1000.
- **Entrenamiento**: agrupa riegos completados por zona y calcula promedio, desviación estándar y coeficiente de variación. Confianza = 1 − CV (0–100 %). Requiere mínimo 5 registros.
- **Predicción**: ETc + historial, con incremento del 10 % por día de sequía. Clasificación: <30 L no necesario · 30–100 L corto · 100–300 L normal · >300 L extendido.
- **Detección de anomalías** por rangos: humedad 5–55 %, temperatura −5 a 55 °C, pH 3.5–10.5, conductividad 0–5000 μS/cm, nivel 0–100 %, flujo 0–200 L/min, presión 0–800 kPa.

## 🎮 Simulación en tiempo real

- Los riegos en curso avanzan cada segundo (velocidad de simulación 20×), decrementan el tanque y se completan solos.
- La bomba llena el tanque desde el pozo; si el tanque baja del umbral crítico se generan alertas.
- Lecturas de sensores automáticas cada 30 s (5 % de probabilidad de anomalía).
- Clima con deriva realista cada 5 minutos.
- Botones de demo: falla de bomba, pozo seco, fuga, lluvia, día caluroso, avanzar 1 día.

## 💾 Datos

- **Exportar**: descarga un archivo JSON con todos los datos.
- **Importar**: carga un respaldo JSON previamente exportado.
- **Restablecer**: limpia `localStorage` y vuelve a los datos iniciales.
- **Demo**: repuebla el sistema con el set de ejemplo (5 zonas, 8 dispositivos, 15 riegos históricos, 20 lecturas, 8 alertas…).

## 🌐 Navegadores recomendados

Chrome, Edge o Firefox (últimas versiones).

## 📁 Estructura

```
codesira/
├── index.html
├── css/styles.css
├── js/app.js
├── js/data.js
├── js/ia.js
├── js/charts.js
└── js/notifications.js
```

## 📄 Licencia

Proyecto de demostración educativa. Libre uso con fines de aprendizaje.

## 🔧 Cambios v1.1 (corrección de botones y tiempo real)

- **Arranque**: corregido error que impedía iniciar la app con datos nuevos (fecha inválida en el historial de demo).
- **Botones que no respondían**: la vista de Distribuidores y "Riegos activos" se reconstruía cada segundo y se "comía" los clics. Ahora solo se actualizan en sitio las barras y textos de progreso.
- **Botones "Volver" / "Ver todas" / "Ver infraestructura"** ahora navegan correctamente.
- **Tiempo real**: cualquier cambio (activar/desactivar zona o distribuidor, iniciar/detener riego, editar zona, editar horario, alertas, fallas, configuración) se refleja de inmediato en la vista actual sin recargar, y también entre pestañas abiertas.
- **Zonas**: interruptor para activar/desactivar, progreso en vivo del riego y botón "Detener Riego" en la tarjeta y en el detalle.
- **Programaciones**: nuevo botón **✏️ Editar** (zona, distribuidor, litros, fecha/hora, repetición) con atajos de hora (matutina, vespertina, ±1 h), en Programación, en el detalle de zona y en cada distribuidor.
- **Programador**: si un riego programado no puede ejecutarse, avisa una sola vez en lugar de repetir la alerta cada segundo.
- Fechas "hoy/ayer/mes" calculadas en hora local (antes en UTC).
- Navegación con los botones Atrás/Adelante del navegador.
