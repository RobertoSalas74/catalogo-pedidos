// Netlify function: busca proveedores para UN item. El cliente llama una vez por item, en paralelo.
// Variable de entorno requerida en Netlify: ANTHROPIC_API_KEY
// Variables en Netlify: ANTHROPIC_API_KEY y ALLOWED_ORIGIN (ej. https://tuusuario.github.io)
const cors = () => ({
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors(), body: 'Method not allowed' };
  const origin = event.headers.origin || event.headers.Origin || '';
  if (process.env.ALLOWED_ORIGIN && origin && origin !== process.env.ALLOWED_ORIGIN) return { statusCode: 403, headers: cors(), body: 'Origen no permitido' };
  let item, ciudad;
  try { ({ item, ciudad } = JSON.parse(event.body || '{}')); } catch { return { statusCode: 400, headers: cors(), body: 'JSON invalido' }; }
  if (!item) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Falta item' }) };
  ciudad = ciudad || 'Lima, Perú';

  const system = `Eres un asistente de compras industriales en Perú. Busca en la web proveedores reales para el ítem indicado en la ciudad dada.
Para cada proveedor extrae SOLO datos que veas publicados (no inventes): nombre, tipo (directo|distribuidor|marketplace), ruc (si aparece), telefono, whatsapp, correo, web, precio_ref (número en PEN o null), moneda, precio_fuente (URL), imagen_url (URL directa de la foto del producto o null), ruc_estado (verificado|declara_factura|no_factura|desconocido), vigencia (alta|media|baja según qué tan reciente/consistente parece el contacto).
Máximo 6 proveedores, prioriza directos y empresas con RUC. Marketplace: incluir siempre, con ruc_estado.
Responde ÚNICAMENTE con JSON: {"proveedores":[...]} sin texto adicional ni backticks.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages: [{ role: 'user', content: `Ítem: ${item}\nCiudad: ${ciudad}` }]
      })
    });
    const data = await r.json();
    if (!r.ok) return { statusCode: r.status, headers: cors(), body: JSON.stringify({ error: (data.error && data.error.message) || 'Error API' }) };
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return { statusCode: 200, headers: { ...cors(), 'content-type': 'application/json' }, body: JSON.stringify({ item, ...parsed, fecha: new Date().toISOString().slice(0, 10) }) };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: String(e) }) };
  }
};
