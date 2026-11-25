import { sql } from 'drizzle-orm';
import {
  check, foreignKey, integer, primaryKey, sqliteTable, text, unique,
} from 'drizzle-orm/sqlite-core';

export const appState = sqliteTable('app_state', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  document: text('document').notNull(),
});

export const comercios = sqliteTable('comercios', {
  id: text('id').primaryKey(),
  orden: integer('orden').notNull(),
  nombre: text('nombre').notNull(),
  ciudad: text('ciudad').notNull(),
  rubro: text('rubro').notNull(),
  dueno: text('dueno').notNull(),
  activo: integer('activo', { mode: 'boolean' }).notNull(),
  totalSellos: integer('total_sellos').notNull(),
  disenoTarjeta: text('diseno_tarjeta', { mode: 'json' }),
  disenoCartel: text('diseno_cartel', { mode: 'json' }),
}, table => [
  check('comercios_activo_booleano', sql`${table.activo} IN (0, 1)`),
  check('comercios_total_sellos_valido', sql`${table.totalSellos} BETWEEN 1 AND 50`),
]);

export const clientes = sqliteTable('clientes', {
  id: text('id').primaryKey(),
  comercioId: text('comercio_id').notNull().references(() => comercios.id, { onDelete: 'cascade' }),
  orden: integer('orden').notNull(),
  nombre: text('nombre').notNull(),
  email: text('email').notNull(),
  consentimiento: integer('consentimiento', { mode: 'boolean' }).notNull(),
  consentimientoEn: text('consentimiento_en').notNull(),
}, table => [
  unique('clientes_comercio_email_unico').on(table.comercioId, table.email),
  check('clientes_consentimiento_booleano', sql`${table.consentimiento} IN (0, 1)`),
]);

export const tarjetas = sqliteTable('tarjetas', {
  clienteId: text('cliente_id').primaryKey().references(() => clientes.id, { onDelete: 'cascade' }),
  ciclo: integer('ciclo').notNull(),
  totalSellos: integer('total_sellos').notNull(),
  visitasTotal: integer('visitas_total').notNull(),
  tokenHash: text('token_hash').notNull(),
}, table => [
  check('tarjetas_ciclo_positivo', sql`${table.ciclo} >= 1`),
  check('tarjetas_total_sellos_valido', sql`${table.totalSellos} BETWEEN 1 AND 50`),
  check('tarjetas_visitas_no_negativas', sql`${table.visitasTotal} >= 0`),
]);

export const sellos = sqliteTable('sellos', {
  tarjetaId: text('tarjeta_id').notNull().references(() => tarjetas.clienteId, { onDelete: 'cascade' }),
  ciclo: integer('ciclo').notNull(),
  numero: integer('numero').notNull(),
}, table => [
  primaryKey({ columns: [table.tarjetaId, table.ciclo, table.numero] }),
  check('sellos_ciclo_positivo', sql`${table.ciclo} >= 1`),
  check('sellos_numero_valido', sql`${table.numero} BETWEEN 1 AND 50`),
]);

export const premios = sqliteTable('premios', {
  comercioId: text('comercio_id').notNull().references(() => comercios.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  orden: integer('orden').notNull(),
  sellosRequeridos: integer('sellos_requeridos').notNull(),
  descripcion: text('descripcion').notNull(),
}, table => [
  primaryKey({ columns: [table.comercioId, table.id] }),
  check('premios_sellos_validos', sql`${table.sellosRequeridos} BETWEEN 1 AND 50`),
]);

export const premiosTarjeta = sqliteTable('premios_tarjeta', {
  tarjetaId: text('tarjeta_id').notNull().references(() => tarjetas.clienteId, { onDelete: 'cascade' }),
  ciclo: integer('ciclo').notNull(),
  premioId: text('premio_id').notNull(),
  orden: integer('orden').notNull(),
  sellosRequeridos: integer('sellos_requeridos').notNull(),
  descripcion: text('descripcion').notNull(),
}, table => [
  primaryKey({ columns: [table.tarjetaId, table.ciclo, table.premioId] }),
  check('premios_tarjeta_ciclo_positivo', sql`${table.ciclo} >= 1`),
  check('premios_tarjeta_sellos_validos', sql`${table.sellosRequeridos} BETWEEN 1 AND 50`),
]);

export const canjes = sqliteTable('canjes', {
  tarjetaId: text('tarjeta_id').notNull(),
  ciclo: integer('ciclo').notNull(),
  premioId: text('premio_id').notNull(),
  orden: integer('orden').notNull(),
  canjeadoEn: text('canjeado_en').notNull(),
}, table => [
  primaryKey({ columns: [table.tarjetaId, table.ciclo, table.premioId] }),
  foreignKey({
    columns: [table.tarjetaId, table.ciclo, table.premioId],
    foreignColumns: [premiosTarjeta.tarjetaId, premiosTarjeta.ciclo, premiosTarjeta.premioId],
  }).onDelete('cascade'),
]);
