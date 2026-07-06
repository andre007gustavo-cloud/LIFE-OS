/**
 * ===================== IMAGE SERVICE =====================
 * Sobe imagens das notas para o Firebase Storage e devolve a URL pública.
 * Existe porque embutir base64 direto no documento Firestore estoura o teto
 * de 1 MiB por doc e o de ~5 MiB do localStorage (ver noteEditor / storage).
 *
 * A compressão fica a cargo do chamador (Utils.compressImage) — o editor
 * já comprime uma vez para mostrar como placeholder, então repassa o blob
 * pronto pra cá e evitamos comprimir a mesma imagem duas vezes.
 */

const ImageService = (() => {

  const NOTES_PREFIX = 'notes';

  /**
   * Sobe um blob para users/{uid}/notes/{id}.jpg e devolve a URL pública.
   * Assume que o chamador já comprimiu (senão o blob vai gigante).
   */
  async function uploadNoteImage(blob) {
    const ref = FirebaseApp.getUserStorageRef(`${NOTES_PREFIX}/${Utils.uid()}.jpg`);
    if (!ref) throw new Error('Não autenticado');
    await ref.put(blob, { contentType: 'image/jpeg' });
    return ref.getDownloadURL();
  }

  /** Best-effort: apaga o arquivo do Storage. Falha silenciosa (só loga). */
  async function removeByUrl(url) {
    if (!url || !_isStorageUrl(url)) return;
    try {
      await FirebaseApp.storageRefFromUrl(url).delete();
    } catch (err) {
      console.warn('[ImageService] falha ao remover imagem:', err.code || err.message);
    }
  }

  /** URLs de imagens do Storage encontradas num HTML de nota. */
  function extractStorageUrls(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return [...div.querySelectorAll('img')]
      .map(img => img.getAttribute('src'))
      .filter(src => src && _isStorageUrl(src));
  }

  /** URLs presentes em `oldHtml` que sumiram em `newHtml`. */
  function diffRemovedUrls(oldHtml, newHtml) {
    const remaining = new Set(extractStorageUrls(newHtml));
    return extractStorageUrls(oldHtml).filter(u => !remaining.has(u));
  }

  /** Dispara delete para cada URL sem esperar (fire-and-forget). */
  function removeMany(urls) {
    (urls || []).forEach(u => removeByUrl(u));
  }

  function _isStorageUrl(url) {
    return typeof url === 'string' && url.includes('firebasestorage.googleapis.com');
  }

  return {
    uploadNoteImage, removeByUrl, removeMany,
    extractStorageUrls, diffRemovedUrls
  };
})();
