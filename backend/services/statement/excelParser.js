/* —————————————————————————————————————
 * Unified Excel Parsing Engine (.xlsx, .xlsm, .xls)
 * Supports:
 *   1. OOXML (.xlsx / .xlsm) via ExcelJS (richText, formulas, dates, multi-sheet)
 *   2. Legacy Binary OLE2 (.xls BIFF5/BIFF8) via `cfb` + BIFF record decoder
 *   3. HTML-table .xls & SpreadsheetML XML 2003 .xls (common bank exports)
 *   4. Delimited text / TSV saved with .xls extension
 * ————————————————————————————————————— */

const ExcelJS = require('exceljs');
const CFB = require('cfb');
const JSZip = require('jszip');
const { decodeBufferToText, cleanText } = require('./helpers');
const { parseCsvAsync } = require('./csvParser');
const { detectTableHeader } = require('./tabularNormalizer');
const { saveReceiptImageBuffer, MAX_SAVED_IMAGES_PER_STATEMENT } = require('./receiptStorage');

const BUILTIN_DATE_NUMFMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

const excelSerialToIsoDay = (serial) => {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  // Excel 1900 date system (adjust for Lotus 1-2-3 Feb 29 1900 bug)
  const adjusted = serial > 59 ? serial - 1 : serial;
  const epochMs = Date.UTC(1899, 11, 31) + Math.floor(adjusted) * 86400_000;
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const isDateFormatString = (fmt) => {
  if (!fmt) return false;
  const cleaned = String(fmt).replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
  return /[dmy]/i.test(cleaned) && !/[#0?]\.[#0?]/.test(cleaned);
};

/* —————————————————————————————————————
 * OOXML (.xlsx / .xlsm) Extractor
 * ————————————————————————————————————— */

const formatExcelJsCellValue = (val, numFmt = '') => {
  if (val === null || val === undefined) return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return `${val.getUTCFullYear()}-${String(val.getUTCMonth() + 1).padStart(2, '0')}-${String(val.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof val === 'number') {
    if (isDateFormatString(numFmt) && val > 20000 && val < 80000) {
      return excelSerialToIsoDay(val) || String(val);
    }
    return String(val).trim();
  }
  if (typeof val === 'object') {
    if (Array.isArray(val.richText)) {
      return val.richText.map((part) => part?.text || '').join('').trim();
    }
    if ('text' in val) return String(val.text || '').trim();
    if (val.result !== undefined) {
      return formatExcelJsCellValue(val.result, numFmt);
    }
    if ('formula' in val || 'sharedFormula' in val || 'error' in val) {
      return '';
    }
    return '';
  }
  return String(val).trim();
};

const extractWorksheetRows = (worksheet) => {
  const rows = [];
  const rowNumbers = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const rowCells = [];
    const maxCol = row.cellCount || (Array.isArray(row.values) ? row.values.length - 1 : 0);
    for (let c = 1; c <= maxCol; c += 1) {
      const cell = row.getCell(c);
      rowCells.push(formatExcelJsCellValue(cell.value, cell.numFmt));
    }
    if (rowCells.some(Boolean)) {
      rows.push(rowCells);
      rowNumbers.push(row.number);
    }
  });
  return { rows, rowNumbers };
};

const extractExcelImages = async (workbook, targetSheet = null) => {
  const images = [];
  if (!workbook || !Array.isArray(workbook.worksheets)) return images;
  const sheets = targetSheet ? [targetSheet] : workbook.worksheets;

  for (const worksheet of sheets) {
    if (typeof worksheet?.getImages !== 'function') continue;
    const wsImages = worksheet.getImages() || [];
    for (const img of wsImages) {
      if (images.length >= MAX_SAVED_IMAGES_PER_STATEMENT) return images;
      try {
        const media = workbook.getImage(Number(img.imageId));
        if (!media?.buffer) continue;
        const url = await saveReceiptImageBuffer(media.buffer);
        if (url) {
          const nativeRow = img.range?.tl?.nativeRow;
          images.push({
            url,
            cell: Number.isFinite(nativeRow) ? nativeRow + 1 : null,
            sheetName: worksheet.name || null,
          });
        }
      } catch {
        // Skip unreadable image entries
      }
    }
  }
  return images;
};

const scoreCandidateSheetRows = (rows) => {
  const header = rows.length >= 2 ? detectTableHeader(rows) : null;
  if (!header) return -1;
  const cols = header.columns;
  const explicitDescBonus =
    (cols.counterparty >= 0 || cols.narration >= 0 || cols.particulars >= 0 || cols.description >= 0) ? 1000 : 0;
  return explicitDescBonus + rows.length;
};

const extractWorkbookRows = async (workbook, { saveReceipts = true } = {}) => {
  if (!workbook.worksheets || workbook.worksheets.length === 0) {
    throw new Error('Excel workbook contains no worksheets.');
  }

  let fallback = null;
  let best = null;
  let bestScore = -1;

  for (const worksheet of workbook.worksheets) {
    const extracted = extractWorksheetRows(worksheet);
    if (!fallback && extracted.rows.length > 0) {
      fallback = { ...extracted, worksheet };
    }
    const score = scoreCandidateSheetRows(extracted.rows);
    if (score > bestScore) {
      bestScore = score;
      best = { ...extracted, worksheet };
    }
  }

  const chosen = best || fallback || { rows: [], rowNumbers: [], worksheet: null };
  const extractedImages = saveReceipts ? await extractExcelImages(workbook, chosen.worksheet) : [];
  return {
    rows: chosen.rows,
    rowNumbers: chosen.rowNumbers,
    extractedImages,
  };
};

const stripOoxmlDrawingsAndCharts = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const pathsToRemove = [];

  zip.forEach((relativePath) => {
    if (/^xl\/(drawings|charts|media|ctrlProps|activeX|diagrams|embeddings)\//i.test(relativePath)) {
      pathsToRemove.push(relativePath);
    }
  });
  for (const p of pathsToRemove) {
    zip.remove(p);
  }

  const sheetFiles = Object.keys(zip.files).filter(
    (name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name) && !zip.files[name].dir
  );
  for (const sheetPath of sheetFiles) {
    let xml = await zip.files[sheetPath].async('string');
    xml = xml
      .replace(/<(?:x:)?drawing\b[^>]*\/>/gi, '')
      .replace(/<(?:x:)?drawing\b[^>]*>[\s\S]*?<\/(?:x:)?drawing>/gi, '')
      .replace(/<(?:x:)?legacyDrawing\b[^>]*\/>/gi, '')
      .replace(/<(?:x:)?legacyDrawingHF\b[^>]*\/>/gi, '')
      .replace(/<(?:x:)?picture\b[^>]*\/>/gi, '')
      .replace(/<(?:x:)?controls\b[^>]*>[\s\S]*?<\/(?:x:)?controls>/gi, '')
      .replace(/<(?:x:)?oleObjects\b[^>]*>[\s\S]*?<\/(?:x:)?oleObjects>/gi, '');
    zip.file(sheetPath, xml);
  }

  const relFiles = Object.keys(zip.files).filter(
    (name) => /^xl\/worksheets\/_rels\/[^/]+\.rels$/i.test(name) && !zip.files[name].dir
  );
  for (const relPath of relFiles) {
    let xml = await zip.files[relPath].async('string');
    xml = xml.replace(
      /<Relationship\b[^>]*Target="[^"]*(?:drawings|charts|vmlDrawing|ctrlProps|activeX|media)[^"]*"[^>]*\/?>/gi,
      ''
    );
    zip.file(relPath, xml);
  }

  if (zip.files['[Content_Types].xml']) {
    let ctXml = await zip.files['[Content_Types].xml'].async('string');
    ctXml = ctXml.replace(
      /<Override\b[^>]*PartName="\/xl\/(?:drawings|charts|vmlDrawing|ctrlProps)[^"]*"[^>]*\/?>/gi,
      ''
    );
    zip.file('[Content_Types].xml', ctXml);
  }

  return zip.generateAsync({ type: 'nodebuffer' });
};

const colLettersToZeroIndex = (colRef) => {
  let idx = 0;
  for (let i = 0; i < colRef.length; i += 1) {
    idx = idx * 26 + (colRef.charCodeAt(i) - 64);
  }
  return idx - 1;
};

const parseXmlTextTags = (xmlFragment) => {
  const parts = [];
  const tMatches = xmlFragment.matchAll(/<(?:[a-z0-9]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[a-z0-9]+:)?t>/gi);
  for (const m of tMatches) {
    parts.push(decodeXmlHtmlEntities(m[1]));
  }
  return parts.join('');
};

const parseOoxmlViaZipXml = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Parse SharedStrings table if present
  const sharedStrings = [];
  const ssFile = zip.files['xl/sharedStrings.xml'];
  if (ssFile) {
    const ssXml = await ssFile.async('string');
    const siMatches = ssXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi);
    for (const si of siMatches) {
      sharedStrings.push(cleanText(parseXmlTextTags(si[1])));
    }
  }

  // 2. Parse Styles to detect numeric date styles
  const dateStyleIndices = new Set();
  const stylesFile = zip.files['xl/styles.xml'];
  if (stylesFile) {
    const stylesXml = await stylesFile.async('string');
    const customDateNumFmts = new Set();
    const numFmtMatches = stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/?>/gi);
    for (const m of numFmtMatches) {
      if (isDateFormatString(decodeXmlHtmlEntities(m[2]))) {
        customDateNumFmts.add(Number(m[1]));
      }
    }
    const cellXfsMatch = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/i);
    if (cellXfsMatch) {
      let xfIdx = 0;
      const xfMatches = cellXfsMatch[1].matchAll(/<xf\b([^>]*)(?:\/>|>[\s\S]*?<\/xf>)/gi);
      for (const xf of xfMatches) {
        const numFmtIdMatch = xf[1].match(/\bnumFmtId="(\d+)"/i);
        const numFmtId = numFmtIdMatch ? Number(numFmtIdMatch[1]) : 0;
        if (BUILTIN_DATE_NUMFMTS.has(numFmtId) || customDateNumFmts.has(numFmtId)) {
          dateStyleIndices.add(xfIdx);
        }
        xfIdx += 1;
      }
    }
  }

  // 3. Parse worksheet XML files in numeric sheet order
  const sheetPaths = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name) && !zip.files[name].dir)
    .sort((a, b) => {
      const na = Number((a.match(/sheet(\d+)\.xml/i) || [])[1] || 0);
      const nb = Number((b.match(/sheet(\d+)\.xml/i) || [])[1] || 0);
      return na - nb;
    });

  if (sheetPaths.length === 0) {
    throw new Error('Excel workbook contains no worksheets.');
  }

  let fallbackRows = null;
  let bestRows = null;
  let bestScore = -1;
  for (const sheetPath of sheetPaths) {
    const sheetXml = await zip.files[sheetPath].async('string');
    const rows = [];
    const rowMatches = sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi);
    for (const rMatch of rowMatches) {
      const row = [];
      let nextCol = 0;
      const cellMatches = rMatch[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/gi);
      for (const cMatch of cellMatches) {
        const attrs = cMatch[1] || '';
        const body = cMatch[2] || '';
        const refMatch = attrs.match(/\br="([A-Z]+)\d+"/i);
        if (refMatch) {
          nextCol = colLettersToZeroIndex(refMatch[1].toUpperCase());
        }
        while (row.length < nextCol) row.push('');

        const typeMatch = attrs.match(/\bt="([^"]+)"/i);
        const cellType = typeMatch ? typeMatch[1] : '';
        const styleMatch = attrs.match(/\bs="(\d+)"/i);
        const styleIdx = styleMatch ? Number(styleMatch[1]) : -1;

        let value = '';
        if (cellType === 'inlineStr') {
          const isMatch = body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/i);
          value = isMatch ? cleanText(parseXmlTextTags(isMatch[1])) : '';
        } else {
          const vMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i);
          const rawV = vMatch ? decodeXmlHtmlEntities(vMatch[1]).trim() : '';
          if (rawV !== '') {
            if (cellType === 's') {
              const sIdx = Number(rawV);
              value = Number.isInteger(sIdx) && sIdx >= 0 && sIdx < sharedStrings.length ? sharedStrings[sIdx] : '';
            } else if (cellType === 'str' || cellType === 'b' || cellType === 'e') {
              value = cellType === 'e' ? '' : rawV;
            } else {
              const numVal = Number(rawV);
              if (Number.isFinite(numVal) && dateStyleIndices.has(styleIdx) && numVal > 20000 && numVal < 80000) {
                value = excelSerialToIsoDay(numVal) || rawV;
              } else {
                value = rawV;
              }
            }
          }
        }
        row[nextCol] = value;
        nextCol += 1;
      }
      if (row.some(Boolean)) {
        rows.push(row);
      }
    }

    if (!fallbackRows && rows.length > 0) {
      fallbackRows = rows;
    }
    const score = scoreCandidateSheetRows(rows);
    if (score > bestScore) {
      bestScore = score;
      bestRows = rows;
    }
  }

  return bestRows || fallbackRows || [];
};

const parseXlsxWithMeta = async (buffer, { saveReceipts = true } = {}) => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return await extractWorkbookRows(workbook, { saveReceipts });
  } catch (primaryErr) {
    // Tier 1b: Retry with ExcelJS ignoreNodes for drawings/charts/images
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer, { ignoreNodes: ['drawings', 'charts', 'images'] });
      return await extractWorkbookRows(workbook, { saveReceipts: false });
    } catch {
      // Fall through to ZIP stripping
    }

    // Tier 2: Strip drawings/charts/media/VML (fixes ExcelJS crashes like `reading 'anchors'`) and reload
    try {
      const sanitizedBuffer = await stripOoxmlDrawingsAndCharts(buffer);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(sanitizedBuffer);
      return await extractWorkbookRows(workbook, { saveReceipts: false });
    } catch (secondaryErr) {
      // Tier 3: Direct OOXML ZIP XML sheet parser (resilient to unsupported styles/pivots/anchors)
      try {
        const rows = await parseOoxmlViaZipXml(buffer);
        return { rows, rowNumbers: [], extractedImages: [] };
      } catch {
        throw primaryErr || secondaryErr;
      }
    }
  }
};

const parseXlsxBuffer = async (buffer) => {
  const { rows } = await parseXlsxWithMeta(buffer, { saveReceipts: false });
  return rows;
};

/* —————————————————————————————————————
 * HTML-Table & SpreadsheetML XML .xls Decoders
 * ————————————————————————————————————— */

const decodeXmlHtmlEntities = (str) =>
  String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = Number.parseInt(hex, 16);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    });

const parseHtmlTableXls = (text) => {
  const rows = [];
  const trMatches = text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const tr of trMatches) {
    const row = [];
    const cellMatches = tr[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi);
    for (const cell of cellMatches) {
      const cleaned = cleanText(decodeXmlHtmlEntities(cell[1].replace(/<[^>]+>/g, ' ')));
      row.push(cleaned);
    }
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
};

const parseSpreadsheetMlXls = (text) => {
  const sheets = [];
  const wsMatches = text.matchAll(/<(?:ss:)?Worksheet\b[^>]*>([\s\S]*?)<\/(?:ss:)?Worksheet>/gi);
  for (const ws of wsMatches) {
    const rows = [];
    const rowMatches = ws[1].matchAll(/<(?:ss:)?Row\b[^>]*>([\s\S]*?)<\/(?:ss:)?Row>/gi);
    for (const rMatch of rowMatches) {
      const row = [];
      let colCursor = 0;
      const cellMatches = rMatch[1].matchAll(/<(?:ss:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:ss:)?Cell>/gi);
      for (const cMatch of cellMatches) {
        const idxAttr = cMatch[1].match(/(?:ss:)?Index="(\d+)"/i);
        if (idxAttr) {
          const targetIdx = Math.max(0, Number(idxAttr[1]) - 1);
          while (colCursor < targetIdx) {
            row.push('');
            colCursor += 1;
          }
        }
        const dataMatch = cMatch[2].match(/<(?:ss:)?Data\b[^>]*>([\s\S]*?)<\/(?:ss:)?Data>/i);
        const rawText = dataMatch ? dataMatch[1] : cMatch[2].replace(/<[^>]+>/g, ' ');
        row.push(cleanText(decodeXmlHtmlEntities(rawText)));
        colCursor += 1;
      }
      if (row.some(Boolean)) rows.push(row);
    }
    if (rows.length > 0) sheets.push(rows);
  }

  for (const rows of sheets) {
    if (rows.length >= 2 && detectTableHeader(rows)) return rows;
  }
  return sheets[0] || [];
};

/* —————————————————————————————————————
 * Binary OLE2 BIFF5/BIFF8 (.xls) Decoder
 * ————————————————————————————————————— */

const decodeRkNumber = (rkVal) => {
  const isFloat = (rkVal & 0x02) === 0;
  const div100 = (rkVal & 0x01) !== 0;
  let num;
  if (isFloat) {
    const buf = Buffer.allocUnsafe(8);
    buf.writeUInt32LE(0, 0);
    buf.writeUInt32LE(rkVal & 0xfffffffc, 4);
    num = buf.readDoubleLE(0);
  } else {
    num = rkVal >> 2;
  }
  return div100 ? num / 100 : num;
};

const readBiffRecords = (streamBuf) => {
  const records = [];
  let offset = 0;
  while (offset + 4 <= streamBuf.length) {
    const type = streamBuf.readUInt16LE(offset);
    const len = streamBuf.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + len > streamBuf.length) break;
    records.push({ type, data: streamBuf.subarray(offset, offset + len) });
    offset += len;
  }
  return records;
};

const parseSstRecords = (records, startIndex) => {
  const sstRec = records[startIndex];
  if (!sstRec || sstRec.data.length < 8) return [];
  const totalUnique = sstRec.data.readUInt32LE(4);

  const chunks = [sstRec.data];
  let idx = startIndex + 1;
  while (idx < records.length && records[idx].type === 0x003c) {
    chunks.push(records[idx].data);
    idx += 1;
  }

  let chunkIdx = 0;
  let pos = 8;

  const ensureBytes = (n) => {
    while (chunkIdx < chunks.length && pos >= chunks[chunkIdx].length) {
      chunkIdx += 1;
      pos = 0;
    }
    return chunkIdx < chunks.length && pos + n <= chunks[chunkIdx].length;
  };

  const readU8 = () => {
    if (!ensureBytes(1)) throw new Error('SST truncated');
    const v = chunks[chunkIdx].readUInt8(pos);
    pos += 1;
    return v;
  };

  const readU16 = () => {
    if (ensureBytes(2)) {
      const v = chunks[chunkIdx].readUInt16LE(pos);
      pos += 2;
      return v;
    }
    const b0 = readU8();
    const b1 = readU8();
    return b0 | (b1 << 8);
  };

  const readU32 = () => {
    const lo = readU16();
    const hi = readU16();
    return (lo | (hi << 16)) >>> 0;
  };

  const strings = [];
  for (let s = 0; s < totalUnique && chunkIdx < chunks.length; s += 1) {
    try {
      const charCount = readU16();
      let flags = readU8();
      let isUnicode = (flags & 0x01) !== 0;
      const hasExt = (flags & 0x04) !== 0;
      const hasRich = (flags & 0x08) !== 0;
      const richRuns = hasRich ? readU16() : 0;
      const extBytes = hasExt ? readU32() : 0;

      let out = '';
      let remaining = charCount;
      while (remaining > 0 && chunkIdx < chunks.length) {
        if (pos >= chunks[chunkIdx].length) {
          chunkIdx += 1;
          pos = 0;
          if (chunkIdx >= chunks.length) break;
          // CONTINUE record starts with a 1-byte compression flag for split strings
          const contFlags = chunks[chunkIdx].readUInt8(pos);
          pos += 1;
          isUnicode = (contFlags & 0x01) !== 0;
        }
        const availBytes = chunks[chunkIdx].length - pos;
        const bytesPerChar = isUnicode ? 2 : 1;
        const charsHere = Math.min(remaining, Math.floor(availBytes / bytesPerChar));
        if (charsHere <= 0) break;
        const slice = chunks[chunkIdx].subarray(pos, pos + charsHere * bytesPerChar);
        out += isUnicode ? slice.toString('utf16le') : slice.toString('latin1');
        pos += charsHere * bytesPerChar;
        remaining -= charsHere;
      }

      let skip = richRuns * 4 + extBytes;
      while (skip > 0 && chunkIdx < chunks.length) {
        if (pos >= chunks[chunkIdx].length) {
          chunkIdx += 1;
          pos = 0;
          if (chunkIdx >= chunks.length) break;
        }
        const take = Math.min(skip, chunks[chunkIdx].length - pos);
        pos += take;
        skip -= take;
      }

      strings.push(out.trim());
    } catch {
      break;
    }
  }
  return strings;
};

const parseBinaryBiffXls = (buffer) => {
  let cfbContainer;
  try {
    cfbContainer = CFB.read(buffer, { type: 'buffer' });
  } catch (err) {
    const invalidErr = new Error(`Could not read legacy .xls file (${err.message}). Please re-export as .xlsx or .csv.`);
    invalidErr.code = 'XLS_INVALID';
    throw invalidErr;
  }

  const wbEntry = CFB.find(cfbContainer, 'Workbook') || CFB.find(cfbContainer, 'Book');
  if (!wbEntry || !wbEntry.content || wbEntry.content.length < 8) {
    const invalidErr = new Error('Legacy .xls workbook stream is missing or corrupted. Please save as .xlsx or .csv.');
    invalidErr.code = 'XLS_NOT_SUPPORTED';
    throw invalidErr;
  }

  const streamBuf = Buffer.from(wbEntry.content);
  const records = readBiffRecords(streamBuf);

  let sst = [];
  const customFormats = new Map();
  const xfNumFmts = [];
  const sheets = [];
  let activeGrid = null;
  let lastFormulaPos = null;
  let inSheet = false;

  const setCell = (r, c, val) => {
    if (!activeGrid || r < 0 || r > 100000 || c < 0 || c > 256) return;
    if (!activeGrid.has(r)) activeGrid.set(r, []);
    const row = activeGrid.get(r);
    row[c] = val === null || val === undefined ? '' : String(val).trim();
  };

  const formatNumericCell = (num, xfIdx) => {
    if (!Number.isFinite(num)) return '';
    const numFmtId = xfNumFmts[xfIdx] ?? 0;
    const isDate =
      BUILTIN_DATE_NUMFMTS.has(numFmtId) ||
      isDateFormatString(customFormats.get(numFmtId));
    if (isDate && num > 20000 && num < 80000) {
      return excelSerialToIsoDay(num) || String(num);
    }
    return String(num);
  };

  for (let i = 0; i < records.length; i += 1) {
    const { type, data } = records[i];

    // BOF
    if (type === 0x0809 && data.length >= 4) {
      const substreamType = data.readUInt16LE(2);
      if (substreamType === 0x0010) {
        inSheet = true;
        activeGrid = new Map();
      } else {
        inSheet = false;
      }
      continue;
    }

    // EOF
    if (type === 0x000a) {
      if (inSheet && activeGrid) {
        const orderedRows = Array.from(activeGrid.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, row]) => {
            const normalized = [];
            for (let c = 0; c < row.length; c += 1) normalized.push(row[c] ?? '');
            return normalized;
          })
          .filter((r) => r.some(Boolean));
        if (orderedRows.length > 0) sheets.push(orderedRows);
      }
      inSheet = false;
      activeGrid = null;
      lastFormulaPos = null;
      continue;
    }

    // Workbook Globals
    if (!inSheet) {
      if (type === 0x002f) {
        const encErr = new Error('Password-protected .xls files cannot be parsed directly. Please unlock and save as .xlsx or .csv.');
        encErr.code = 'XLS_PASSWORD_PROTECTED';
        throw encErr;
      }
      if (type === 0x00fc) {
        sst = parseSstRecords(records, i);
      } else if (type === 0x041e && data.length >= 5) {
        const fmtIdx = data.readUInt16LE(0);
        const cch = data.readUInt16LE(2);
        const grbit = data.readUInt8(4);
        const isUnicode = (grbit & 0x01) !== 0;
        const fmtStr = isUnicode
          ? data.subarray(5, 5 + cch * 2).toString('utf16le')
          : data.subarray(5, 5 + cch).toString('latin1');
        customFormats.set(fmtIdx, fmtStr);
      } else if (type === 0x00e0 && data.length >= 4) {
        xfNumFmts.push(data.readUInt16LE(2));
      }
      continue;
    }

    // Worksheet Cell Records
    if (type === 0x00fd && data.length >= 10) {
      // LABELSST
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const sstIdx = data.readUInt32LE(6);
      setCell(r, c, sst[sstIdx] ?? '');
    } else if (type === 0x0204 && data.length >= 8) {
      // LABEL
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const cch = data.readUInt16LE(6);
      const hasFlag = data.length >= 9 + cch;
      let str = '';
      if (hasFlag) {
        const isUnicode = (data.readUInt8(8) & 0x01) !== 0;
        str = isUnicode
          ? data.subarray(9, 9 + cch * 2).toString('utf16le')
          : data.subarray(9, 9 + cch).toString('latin1');
      } else {
        str = data.subarray(8, 8 + cch).toString('latin1');
      }
      setCell(r, c, str);
    } else if (type === 0x0203 && data.length >= 14) {
      // NUMBER
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const xf = data.readUInt16LE(4);
      const val = data.readDoubleLE(6);
      setCell(r, c, formatNumericCell(val, xf));
    } else if (type === 0x027e && data.length >= 10) {
      // RK
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const xf = data.readUInt16LE(4);
      const rk = data.readInt32LE(6);
      setCell(r, c, formatNumericCell(decodeRkNumber(rk), xf));
    } else if (type === 0x00bd && data.length >= 6) {
      // MULRK
      const r = data.readUInt16LE(0);
      const colFirst = data.readUInt16LE(2);
      const colLast = data.readUInt16LE(data.length - 2);
      for (let col = colFirst, p = 4; col <= colLast && p + 6 <= data.length - 2; col += 1, p += 6) {
        const xf = data.readUInt16LE(p);
        const rk = data.readInt32LE(p + 2);
        setCell(r, col, formatNumericCell(decodeRkNumber(rk), xf));
      }
    } else if (type === 0x0006 && data.length >= 14) {
      // FORMULA cached value
      const r = data.readUInt16LE(0);
      const c = data.readUInt16LE(2);
      const xf = data.readUInt16LE(4);
      const marker = data.readUInt16LE(12);
      if (marker === 0xffff) {
        const kind = data.readUInt8(6);
        if (kind === 0) {
          lastFormulaPos = { r, c };
        } else if (kind === 1) {
          setCell(r, c, data.readUInt8(8) ? 'TRUE' : 'FALSE');
        }
      } else {
        setCell(r, c, formatNumericCell(data.readDoubleLE(6), xf));
      }
    } else if (type === 0x0207 && lastFormulaPos && data.length >= 3) {
      // STRING following FORMULA
      const cch = data.readUInt16LE(0);
      const isUnicode = (data.readUInt8(2) & 0x01) !== 0;
      const str = isUnicode
        ? data.subarray(3, 3 + cch * 2).toString('utf16le')
        : data.subarray(3, 3 + cch).toString('latin1');
      setCell(lastFormulaPos.r, lastFormulaPos.c, str);
      lastFormulaPos = null;
    }
  }

  for (const rows of sheets) {
    if (rows.length >= 2 && detectTableHeader(rows)) {
      return rows;
    }
  }
  return sheets[0] || [];
};

/* —————————————————————————————————————
 * Unified Excel Entry Point
 * ————————————————————————————————————— */

/**
 * Parses `.xlsx`, `.xlsm`, or `.xls` (binary OLE2 BIFF, HTML-table, XML 2003, or delimited text).
 *
 * @param {Buffer} buffer
 * @param {string} [filename='']
 * @returns {Promise<{ rows: string[][], engine: string }>}
 */
const parseExcelBuffer = async (buffer, filename = '', { saveReceipts = true } = {}) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Excel file is empty.');
  }

  const magic4 = buffer.subarray(0, 4).toString('ascii');
  const isZipOoxml = magic4 === 'PK\x03\x04';
  const isOle2 = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('D0CF11E0A1B11AE1', 'hex'));

  if (isZipOoxml) {
    const { rows, rowNumbers, extractedImages } = await parseXlsxWithMeta(buffer, { saveReceipts });
    return { rows, rowNumbers, extractedImages, engine: 'xlsx_exceljs' };
  }

  if (isOle2) {
    const rows = parseBinaryBiffXls(buffer);
    return { rows, rowNumbers: [], extractedImages: [], engine: 'xls_biff_cfb' };
  }

  // Many Indian banks export HTML tables, XML Spreadsheet 2003, or TSV/CSV with `.xls` extension
  const text = decodeBufferToText(buffer);
  const sample = text.slice(0, 2000).toLowerCase();

  if (sample.includes('<table') || sample.includes('<tr')) {
    const rows = parseHtmlTableXls(text);
    if (rows.length > 0) return { rows, rowNumbers: [], extractedImages: [], engine: 'xls_html' };
  }

  if (sample.includes('<workbook') || sample.includes('<ss:workbook') || sample.includes('schemas-microsoft-com:office:spreadsheet')) {
    const rows = parseSpreadsheetMlXls(text);
    if (rows.length > 0) return { rows, rowNumbers: [], extractedImages: [], engine: 'xls_xml2003' };
  }

  if (/\.xls[xm]?$/i.test(filename) && text.trim()) {
    const csvRes = await parseCsvAsync(buffer);
    if (csvRes.rows.length > 0) {
      return { rows: csvRes.rows, rowNumbers: [], extractedImages: [], engine: `xls_${csvRes.engine}` };
    }
  }

  const err = new Error('Could not read this Excel file. Ensure it is a valid .xlsx or .xls workbook.');
  err.code = 'XLS_NOT_SUPPORTED';
  throw err;
};

module.exports = {
  parseExcelBuffer,
  parseXlsxBuffer,
  parseOoxmlViaZipXml,
  stripOoxmlDrawingsAndCharts,
  parseBinaryBiffXls,
  parseHtmlTableXls,
  parseSpreadsheetMlXls,
  excelSerialToIsoDay,
};

