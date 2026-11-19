// -----------------------------------------------------------------------------
// The HTTP API of Rhasspy (port 12101), optional: it tells whether the server
// is up, its version and the language of its profile. Intents and speech go
// through MQTT; nothing here is needed for them.
//   GET /api/version   -> "2.5.11" (text)
//   GET /api/profile   -> the effective profile (JSON), with `language`
// -----------------------------------------------------------------------------

export const API_TIMEOUT_MS = 5_000;

/**
 * @param {string} baseUrl `http://host:12101`, without a trailing slash
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] test seam
 * @returns {Promise<{ version: string, language: string }>}
 */
export async function getServerInfo(baseUrl, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const get = async (path) => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`${path}: HTTP ${response.status}`);
    }
    return response.text();
  };
  const version = (await get('/api/version')).trim().slice(0, 40);
  if (!/^\d+\.\d+/.test(version)) {
    throw new Error('/api/version: not a Rhasspy version');
  }
  let language = '';
  try {
    const profile = JSON.parse(await get('/api/profile'));
    language = typeof profile?.language === 'string' ? profile.language.slice(0, 20) : '';
  } catch {
    // An older server without the profile route still answers: language unknown.
  }
  return { version, language };
}
