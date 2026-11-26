# Producción en Cloudflare

El dominio `clubdefans.ar` permanece registrado en DonWeb. Agregá el dominio
al plan Free de Cloudflare, revisá los registros DNS importados (incluidos
los del correo, si lo usás) y cambiá los servidores DNS en DonWeb a los dos
que Cloudflare asigne. Esperá a que la zona figure activa.
[Configuración del dominio](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/).

## Preparar la primera publicación

1. Creá una base **D1** llamada `club-de-fans`. Guardá su ID y el ID de tu
   cuenta de Cloudflare. El Action aplica las migraciones sobre esa base.
2. En **Zero Trust → Access → Applications**, creá una aplicación
   autoalojada para `clubdefans.ar/admin/setup` y
   `clubdefans.ar/admin/setup/*` dentro de la misma aplicación. Permití
   únicamente los correos de superadmin. Copiá el **Application Audience
   (AUD)**. El acceso de clientes y dueños sigue abierto a través de sus
   rutas normales. Zero Trust Free puede pedir datos de pago al activarlo,
   con un cargo de USD 0 en ese plan.
   [Rutas de Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
   · [Alta de Zero Trust Free](https://developers.cloudflare.com/learning-paths/clientless-access/initial-setup/create-zero-trust-org/).
3. Guardá en el entorno de GitHub **production** el secreto
   `CLOUDFLARE_API_TOKEN` y las variables `CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_D1_DATABASE_ID` y `CLOUDFLARE_ACCESS_AUD`. El token requiere
   permisos de edición para Workers y D1 de esta cuenta y para las rutas
   del Worker en la zona de `clubdefans.ar`. Elegí esa cuenta y esa zona
   en el alcance del token.
   [Autenticación de CI en Cloudflare](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
4. Cuando el dominio, D1 y Access estén listos, creá la variable de
   **repositorio** `CLOUDFLARE_DEPLOY_ENABLED=true`. Iniciá
   **GitHub → Actions → Club de Fans CI → Run workflow** desde `main`.
   El flujo ejecuta las pruebas, guarda la compilación por commit,
   aplica las migraciones, publica el Worker y comprueba el dominio.
   Los pull requests pasan por las pruebas y la compilación.
5. En los secretos del Worker `club-de-fans`, configurá
   `SUPERADMIN_EMAILS`, `SUPERADMIN_TOTP_SECRETS` y
   `SUPERADMIN_RECOVERY_KEY` según los formatos del README. En el panel de
   superadmin, usá el enlace para crear la contraseña con tu identidad
   de Access, un código TOTP y la clave de recuperación. El panel habitual
   usa correo, contraseña y TOTP. Los dueños usan las credenciales
   que les crea el superadmin.

La base de producción comienza con los datos de ejemplo. Si necesitás migrar
datos de otra instancia, exportalos e importalos por separado. Para activar
avisos Web Push, configurá las claves VAPID en los secretos del Worker.
