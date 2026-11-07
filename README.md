# Dolce – Pedidos en línea

Página para que cualquier persona pida postres sin crear cuenta. Tú confirmas la fecha de entrega desde un panel con contraseña.

## Cómo funciona
- **Clientes** (`/`): eligen postre → tamaño → salsa/topping (solo fresas con crema) → dejan nombre, lugar de entrega y WhatsApp (opcional). Ven los datos de pago y un botón para avisarte por WhatsApp.
- **Tú** (`/admin`): ves los pedidos, eliges la fecha de entrega, marcas pagado/entregado y avisas al cliente por WhatsApp. Con el panel abierto suena un aviso cuando llega un pedido nuevo.
- **Productos**: en el panel, pestaña *Productos*, agregas, editas, ocultas o eliminas postres, con foto, tamaños y opciones. No hay que tocar código.
- Los precios los calcula el servidor; el cliente no puede cambiarlos.

## Probar en tu computador
```bash
npm install
ADMIN_PASSWORD=tu-clave npm start      # Windows PowerShell: $env:ADMIN_PASSWORD="tu-clave"; npm start
```
Abre http://localhost:3000 (clientes) y http://localhost:3000/admin (panel).

## Publicarlo en internet
Necesitas un hosting que ejecute Node.js y tenga **disco persistente** (la base de datos es un archivo SQLite). Si el disco se borra al reiniciar, pierdes los pedidos.
1. Sube esta carpeta a un repositorio de GitHub (sin `node_modules` ni `data`, ya están en `.gitignore`).
2. Crea un servicio web Node.js en Railway, Render u otro similar conectado al repositorio.
   - Comando de inicio: `npm start`
3. Variables de entorno:
   - `ADMIN_PASSWORD`: tu contraseña del panel (larga y que no uses en otro sitio).
   - `DATA_DIR`: la ruta del disco persistente (por ejemplo `/data`).
4. Crea y monta un volumen/disco persistente en esa ruta. En varios hostings esto es de pago; los planes gratuitos suelen borrar el disco.
5. Entra a `https://tu-dominio/admin`, inicia sesión y revisa el menú.
6. Comparte el enlace de la página en tu WhatsApp, TikTok e Instagram.

## Datos que puedes cambiar en el código
- Número de WhatsApp y de pago: arriba en `public/app.js` (`WHATSAPP`, `WHATSAPP_SHOW`, `PAGO`).
- Menú inicial: `server.js` (solo se carga la primera vez; después se edita desde el panel).
- Colores y letras: `public/style.css`.

## Respaldo
Copia de vez en cuando la carpeta `DATA_DIR` (archivo `dolce.db` y carpeta `uploads`).

## Estructura
```
server.js        API (Express + SQLite), login, validación de pedidos
public/index.html, app.js   Página de clientes
public/admin.html, admin.js Panel de la dueña
public/style.css Estilos
```
