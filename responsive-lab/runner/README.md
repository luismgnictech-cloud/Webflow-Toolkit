# Responsive Lab: runner independiente

La interfaz en GitHub Pages funciona sin backend. Este runner local navega directamente a la URL con Playwright, mide overflow horizontal inicial y guarda capturas reales del viewport. No evita CSP/X-Frame-Options ni usa proxies: no carga el sitio dentro de un iframe. No automatiza todavía menús, formularios o la checklist completa.

## Inicio (Node.js 20 o posterior)

Clona o descarga este repositorio. Desde `responsive-lab/runner`:

```sh
npm install
npx playwright install chromium firefox webkit
# En Linux, si faltan bibliotecas del sistema:
# npx playwright install --with-deps chromium firefox webkit
```

En Responsive Lab, introduce la URL y configura de 1 a 4 viewports. Abre **Pruebas entre navegadores → Exportar configuración del runner**. Copia el archivo descargado a esta carpeta y ejecuta:

```sh
node run.mjs responsive-lab-config.json
# Incluye las instalaciones existentes de Chrome y Edge:
node run.mjs responsive-lab-config.json chromium,chrome,msedge,firefox,webkit
# Carpeta de salida opcional:
node run.mjs responsive-lab-config.json webkit ./mi-revision
```

Chrome y Edge no se instalan automáticamente. Si no están disponibles se registra `unavailable`; no se sustituye un motor por otro. El runner está fijado a Playwright **1.58.2** para reproducibilidad; actualizar exige revisar catálogo y volver a instalar binarios.

La carpeta de salida contiene `results.json` y PNG por motor y viewport. Importa `results.json` en la interfaz para adjuntarlo a los informes JSON/Markdown. Las capturas se abren localmente desde esa carpeta; no se suben ni se enlazan como si fueran una sesión interactiva. Los resultados importados son datos aportados por el usuario, no autenticados por un servidor, y no cambian los estados manuales.

Código de salida: 0 = ejecuciones completadas; 2 = al menos un motor no disponible, error HTTP o fallo. `completed` no significa que el diseño haya pasado QA: revisa `checks`, capturas y observaciones. La medición de overflow solo cubre el estado inicial de `documentElement`. Los informes pueden contener rutas y datos del sitio: revísalos antes de compartirlos.

## Qué se aplica realmente

Todos los motores usan el viewport CSS elegido, DPR 1, UA desktop predeterminado, sin touch ni emulación móvil. El DPR del preset viaja como referencia separada. Se informa versión real del navegador, versión de Playwright, sistema operativo del host, fecha, URL final, HTTP, viewport medido y origen de cada comprobación. **WebKit de Playwright no es Safari real ni ejecuta iOS.**

Para interacciones automatizadas específicas de tu Webflow, añade pasos con locators a `run.mjs` entre `page.goto` y la medición. Evita enviar formularios productivos sin autorización. No hay credenciales, CORS, endpoints remotos ni servicios de pago en el frontend.

## Completar QA real en Apple

1. Abre directamente la URL (incluidos query/hash) en Safari de un Mac y en Safari de un iPhone/iPad real. Opcional: usa un proveedor cuya sesión identifique explícitamente Safari, versión, OS y **dispositivo real**, no solo un simulador.
2. Registra navegador/versión, OS/versión, modelo, tipo de dispositivo, fecha y enlace de evidencia en **Registrar validación adicional** para cada viewport. La información se declara manualmente y no se presenta como detectada.
3. Revisa teclado y zoom al enfocar formularios; barras dinámicas y `dvh/svh`; `env(safe-area-inset-*)`; orientación; scroll de modales; sticky; reproducción de video; gestos y hover/touch. Una captura de Playwright o un marco decorativo no valida estos comportamientos.
4. Usa la checklist y observaciones para anotar los pasos y resultados. Exporta el informe junto con las capturas de la sesión real.

Fuentes: [Playwright: navegadores](https://playwright.dev/docs/browsers), [emulación](https://playwright.dev/docs/emulation), [Web Inspector de Safari](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios).

## Desarrollo y comprobaciones

Desde la raíz del repositorio: `python3 -m http.server 8000`, después abre `http://localhost:8000/responsive-lab.html`. Los recursos usan rutas relativas para funcionar también bajo `/Webflow-Toolkit/`.

`responsive-lab/fixtures/layout.html` muestra `innerWidth/innerHeight`, query/hash y media queries, y permite probar anclas, un modal y un formulario sin enviar datos. `fixtures/tool-shell.html` aloja la propia herramienta a 320, 768 o 1440 CSS px para inspeccionar su layout sin fingir cambio de navegador.

Para comprobar un bloqueo determinista local (no se puede configurar un header CSP en GitHub Pages):

```sh
python3 responsive-lab/fixtures/blocked-server.py
```

Carga `http://localhost:8765/` desde la versión **local HTTP** de Responsive Lab. Este servidor responde con `Content-Security-Policy: frame-ancestors 'none'` y `X-Frame-Options: DENY`. La interfaz debe mostrar ayuda y apertura directa sin afirmar la causa exacta ni indicar éxito por recibir `load`. No pruebes HTTP dentro de la versión HTTPS de Pages: introduciría un segundo factor de bloqueo por contenido mixto.
