# Producción en Cloudflare

El dominio `clubdefans.ar` permanece registrado en DonWeb. Agregá el dominio
al plan Free de Cloudflare, revisá los registros DNS importados (incluidos
los del correo, si lo usás) y cambiá los servidores DNS en DonWeb a los dos
que Cloudflare asigne. Esperá a que la zona figure activa. El registro web
existente debe tener el proxy de Cloudflare activado para que la Worker Route
reciba las visitas; no borres registros DNS para publicar.
[Configuración del dominio](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/).

## Preparar la primera publicación

1. Creá una base **D1** llamada `club-de-fans`. Guardá su ID y el ID de tu
   cuenta de Cloudflare. El Action aplica las migraciones sobre esa base.
2. Guardá en el entorno de GitHub **production** el secreto
   `CLOUDFLARE_API_TOKEN` y las variables `CLOUDFLARE_ACCOUNT_ID` y
   `CLOUDFLARE_D1_DATABASE_ID`. El token requiere
   permisos de edición para Workers y D1 de esta cuenta y para las rutas
   del Worker en la zona de `clubdefans.ar`. Elegí esa cuenta y esa zona
   en el alcance del token.
   [Autenticación de CI en Cloudflare](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).
3. Hacé push a `main` o iniciá **GitHub → Actions → Club de Fans CI → Run workflow**.
   El flujo ejecuta las pruebas, guarda la compilación por commit,
   aplica las migraciones, publica el Worker y comprueba el dominio.
   Los pull requests pasan por las pruebas y la compilación.
4. En los secretos del Worker `club-de-fans`, configurá
   `SUPERADMIN_EMAILS`, `SUPERADMIN_TOTP_SECRETS` y
   `SUPERADMIN_RECOVERY_KEY` según los formatos del README. Después abrí
   `https://clubdefans.ar/admin/setup?panel=superadmin&password=setup` y
   creá la contraseña con el correo permitido, un código TOTP y la clave de
   recuperación. Este formulario no depende de Cloudflare Access. El panel
   habitual usa correo, contraseña y TOTP. Los dueños usan las credenciales
   que les crea el superadmin.

La base de producción comienza con los datos de ejemplo. Si necesitás migrar
datos de otra instancia, exportalos e importalos por separado. Para activar
avisos Web Push, configurá las claves VAPID en los secretos del Worker.
