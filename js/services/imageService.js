/**
 * ===================== IMAGE SERVICE =====================
 * Guarda imagens das notas dentro do próprio Firestore (subcoleção
 * `users/{uid}/noteImages/{id}` com o base64 comprimido no campo `dataUrl`).
 *
 * Por que subcoleção e não Storage: Storage exige plano Blaze (cartão) desde
 * out/2024. O Firestore free tier dá 1 GiB — cabem ~3-5 mil imagens. Cada
 * imagem vira 1 doc, ficando bem abaixo do limite de 1 MiB por documento;
 * o doc principal do usuário fica pequeno porque a nota só guarda o ID.
 *
 * A compressão é responsabilidade do chamador (Utils.compressImage).
 */

const ImageService = (() => {

  const SUBCOLLECTION = 'noteImages';

  function _collection() {
    const userDoc = FirebaseApp.getUserDoc();
    return userDoc ? userDoc.collection(SUBCOLLECTION) : null;
  }

  /**
   * Grava a data URL comprimida em um novo doc e devolve o ID gerado.
   * Falha rápido se não estiver autenticado (bubble up para o chamador exibir).
   */
  async function uploadImage(dataUrl) {
    const col = _collection();
    if (!col) throw new Error('Não autenticado');
    const ref = col.doc(Utils.uid());
    await ref.set({
      dataUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return ref.id;
  }

  /** Lê o dataUrl de uma imagem pelo ID. Retorna null se não existir/erro. */
  async function fetchImage(id) {
    const col = _collection();
    if (!col || !id) return null;
    try {
      const snap = await col.doc(id).get();
      return snap.exists ? (snap.data().dataUrl || null) : null;
    } catch (err) {
      console.warn('[ImageService] falha ao buscar imagem:', err.code || err.message);
      return null;
    }
  }

  /** Best-effort: deleta doc da imagem. Falha silenciosa (só loga). */
  async function removeById(id) {
    const col = _collection();
    if (!col || !id) return;
    try {
      await col.doc(id).delete();
    } catch (err) {
      console.warn('[ImageService] falha ao remover imagem:', err.code || err.message);
    }
  }

  /** Dispara delete para cada ID sem esperar (fire-and-forget). */
  function removeMany(ids) {
    (ids || []).forEach(id => removeById(id));
  }

  /** IDs de imagens (data-image-id) referenciados no HTML da nota. */
  function extractIds(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return [...div.querySelectorAll('img[data-image-id]')]
      .map(img => img.getAttribute('data-image-id'))
      .filter(Boolean);
  }

  /** IDs em `oldHtml` que sumiram em `newHtml` — para deletar do Firestore. */
  function diffRemovedIds(oldHtml, newHtml) {
    const remaining = new Set(extractIds(newHtml));
    return extractIds(oldHtml).filter(id => !remaining.has(id));
  }

  return {
    uploadImage, fetchImage, removeById, removeMany,
    extractIds, diffRemovedIds
  };
})();
