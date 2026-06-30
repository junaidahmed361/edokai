exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'method not allowed' }) };
  }

  const env = process.env;
  const supabaseUrl = (env.EDOKAI_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://lfnpcgcxezyjcgnpcagq.supabase.co').replace(/\/$/, '');
  const anonKey = env.EDOKAI_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const table = (event.queryStringParameters && event.queryStringParameters.table) || env.EDOKAI_DKG_TABLE || env.VITE_EDOKAI_DKG_TABLE || 'edokai_dkg_snapshots';
  const rowId = (event.queryStringParameters && event.queryStringParameters.row) || env.EDOKAI_DKG_ROW_ID || env.VITE_EDOKAI_DKG_ROW_ID || 'latest';

  const headers = {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  };

  if (!anonKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: 'Supabase anon key missing on server. Set EDOKAI_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY in Netlify environment variables.' }) };
  }

  const select = encodeURIComponent('id,payload,updated_at');
  const url = `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?select=${select}&id=eq.${encodeURIComponent(rowId)}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        accept: 'application/json',
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return { statusCode: res.status, headers, body: JSON.stringify({ ok: false, error: `Supabase HTTP ${res.status}`, detail: text.slice(0, 500) }) };
    }
    let rows = [];
    try { rows = JSON.parse(text); } catch { rows = []; }
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, empty: true, payload: null, updated_at: null }) };
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: row.id, payload: row.payload, updated_at: row.updated_at }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
