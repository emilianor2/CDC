# Prueba de login con Supabase

La rama sirve los paneles originales de cliente, dueño y superadmin con un Worker independiente y login de Supabase. Las tres cuentas, los dos comercios y las tarjetas son ficticios.

Los paneles comparten un estado de prueba persistente en PostgreSQL. El Worker valida la sesión y usa las reglas del backend de Club de Fans para limitar los datos y las operaciones de cada perfil. La tabla del estado queda reservada al servidor. Las tablas relacionales de la primera prueba se conservan para los tests de políticas de Supabase.

Las cuentas se crean desde el Action. El panel de superadmin puede crear comercios y administrar los accesos de prueba existentes. La creación de nuevas cuentas desde el panel está fuera de esta prueba.

## Docker local

Desde la raíz del repo, con Docker Desktop abierto y las dependencias de npm instaladas:

```powershell
pwsh -NoProfile -File preview/supabase/run-local.ps1
```

Abrí [la prueba local](http://127.0.0.1:8787). Las cuentas son `cliente@demo.clubdefans.test`, `dueno@demo.clubdefans.test` y `superadmin@demo.clubdefans.test`. El script genera tres contraseñas aleatorias en `.env.demo.json` dentro de esta carpeta. El archivo está excluido de Git.

Terminá el Worker con Ctrl+C. Para detener los contenedores locales conservando sus datos, ejecutá `npx --yes supabase@3.4.0 stop --project-id club-de-fans-supabase-preview --workdir preview/supabase`.

## Vista previa online

Usá un proyecto de Supabase dedicado a la prueba, con el proveedor de email habilitado y el registro público desactivado. En GitHub, creá el entorno `supabase-preview` y limitá sus despliegues a `codex/supabase-preview`.

| Tipo | Nombre | Valor |
| --- | --- | --- |
| Variable del entorno | `SUPABASE_URL` | URL HTTPS del proyecto de prueba |
| Variable del entorno | `SUPABASE_PUBLISHABLE_KEY` | Clave pública `sb_publishable_…` |
| Secreto del entorno | `SUPABASE_ADMIN_KEY` | Clave `sb_secret_…` del proyecto de prueba |
| Secreto del entorno | `SUPABASE_DB_URL` | URI PostgreSQL directa o del pooler en modo sesión. Usá la contraseña real del proyecto de prueba y `sslmode=require` |
| Secreto del entorno | `SUPABASE_DEMO_PASSWORDS` | JSON con las claves `cliente`, `dueno` y `superadmin`, cada una con una contraseña distinta de 16 caracteres o más |
| Variable del entorno | `CLOUDFLARE_ACCOUNT_ID` | ID de la cuenta de Cloudflare |
| Secreto del entorno | `CLOUDFLARE_API_TOKEN` | Token de la cuenta con permiso de edición de Workers |
| Secreto del entorno | `PREVIEW_VAPID` | JSON generado con `node preview/supabase/generate-vapid.mjs`. Conservá el mismo par de claves para mantener las suscripciones existentes |
| Variable del repositorio | `ENABLE_SUPABASE_PREVIEW` | `true` para publicar después de verificar |

Con todo configurado, subí un commit a la rama de prueba. El Action verifica login y permisos en Docker, aplica la migración al Supabase de prueba, crea y verifica las tres cuentas y publica `club-de-fans-supabase-preview` en el subdominio `workers.dev` de la cuenta. La publicación requiere que ese subdominio esté habilitado. La URL queda en el log del último paso.

## Avisos en iPhone

En iOS 16.4 o posterior, abrí la vista previa en Safari y elegí Compartir → Agregar a pantalla de inicio. Abrí la app desde el ícono, entrá como cliente y tocá **Activar avisos del comercio** en tu tarjeta. Luego entrá como dueño en otro navegador o dispositivo, abrí **Mensajes**, seleccioná al cliente con avisos activos y enviá el mensaje. El historial muestra el resultado del envío al servicio de notificaciones.
