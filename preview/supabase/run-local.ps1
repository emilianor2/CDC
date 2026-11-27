$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '../..')
try {
    $networkName = 'cdc-supabase-preview'
    $network = docker network ls --filter "name=^$networkName$" --format '{{.Name}}'
    if ($LASTEXITCODE -ne 0) { throw 'Abrí Docker Desktop antes de iniciar la prueba.' }
    if (-not $network) {
        docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 $networkName | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la red local de Supabase.' }
    }

    npx --yes supabase@3.4.0 start --workdir preview/supabase --network-id $networkName -x imgproxy,studio,edge-runtime,logflare,vector,storage-api,realtime,supavisor,postgres-meta | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar Supabase.' }
    npx --yes supabase@3.4.0 migration up --workdir preview/supabase | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones locales.' }
    $config = npx --yes supabase@3.4.0 status --workdir preview/supabase -o json 2>$null | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer la configuración local.' }

    $env:SUPABASE_URL = $config.API_URL
    $env:SUPABASE_PUBLISHABLE_KEY = $config.PUBLISHABLE_KEY
    $env:SUPABASE_ADMIN_KEY = $config.SECRET_KEY
    try {
        node preview/supabase/verify.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Falló la prueba de Supabase.' }
    } finally {
        Remove-Item Env:SUPABASE_ADMIN_KEY
    }

    node preview/supabase/build-assets.mjs
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron compilar los paneles de prueba.' }
    $settingsPath = Join-Path $PSScriptRoot '.env.wrangler-local'
    try {
        $vapid = node preview/supabase/generate-vapid.mjs | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron generar las claves Web Push locales.' }
        @(
            "SUPABASE_URL=$($config.API_URL)"
            "SUPABASE_PUBLISHABLE_KEY=$($config.PUBLISHABLE_KEY)"
            "SUPABASE_ADMIN_KEY=$($config.SECRET_KEY)"
            "VAPID_PUBLIC_KEY=$($vapid.VAPID_PUBLIC_KEY)"
            "VAPID_PRIVATE_KEY=$($vapid.VAPID_PRIVATE_KEY)"
            "VAPID_SUBJECT=https://club-de-fans-supabase-preview.emilianor92.workers.dev"
        ) | Set-Content -LiteralPath $settingsPath
        Write-Host 'Las contraseñas locales están en preview/supabase/.env.demo.json.'
        npx --no-install wrangler dev --config preview/supabase/wrangler.jsonc --ip 127.0.0.1 --port 8787 --inspector-port 0 --env-file $settingsPath
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar la web de prueba.' }
    } finally {
        Remove-Item -LiteralPath $settingsPath -ErrorAction SilentlyContinue
    }
} finally {
    Pop-Location
}
