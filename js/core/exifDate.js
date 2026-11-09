/**
 * ===================== EXIF DATE =====================
 * Lê a data em que a foto foi tirada (EXIF) de um JPEG, sem DOM.
 * Depende só de Utils (validação e "hoje"). Nunca lança: qualquer erro vira null.
 */
const ExifDate = (() => {
  const TAG_EXIF_POINTER = 0x8769;
  const TAG_DATE_ORIGINAL = 0x9003;
  const TAG_DATE_TIME = 0x0132;
  const TYPE_ASCII = 2;
  const ENTRY_SIZE = 12;
  const MAX_IFD_ENTRIES = 1000; // acima disso o arquivo está corrompido
  const DATE_TEXT_LENGTH = 10; // 'YYYY:MM:DD'
  const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  const MARKER_SOS = 0xDA;
  const MARKER_APP1 = 0xE1;

  function _hasBytes(view, offset, bytes) {
    if (offset < 0 || offset + bytes.length > view.byteLength) return false;
    return bytes.every((b, i) => view.getUint8(offset + i) === b);
  }

  // Marcadores sem tamanho: padding 0xFF, TEM, SOI e RSTn
  function _isStandalone(marker) {
    return marker === 0xFF || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD8);
  }

  /** Offset do cabeçalho TIFF dentro do APP1 "Exif", ou -1 */
  function _findTiffStart(view) {
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return -1;
    let pos = 2;
    while (pos + 4 <= view.byteLength) {
      if (view.getUint8(pos) !== 0xFF) return -1;
      const marker = view.getUint8(pos + 1);
      if (marker === MARKER_SOS) return -1;
      if (_isStandalone(marker)) { pos += marker === 0xFF ? 1 : 2; continue; }
      const length = view.getUint16(pos + 2);
      if (length < 2) return -1;
      if (marker === MARKER_APP1 && _hasBytes(view, pos + 4, EXIF_HEADER)) return pos + 4 + EXIF_HEADER.length;
      pos += 2 + length;
    }
    return -1;
  }

  /** Ordem de bytes do TIFF: true = little-endian (II), false = big (MM), null = inválido */
  function _byteOrder(view, tiffStart) {
    if (tiffStart + 8 > view.byteLength) return null;
    const mark = view.getUint16(tiffStart);
    const little = mark === 0x4949;
    if (!little && mark !== 0x4D4D) return null;
    return view.getUint16(tiffStart + 2, little) === 42 ? little : null;
  }

  /** Entradas do IFD como Map(tag → {type, count, field}); null se fora dos limites */
  function _ifdEntries(view, ifdStart, little) {
    if (ifdStart < 0 || ifdStart + 2 > view.byteLength) return null;
    const count = view.getUint16(ifdStart, little);
    if (count > MAX_IFD_ENTRIES || ifdStart + 2 + count * ENTRY_SIZE > view.byteLength) return null;
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      const at = ifdStart + 2 + i * ENTRY_SIZE;
      entries.set(view.getUint16(at, little), {
        type: view.getUint16(at + 2, little),
        count: view.getUint32(at + 4, little),
        field: at + 8,
      });
    }
    return entries;
  }

  /** 'YYYY:MM:DD' de uma entrada ASCII, ou null */
  function _asciiDateAt(view, entry, tiffStart, little) {
    if (!entry || entry.type !== TYPE_ASCII || entry.count < DATE_TEXT_LENGTH) return null;
    const start = entry.count > 4 ? tiffStart + view.getUint32(entry.field, little) : entry.field;
    if (start < 0 || start + DATE_TEXT_LENGTH > view.byteLength) return null;
    let text = '';
    for (let i = 0; i < DATE_TEXT_LENGTH; i++) text += String.fromCharCode(view.getUint8(start + i));
    return text;
  }

  /** 'YYYY:MM:DD' → 'YYYY-MM-DD' se for data real e não futura; senão null */
  function _toIsoDate(text) {
    const match = /^(\d{4}):(\d{2}):(\d{2})$/.exec(text || '');
    if (!match) return null;
    const iso = `${match[1]}-${match[2]}-${match[3]}`;
    if (iso < '0001-01-01' || Utils.toISO(Utils.parseISO(iso)) !== iso) return null;
    return iso > Utils.today() ? null : iso;
  }

  function _exifIfdEntries(view, ifd0, tiffStart, little) {
    const pointer = ifd0.get(TAG_EXIF_POINTER);
    if (!pointer) return null;
    return _ifdEntries(view, tiffStart + view.getUint32(pointer.field, little), little);
  }

  function _readDate(view) {
    const tiffStart = _findTiffStart(view);
    if (tiffStart < 0) return null;
    const little = _byteOrder(view, tiffStart);
    if (little === null) return null;
    const ifd0 = _ifdEntries(view, tiffStart + view.getUint32(tiffStart + 4, little), little);
    if (!ifd0) return null;
    const exif = _exifIfdEntries(view, ifd0, tiffStart, little);
    const original = exif && _asciiDateAt(view, exif.get(TAG_DATE_ORIGINAL), tiffStart, little);
    return _toIsoDate(original) || _toIsoDate(_asciiDateAt(view, ifd0.get(TAG_DATE_TIME), tiffStart, little));
  }

  /** ArrayBuffer de um JPEG → 'YYYY-MM-DD' (data da foto) ou null */
  function fromBuffer(arrayBuffer) {
    try {
      return _readDate(new DataView(arrayBuffer));
    } catch (e) {
      return null;
    }
  }

  return { fromBuffer };
})();
