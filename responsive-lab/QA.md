# Validación de entrega — 25 septiembre 2026

Entorno disponible: navegador Chrome del entorno de revisión, GitHub Pages bajo `/Webflow-Toolkit/`. No se ejecutaron aquí Firefox, WebKit, Chrome/Edge locales ni Safari/macOS/iOS reales. El runner se revisó y pasó comprobación de sintaxis; falta ejecutarlo en el equipo de destino con sus binarios instalados.

## Verificado

- Navegación a Responsive Lab desde las tres herramientas existentes. Generador SEO produjo un resultado; Code Playground cargó su iframe; compresor cargó sus controles. En esas páginas solo se añadió el enlace de navegación; no se modificaron sus scripts.
- Fixture controlada embebida: 1920 CSS px activa `min-width:1920px` incluso al 25% (ancho visual medido de 480 px).
- Media queries a ambos lados de los seis límites: 479/480, 767/768, 991/992, 1279/1280, 1439/1440, 1919/1920. Lecturas de estilo CSS verificadas; los eventos `resize` del fixture se actualizan en el siguiente frame.
- Hasta cuatro vistas; quinta deshabilitada. Giro personalizado e iPhone 13 Mini usando el descriptor landscape. Marco opcional.
- Resize por teclado y arrastre real: 375 × 629 → 425 × 679 CSS px, confirmado por el documento de prueba.
- URL de fixture conservó `?lab=demo#intro`. Anclas, formulario local, apertura y cierre de modal con Escape funcionaron dentro del iframe.
- Preset personalizado, favorito, notas y estados persistieron tras recargar. Reset mantuvo favoritos/presets; borrar datos eliminó ambos tras recarga.
- Archivo JSON descargado e inspeccionado: cuatro vistas, histórico de observaciones y entorno conocido. Configuración del runner y Markdown descargados. Se corrigió y verificó la continuidad de filas de tablas Markdown.
- Se rechazó la importación de un JSON de configuración como si fuera un resultado; no se mostraron resultados ficticios.
- URL externa de GitHub mostró una vista de error del navegador. La interfaz indicó contenido no verificable y ofreció ayuda/apertura directa, sin declarar la causa ni presentar `load` como éxito. No se eludió el bloqueo.
- El propio dashboard fue alojado en contenedores de 320, 768 y 1440 CSS px. `scrollWidth` coincidió con `clientWidth` en los tres (305, 753, 1425 px tras descontar scrollbar). Inspección visual de móvil; checklist estrecha ajustada a una columna.
- Validación de sintaxis de módulos/runner; pruebas de normalización HTTP(S), conservación query/hash, rechazo de credenciales y esquemas inseguros, límites de dimensiones, aislamiento de revisiones e informe Markdown.

## Pendiente / límites de esta validación

- Ejecutar el runner en cada motor y revisar sus PNG/resultados, incluida importación de un informe real. No hay infraestructura remota conectada.
- Completar Safari/macOS y Safari/iOS en hardware real, especialmente teclado, safe areas, barras dinámicas, touch, reproducción y scroll. No se certifica compatibilidad Apple a partir del iframe.
- El control de captura utiliza `getDisplayMedia` y requiere selección del usuario. No se aceptó una selección de pantalla durante esta QA. Si el navegador no dispone de la API, el control queda deshabilitado con explicación.
- El fixture local `blocked-server.py` ofrece headers deterministas para repetir el caso de denegación. No se ejecutó ese servidor dentro del navegador remoto de revisión.
- La ausencia de overflow del dashboard y la navegación por teclado comprobada no equivalen a una auditoría completa con lectores de pantalla.
