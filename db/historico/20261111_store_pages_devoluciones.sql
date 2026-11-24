-- Migración: tabla store_pages + páginas iniciales de devoluciones/returns
-- Idempotente: CREATE IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING
-- Ejecutar en PROD solo con OK de ROI (ver texto en S6 del doc).

-- ── 1. Tabla ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_pages (
  id           SERIAL      PRIMARY KEY,
  business_id  INTEGER     NOT NULL,
  slug         TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL DEFAULT '',
  is_published BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, slug)
);

-- ── 2. MALEMA — Política de devoluciones (es) ────────────────────────────────
INSERT INTO store_pages (business_id, slug, title, content, is_published)
VALUES (
  1,
  'devoluciones',
  'Política de devoluciones',
  $html$<h2>Resumen de nuestra política</h2>
<p>Solo aceptamos devoluciones por artículos con defecto de fabricación comprobado. No realizamos cambios de talle, color ni por preferencia del cliente.</p>

<h2>Devoluciones aceptadas</h2>
<p>Aceptamos la devolución de un artículo únicamente cuando presenta un <strong>defecto de fabricación</strong> comprobable, es decir, una falla que no sea producto del uso normal del producto ni de su manipulación incorrecta.</p>
<ul>
  <li>Costuras rotas en la prenda sin haber sido usada</li>
  <li>Estampado o bordado con defecto visible</li>
  <li>Artículo diferente al que fue adquirido (error de despacho)</li>
</ul>

<h2>Condiciones para la devolución</h2>
<ul>
  <li>El artículo debe estar sin uso, con etiquetas originales y en su embalaje original</li>
  <li>La solicitud debe realizarse dentro de los <strong>7 días corridos</strong> desde la recepción del pedido</li>
  <li>Es necesario presentar comprobante de compra</li>
  <li>El artículo debe ser enviado a nuestra dirección con flete a cargo del cliente, salvo que el defecto sea confirmado, en cuyo caso reembolsamos el costo de envío</li>
</ul>

<h2>Cambios — no aceptados</h2>
<p><strong>No realizamos cambios de talle, color ni modelo</strong> por preferencia o error del comprador. Te recomendamos consultar la tabla de talles antes de realizar tu compra y contactarnos ante cualquier duda.</p>

<h2>Cómo iniciar una devolución</h2>
<ol>
  <li>Contactanos con una foto del defecto y el número de pedido</li>
  <li>Nuestro equipo evalúa el caso dentro de las 48 horas hábiles</li>
  <li>Si el defecto es confirmado, coordinamos el envío de devolución</li>
  <li>Una vez recibido y verificado el artículo, procesamos el reembolso o reposición según disponibilidad de stock</li>
</ol>$html$,
  true
)
ON CONFLICT (business_id, slug) DO NOTHING;

-- ── 3. NULARIONE — Return Policy (en) ───────────────────────────────────────
-- Si el negocio no existe (dev), el SELECT devuelve 0 filas y no inserta nada.
INSERT INTO store_pages (business_id, slug, title, content, is_published)
SELECT
  b.id,
  'returns',
  'Return Policy',
  $html$<h2>Policy Overview</h2>
<p>We only accept returns for items with a proven manufacturing defect. We do not offer exchanges for size, color, or personal preference.</p>

<h2>Accepted Returns</h2>
<p>We accept a return only when the item has a <strong>verifiable manufacturing defect</strong> — a flaw that is not the result of normal use or improper handling.</p>
<ul>
  <li>Broken seams on unworn garments</li>
  <li>Visible printing or embroidery defects</li>
  <li>Item different from what was ordered (dispatch error)</li>
</ul>

<h2>Return Requirements</h2>
<ul>
  <li>Item must be unused, with original tags attached and in original packaging</li>
  <li>Request must be submitted within <strong>7 days</strong> of receiving your order</li>
  <li>Proof of purchase is required</li>
  <li>Return shipping is at the customer's expense unless the defect is confirmed, in which case we will reimburse the shipping cost</li>
</ul>

<h2>Exchanges — Not Accepted</h2>
<p><strong>We do not offer exchanges for size, color, or model</strong> due to buyer preference or error. We recommend checking the size guide before purchasing and contacting us if you have any questions.</p>

<h2>How to Start a Return</h2>
<ol>
  <li>Contact us with a photo of the defect and your order number</li>
  <li>Our team will review your case within 48 business hours</li>
  <li>If the defect is confirmed, we will coordinate the return shipment</li>
  <li>Once we receive and inspect the item, we will process a refund or replacement depending on stock availability</li>
</ol>$html$,
  true
FROM business b
WHERE LOWER(b.name) = 'nularione'
ON CONFLICT (business_id, slug) DO NOTHING;
