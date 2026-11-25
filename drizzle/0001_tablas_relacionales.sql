CREATE TABLE `canjes` (
	`tarjeta_id` text NOT NULL,
	`ciclo` integer NOT NULL,
	`premio_id` text NOT NULL,
	`orden` integer NOT NULL,
	`canjeado_en` text NOT NULL,
	PRIMARY KEY(`tarjeta_id`, `ciclo`, `premio_id`),
	FOREIGN KEY (`tarjeta_id`,`ciclo`,`premio_id`) REFERENCES `premios_tarjeta`(`tarjeta_id`,`ciclo`,`premio_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` text PRIMARY KEY NOT NULL,
	`comercio_id` text NOT NULL,
	`orden` integer NOT NULL,
	`nombre` text NOT NULL,
	`email` text NOT NULL,
	`consentimiento` integer NOT NULL,
	`consentimiento_en` text NOT NULL,
	FOREIGN KEY (`comercio_id`) REFERENCES `comercios`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "clientes_consentimiento_booleano" CHECK("clientes"."consentimiento" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_comercio_email_unico` ON `clientes` (`comercio_id`,`email`);--> statement-breakpoint
CREATE TABLE `comercios` (
	`id` text PRIMARY KEY NOT NULL,
	`orden` integer NOT NULL,
	`nombre` text NOT NULL,
	`ciudad` text NOT NULL,
	`rubro` text NOT NULL,
	`dueno` text NOT NULL,
	`activo` integer NOT NULL,
	`total_sellos` integer NOT NULL,
	`diseno_tarjeta` text,
	`diseno_cartel` text,
	CONSTRAINT "comercios_activo_booleano" CHECK("comercios"."activo" IN (0, 1)),
	CONSTRAINT "comercios_total_sellos_valido" CHECK("comercios"."total_sellos" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE `premios` (
	`comercio_id` text NOT NULL,
	`id` text NOT NULL,
	`orden` integer NOT NULL,
	`sellos_requeridos` integer NOT NULL,
	`descripcion` text NOT NULL,
	PRIMARY KEY(`comercio_id`, `id`),
	FOREIGN KEY (`comercio_id`) REFERENCES `comercios`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "premios_sellos_validos" CHECK("premios"."sellos_requeridos" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE `premios_tarjeta` (
	`tarjeta_id` text NOT NULL,
	`ciclo` integer NOT NULL,
	`premio_id` text NOT NULL,
	`orden` integer NOT NULL,
	`sellos_requeridos` integer NOT NULL,
	`descripcion` text NOT NULL,
	PRIMARY KEY(`tarjeta_id`, `ciclo`, `premio_id`),
	FOREIGN KEY (`tarjeta_id`) REFERENCES `tarjetas`(`cliente_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "premios_tarjeta_ciclo_positivo" CHECK("premios_tarjeta"."ciclo" >= 1),
	CONSTRAINT "premios_tarjeta_sellos_validos" CHECK("premios_tarjeta"."sellos_requeridos" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE `sellos` (
	`tarjeta_id` text NOT NULL,
	`ciclo` integer NOT NULL,
	`numero` integer NOT NULL,
	PRIMARY KEY(`tarjeta_id`, `ciclo`, `numero`),
	FOREIGN KEY (`tarjeta_id`) REFERENCES `tarjetas`(`cliente_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sellos_ciclo_positivo" CHECK("sellos"."ciclo" >= 1),
	CONSTRAINT "sellos_numero_valido" CHECK("sellos"."numero" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE `tarjetas` (
	`cliente_id` text PRIMARY KEY NOT NULL,
	`ciclo` integer NOT NULL,
	`total_sellos` integer NOT NULL,
	`visitas_total` integer NOT NULL,
	`token_hash` text NOT NULL,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tarjetas_ciclo_positivo" CHECK("tarjetas"."ciclo" >= 1),
	CONSTRAINT "tarjetas_total_sellos_valido" CHECK("tarjetas"."total_sellos" BETWEEN 1 AND 50),
	CONSTRAINT "tarjetas_visitas_no_negativas" CHECK("tarjetas"."visitas_total" >= 0)
);
--> statement-breakpoint
-- Apply only the changed records in the same SQLite statement as the revision
-- update. The document keeps the rest of the application state.
CREATE TRIGGER guardar_datos_relacionales
AFTER UPDATE OF document ON app_state
WHEN NEW.id = 'main' AND json_type(NEW.document, '$.__relational') = 'object'
BEGIN
  DELETE FROM comercios
  WHERE id IN (SELECT value FROM json_each(NEW.document, '$.__relational.deletedCafes'));

  DELETE FROM clientes
  WHERE id IN (SELECT value FROM json_each(NEW.document, '$.__relational.deletedClients'));

  INSERT INTO comercios (
    id, orden, nombre, ciudad, rubro, dueno, activo, total_sellos, diseno_tarjeta, diseno_cartel
  )
  SELECT value ->> '$.item.id', value ->> '$.ordinal',
         value ->> '$.item.name', value ->> '$.item.city', value ->> '$.item.sector',
         value ->> '$.item.owner', value ->> '$.item.active', value ->> '$.item.totalStamps',
         json_extract(value, '$.item.cardDesign'), json_extract(value, '$.item.posterDesign')
  FROM json_each(NEW.document, '$.__relational.cafes')
  WHERE true
  ON CONFLICT (id) DO UPDATE SET
    orden = excluded.orden, nombre = excluded.nombre, ciudad = excluded.ciudad,
    rubro = excluded.rubro, dueno = excluded.dueno, activo = excluded.activo,
    total_sellos = excluded.total_sellos, diseno_tarjeta = excluded.diseno_tarjeta,
    diseno_cartel = excluded.diseno_cartel;

  DELETE FROM premios
  WHERE comercio_id IN (
    SELECT value ->> '$.item.id' FROM json_each(NEW.document, '$.__relational.cafes')
  );

  INSERT INTO premios (comercio_id, id, orden, sellos_requeridos, descripcion)
  SELECT comercio.value ->> '$.item.id', premio.value ->> '$.id', premio.key,
         premio.value ->> '$.at', premio.value ->> '$.label'
  FROM json_each(NEW.document, '$.__relational.cafes') AS comercio
  JOIN json_each(comercio.value, '$.item.milestones') AS premio;

  INSERT INTO clientes (id, comercio_id, orden, nombre, email, consentimiento, consentimiento_en)
  SELECT value ->> '$.item.id', value ->> '$.item.cafe', value ->> '$.ordinal',
         value ->> '$.item.name', value ->> '$.item.email', value ->> '$.item.consent',
         value ->> '$.item.consentAt'
  FROM json_each(NEW.document, '$.__relational.clients')
  WHERE true
  ON CONFLICT (id) DO UPDATE SET
    comercio_id = excluded.comercio_id, orden = excluded.orden, nombre = excluded.nombre,
    email = excluded.email, consentimiento = excluded.consentimiento,
    consentimiento_en = excluded.consentimiento_en;

  INSERT INTO tarjetas (cliente_id, ciclo, total_sellos, visitas_total, token_hash)
  SELECT value ->> '$.item.id', value ->> '$.item.cycle', value ->> '$.item.cardProgram.total',
         value ->> '$.item.visitTotal', value ->> '$.item.tokenHash'
  FROM json_each(NEW.document, '$.__relational.clients')
  WHERE true
  ON CONFLICT (cliente_id) DO UPDATE SET
    ciclo = excluded.ciclo, total_sellos = excluded.total_sellos,
    visitas_total = excluded.visitas_total, token_hash = excluded.token_hash;

  DELETE FROM sellos
  WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.document, '$.__relational.clients') AS cliente
    WHERE cliente.value ->> '$.item.id' = sellos.tarjeta_id
      AND cliente.value ->> '$.item.cycle' = sellos.ciclo
      AND cliente.value ->> '$.item.stamps' < sellos.numero
  );

  INSERT INTO sellos (tarjeta_id, ciclo, numero)
  SELECT cliente.value ->> '$.item.id', cliente.value ->> '$.item.cycle', numeros.numero
  FROM json_each(NEW.document, '$.__relational.clients') AS cliente
  JOIN (
    WITH RECURSIVE numeros(numero) AS (
      VALUES (1)
      UNION ALL SELECT numero + 1 FROM numeros WHERE numero < 50
    )
    SELECT numero FROM numeros
  ) AS numeros ON numeros.numero <= (cliente.value ->> '$.item.stamps')
  WHERE true
  ON CONFLICT (tarjeta_id, ciclo, numero) DO NOTHING;

  -- A changed program can replace the unclaimed rewards of the current card.
  DELETE FROM premios_tarjeta
  WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.document, '$.__relational.clients') AS cliente
    WHERE cliente.value ->> '$.item.id' = premios_tarjeta.tarjeta_id
      AND cliente.value ->> '$.item.cycle' = premios_tarjeta.ciclo
      AND NOT EXISTS (
        SELECT 1 FROM json_each(cliente.value, '$.item.cardProgram.milestones') AS premio
        WHERE premio.value ->> '$.id' = premios_tarjeta.premio_id
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM canjes
    WHERE canjes.tarjeta_id = premios_tarjeta.tarjeta_id
      AND canjes.ciclo = premios_tarjeta.ciclo AND canjes.premio_id = premios_tarjeta.premio_id
  );

  INSERT INTO premios_tarjeta (tarjeta_id, ciclo, premio_id, orden, sellos_requeridos, descripcion)
  SELECT cliente.value ->> '$.item.id', cliente.value ->> '$.item.cycle',
         premio.value ->> '$.id', premio.key, premio.value ->> '$.at', premio.value ->> '$.label'
  FROM json_each(NEW.document, '$.__relational.clients') AS cliente
  JOIN json_each(cliente.value, '$.item.cardProgram.milestones') AS premio
  WHERE true
  ON CONFLICT (tarjeta_id, ciclo, premio_id) DO UPDATE SET
    orden = excluded.orden, sellos_requeridos = excluded.sellos_requeridos,
    descripcion = excluded.descripcion;

  -- Legacy cards only have reward descriptions for the redeemed rewards of past cycles.
  INSERT INTO premios_tarjeta (tarjeta_id, ciclo, premio_id, orden, sellos_requeridos, descripcion)
  SELECT cliente.value ->> '$.item.id', canje.value ->> '$.cycle', canje.value ->> '$.rewardId',
         canje.key, canje.value ->> '$.at', canje.value ->> '$.label'
  FROM json_each(NEW.document, '$.__relational.clients') AS cliente
  JOIN json_each(cliente.value, '$.item.rewardHistory') AS canje
  WHERE true
  ON CONFLICT (tarjeta_id, ciclo, premio_id) DO NOTHING;

  INSERT INTO canjes (tarjeta_id, ciclo, premio_id, orden, canjeado_en)
  SELECT cliente.value ->> '$.item.id', canje.value ->> '$.cycle', canje.value ->> '$.rewardId',
         canje.key, canje.value ->> '$.time'
  FROM json_each(NEW.document, '$.__relational.clients') AS cliente
  JOIN json_each(cliente.value, '$.item.rewardHistory') AS canje
  WHERE true
  ON CONFLICT (tarjeta_id, ciclo, premio_id) DO NOTHING;

  UPDATE app_state SET document = json_remove(NEW.document, '$.__relational') WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER inicializar_datos_relacionales
AFTER INSERT ON app_state
WHEN NEW.id = 'main' AND json_type(NEW.document, '$.__relational') = 'object'
BEGIN
  UPDATE app_state SET document = NEW.document WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE VIEW estado_aplicacion AS
SELECT id, revision, json_set(
  document,
  '$.cafes', json((
    SELECT json_group_array(json(comercio))
    FROM (
      SELECT json_patch(
        json_object(
          'id', c.id, 'name', c.nombre, 'city', c.ciudad, 'sector', c.rubro, 'owner', c.dueno,
          'active', json(CASE c.activo WHEN 1 THEN 'true' ELSE 'false' END),
          'totalStamps', c.total_sellos,
          'milestones', json((
            SELECT json_group_array(json_object('id', p.id, 'at', p.sellos_requeridos, 'label', p.descripcion))
            FROM (SELECT * FROM premios WHERE comercio_id = c.id ORDER BY orden, id) AS p
          ))
        ),
        json_object('cardDesign', json(c.diseno_tarjeta), 'posterDesign', json(c.diseno_cartel))
      ) AS comercio
      FROM comercios AS c ORDER BY c.orden, c.id
    )
  )),
  '$.clients', json((
    SELECT json_group_array(json(cliente))
    FROM (
      SELECT json_object(
        'id', c.id, 'cafe', c.comercio_id, 'name', c.nombre, 'email', c.email,
        'consent', json(CASE c.consentimiento WHEN 1 THEN 'true' ELSE 'false' END),
        'consentAt', c.consentimiento_en,
        'stamps', (SELECT count(*) FROM sellos WHERE tarjeta_id = t.cliente_id AND ciclo = t.ciclo),
        'rewards', (SELECT count(*) FROM canjes WHERE tarjeta_id = t.cliente_id),
        'visitTotal', t.visitas_total, 'cycle', t.ciclo, 'tokenHash', t.token_hash,
        'claimedRewardIds', json((
          SELECT json_group_array(premio_id)
          FROM (SELECT premio_id FROM canjes WHERE tarjeta_id = t.cliente_id AND ciclo = t.ciclo ORDER BY orden)
        )),
        'rewardHistory', json((
          SELECT json_group_array(json_object(
            'rewardId', j.premio_id, 'label', p.descripcion, 'at', p.sellos_requeridos,
            'cycle', j.ciclo, 'time', j.canjeado_en
          ))
          FROM (SELECT * FROM canjes WHERE tarjeta_id = t.cliente_id ORDER BY orden) AS j
          JOIN premios_tarjeta AS p USING (tarjeta_id, ciclo, premio_id)
        )),
        'cardProgram', json_object(
          'total', t.total_sellos,
          'milestones', json((
            SELECT json_group_array(json_object(
              'id', p.premio_id, 'at', p.sellos_requeridos, 'label', p.descripcion
            ))
            FROM (
              SELECT * FROM premios_tarjeta
              WHERE tarjeta_id = t.cliente_id AND ciclo = t.ciclo ORDER BY orden, premio_id
            ) AS p
          ))
        )
      ) AS cliente
      FROM clientes AS c JOIN tarjetas AS t ON t.cliente_id = c.id
      ORDER BY c.orden, c.id
    )
  ))
) AS document
FROM app_state
WHERE id = 'main';
--> statement-breakpoint
-- Feed existing documents through the same atomic writer, preserving their revision.
UPDATE app_state
SET document = json_set(
  json_remove(document, '$.cafes', '$.clients'),
  '$.__relational', json_object(
    'cafes', json((
      SELECT json_group_array(json_object('ordinal', key, 'item', json(value)))
      FROM json_each(document, '$.cafes')
    )),
    'clients', json((
      SELECT json_group_array(json_object('ordinal', key, 'item', json(value)))
      FROM json_each(document, '$.clients')
    ))
  )
)
WHERE id = 'main' AND json_type(document, '$.cafes') = 'array';
