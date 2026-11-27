create table public.perfiles (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('cliente', 'dueno', 'superadmin'))
);

create table public.comercios (
  id text primary key,
  nombre text not null
);

create table public.duenos_comercio (
  usuario_id uuid references public.perfiles(usuario_id) on delete cascade,
  comercio_id text references public.comercios(id) on delete cascade,
  primary key (usuario_id, comercio_id)
);

create table public.clientes (
  id text primary key,
  usuario_id uuid references public.perfiles(usuario_id) on delete set null,
  comercio_id text not null references public.comercios(id),
  nombre text not null,
  unique (usuario_id, comercio_id)
);

create table public.tarjetas (
  id text primary key,
  cliente_id text not null unique references public.clientes(id),
  objetivo integer not null check (objetivo between 1 and 50)
);

create table public.sellos (
  id bigint generated always as identity primary key,
  tarjeta_id text not null references public.tarjetas(id),
  creado_en timestamptz not null default now()
);

create table public.premios (
  id text primary key,
  comercio_id text not null references public.comercios(id),
  descripcion text not null,
  sellos_requeridos integer not null check (sellos_requeridos between 1 and 50)
);

create schema if not exists club_preview_private;
revoke all on schema club_preview_private from public;
grant usage on schema club_preview_private to authenticated;

create function club_preview_private.es_superadmin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where usuario_id = (select auth.uid()) and rol = 'superadmin'
  );
$$;

revoke all on function club_preview_private.es_superadmin() from public;
grant execute on function club_preview_private.es_superadmin() to authenticated;

alter table public.perfiles enable row level security;
alter table public.comercios enable row level security;
alter table public.duenos_comercio enable row level security;
alter table public.clientes enable row level security;
alter table public.tarjetas enable row level security;
alter table public.sellos enable row level security;
alter table public.premios enable row level security;

revoke all on public.perfiles, public.comercios, public.duenos_comercio,
  public.clientes, public.tarjetas, public.sellos, public.premios from anon, authenticated;
grant select on public.perfiles, public.comercios, public.duenos_comercio,
  public.clientes, public.tarjetas, public.sellos, public.premios to authenticated;
grant insert (tarjeta_id) on public.sellos to authenticated;
grant usage on sequence public.sellos_id_seq to authenticated, service_role;
grant select, insert, update on public.perfiles, public.comercios, public.duenos_comercio,
  public.clientes, public.tarjetas, public.sellos, public.premios to service_role;
grant delete on public.sellos to service_role;

create policy leer_perfiles on public.perfiles for select to authenticated
using (usuario_id = (select auth.uid()) or (select club_preview_private.es_superadmin()));

create policy leer_asignaciones on public.duenos_comercio for select to authenticated
using (
  (select club_preview_private.es_superadmin())
  or (usuario_id = (select auth.uid()) and exists (
    select 1 from public.perfiles where usuario_id = (select auth.uid()) and rol = 'dueno'
  ))
);

create policy leer_clientes on public.clientes for select to authenticated
using (
  (select club_preview_private.es_superadmin())
  or usuario_id = (select auth.uid())
  or exists (select 1 from public.duenos_comercio d where d.comercio_id = clientes.comercio_id)
);

create policy leer_comercios on public.comercios for select to authenticated
using (
  (select club_preview_private.es_superadmin())
  or exists (select 1 from public.duenos_comercio d where d.comercio_id = comercios.id)
  or exists (select 1 from public.clientes c where c.comercio_id = comercios.id)
);

create policy leer_tarjetas on public.tarjetas for select to authenticated
using (exists (select 1 from public.clientes c where c.id = tarjetas.cliente_id));

create policy leer_sellos on public.sellos for select to authenticated
using (exists (select 1 from public.tarjetas t where t.id = sellos.tarjeta_id));

create policy agregar_sello on public.sellos for insert to authenticated
with check (
  exists (
    select 1 from public.tarjetas t
    join public.clientes c on c.id = t.cliente_id
    where t.id = sellos.tarjeta_id and (
      (select club_preview_private.es_superadmin())
      or exists (select 1 from public.duenos_comercio d where d.comercio_id = c.comercio_id)
    )
  )
);

create policy leer_premios on public.premios for select to authenticated
using (exists (select 1 from public.comercios c where c.id = premios.comercio_id));
