# Taller Confección — MVP web

Aplicación web responsiva de inicio para un sistema modular de gestión de talleres de confección.
Incluye una API REST con Express y MySQL y un frontend en HTML, CSS y JavaScript.

## Módulos incluidos
- Panel de resumen.
- Gestión de clientes: listar, crear y eliminar.
- Gestión básica de pedidos: listar y crear, asociados a un cliente.
- Validación de entradas en el servidor.
- Consultas SQL parametrizadas.
- Manejo centralizado de errores.
- Variables de entorno para configuración.
- Script SQL inicial y estructura lista para Git.

> Este es un MVP académico para codificar y probar el módulo. Antes de usarlo con datos reales, añade autenticación/autorización, pruebas automatizadas, política de copias de seguridad, protección de datos y revisión de seguridad.

## Requisitos
- Node.js 20 o superior
- npm
- MySQL Server 8
- Git

## 1. Base de datos
MySQL Workbench `database/schema.sql`.
Base de datos `taller_confeccion_dev`

## 2. Configurar API
```bash
cd backend
cp .env.example .env
npm install
```
Inicia la API:
```bash
npm run dev
```
API: `http://localhost:3000`
Comprobación: `http://localhost:3000/api/health`
Clientes: `http://localhost:3000/api/clientes`
Pedidos: `http://localhost:3000/api/pedidos`

## 3. Ejecutar el frontend
```bash
cd frontend
cp .env .env
npm install
npm run dev
```
Dirección (`http://localhost:5173`).

## 4. Versionamiento con Git
```bash
git init
git add .
git commit -m "feat: estructura inicial del sistema de gestion"
```

```bash
git branch -M main
git remote add origin URL_DE_TU_REPOSITORIO
git push -u origin main
```

## Endpoints
| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | Estado de la API |
| GET | `/api/clientes` | Listar clientes |
| GET | `/api/clientes/:id` | Consultar cliente |
| POST | `/api/clientes` | Crear cliente |
| DELETE | `/api/clientes/:id` | Eliminar cliente si no tiene pedidos |
| GET | `/api/pedidos` | Listar pedidos con nombre del cliente |
| POST | `/api/pedidos` | Crear pedido |

### Ejemplo de cliente
```json
{
  "nombre": "María Pérez",
  "telefono": "3001234567",
  "correo": "maria@example.com",
  "direccion": "Piedecuesta"
}
```

### Ejemplo de pedido
```json
{
  "cliente_id": 1,
  "descripcion": "Vestido de fiesta",
  "fecha_entrega": "2026-11-15",
  "prioridad": "media",
  "estado": "pendiente",
  "valor": 180000
}
```

## Estándares aplicados
- Nombres descriptivos y consistentes.
- Separación por capas: rutas, controladores, servicios y acceso a datos.
- Validación de entradas en servidor.
- SQL parametrizado para evitar inyección SQL.
- Variables sensibles fuera del código fuente (`.env`).
- Middleware de seguridad HTTP (`helmet`) y CORS configurable.
- Respuestas HTTP y errores consistentes.
- Comentarios en los puntos de configuración y reglas de negocio.
- `npm run lint` para ESLint.
