/**
 * ===================== OFX SERVICE (Fase 8) =====================
 * Parser de arquivos OFX (SGML v102) do Nubank. Funções puras: recebem o
 * texto/bytes do arquivo e devolvem dados normalizados. ZERO DOM, ZERO estado.
 *
 * Dois formatos roteados pelo wrapper:
 *   <CREDITCARDMSGSRSV1>/<CCSTMTRS> → FATURA do cartão  (tipo 'cartao')
 *   <BANKMSGSRSV1>/<STMTRS>         → EXTRATO da conta   (tipo 'conta')
 *
 * Dinheiro em centavos inteiros; datas via Utils (parse local). Ver CLAUDE.md.
 */

const OFXService = (() => {

  /**
   * Decodifica o ArrayBuffer do arquivo respeitando o header. Extrato vem UTF-8;
   * fatura vem USASCII com CHARSET 1252 (Windows-1252) — sem isso os acentos do
   * MEMO quebram. O header é sempre ASCII puro, então lê-lo byte-a-byte basta.
   */
  function decodeBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let head = '';
    for (let i = 0; i < Math.min(bytes.length, 2048); i++) head += String.fromCharCode(bytes[i]);
    const is1252 = /CHARSET:\s*1252/i.test(head)
      || (/ENCODING:\s*USASCII/i.test(head) && !/ENCODING:\s*UTF-8/i.test(head));
    const label = is1252 ? 'windows-1252' : 'utf-8';
    try {
      return new TextDecoder(label).decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }

  /** Detecta o tipo pelo wrapper. Checa cartão primeiro (CCSTMTRS contém STMTRS como substring). */
  function detectarTipoOFX(texto) {
    const t = texto || '';
    if (/<CREDITCARDMSGSRSV1|<CCSTMTRS/i.test(t)) return 'cartao';
    if (/<BANKMSGSRSV1|<STMTRS/i.test(t)) return 'conta';
    return null;
  }

  // ===== Extração de tags SGML =====
  // No SGML do OFX as tags de valor não têm fechamento: o valor vai do '>' até
  // o próximo '<' ou quebra de linha. Ex.: "<MEMO>Padaria do Zé\n".

  function _tagValue(bloco, tag) {
    const m = bloco.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim() : '';
  }

  /** Os 8 primeiros dígitos do DTPOSTED/DTSTART/DTEND (YYYYMMDD) → ISO local. */
  function _dataDeOFX(valor) {
    const v = (valor || '').replace(/[^0-9]/g, '');
    if (v.length < 8) return '';
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }

  /** Centavos inteiros a partir do TRNAMT decimal (sempre positivo). */
  function _centavosDeTRNAMT(valor) {
    const n = parseFloat(String(valor || '').replace(',', '.'));
    if (!isFinite(n)) return 0;
    return Math.round(Math.abs(n) * 100);
  }

  /**
   * Extrai parcela e descrição base de um MEMO.
   *   "TV Samsung - Parcela 2/10"  → { num:2, total:10 }, base "TV Samsung"
   * Regex principal exige a palavra "Parcela"; fallback aceita só "N/M".
   * Parcelamento só conta com total >= 2.
   */
  function _parseParcela(memo) {
    const texto = memo || '';
    let m = texto.match(/Parcela\s+(\d+)\s*\/\s*(\d+)/i);
    if (!m) m = texto.match(/\b(\d+)\s*\/\s*(\d+)\b/);
    if (!m) return { parcela: null, base: texto.trim() };
    const num = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (!total || total < 2 || num > total) return { parcela: null, base: texto.trim() };
    const base = texto
      .replace(/\s*[-–]?\s*Parcela\s+\d+\s*\/\s*\d+/i, '')
      .replace(/\s*\d+\s*\/\s*\d+\s*$/, '')
      .replace(/\s*[-–]\s*$/, '')
      .trim();
    return { parcela: { num, total }, base: base || texto.trim() };
  }

  /** Blocos <STMTTRN>...</STMTTRN> do texto. */
  function _blocosTransacao(texto) {
    return (texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || []);
  }

  function _parseLinha(bloco) {
    const memo = _tagValue(bloco, 'MEMO') || _tagValue(bloco, 'NAME');
    const { parcela, base } = _parseParcela(memo);
    const tipoMov = (_tagValue(bloco, 'TRNTYPE') || '').toUpperCase() === 'CREDIT' ? 'CREDIT' : 'DEBIT';
    return {
      data: _dataDeOFX(_tagValue(bloco, 'DTPOSTED')),
      descricaoBase: base,
      valorCentavos: _centavosDeTRNAMT(_tagValue(bloco, 'TRNAMT')),
      tipoMov,
      fitid: _tagValue(bloco, 'FITID'),
      parcela
    };
  }

  /**
   * Faz o parse completo do arquivo OFX.
   * @returns { tipo, periodo:{ de, ate }, linhas:[{ data, descricaoBase, valorCentavos, tipoMov, fitid, parcela }] }
   */
  function parseOFX(texto) {
    const t = texto || '';
    const tipo = detectarTipoOFX(t);
    const lista = (t.match(/<BANKTRANLIST>[\s\S]*?<\/BANKTRANLIST>/i) || [t])[0];
    const periodo = {
      de: _dataDeOFX(_tagValue(lista, 'DTSTART')),
      ate: _dataDeOFX(_tagValue(lista, 'DTEND'))
    };
    const linhas = _blocosTransacao(t)
      .map(_parseLinha)
      .filter(l => l.valorCentavos > 0);
    return { tipo, periodo, linhas };
  }

  return { decodeBuffer, detectarTipoOFX, parseOFX };
})();
