export const PROJECT_FORMAT = 'kcad';
export const PROJECT_VERSION = 1;

const point = (x, y) => ({ x: Number(x) || 0, y: Number(y) || 0 });
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Convert a Kompas Online v14 drawing entity into the editable geometry model. */
export function convertKompasObject(source, index = 0) {
  if (!source || typeof source !== 'object' || typeof source.type !== 'string') return null;
  const base = {
    id: source.id || `kompas-import-${index + 1}`,
    name: source.name || '',
    color: source.color || '#111111',
    width: finite(source.width, 0.35),
    layer: source.layer || 'geometry',
    locked: !!source.locked,
    groupId: source.groupId || undefined,
    sourceApp: 'Kompas Online',
  };

  switch (source.type) {
    case 'line':
    case 'construction':
      return { ...source, ...base, type: source.type, a: point(source.x, source.y), b: point(source.x2, source.y2), dash: source.dash || null };

    case 'polyline': {
      const points = Array.isArray(source.points) ? source.points.map(p => point(p?.x, p?.y)) : [];
      if (points.length < 2) return null;
      return { ...source, ...base, type: source.closed ? 'polygon' : 'polyline', points, closed: !!source.closed };
    }

    case 'ellipse': {
      const x1 = finite(source.x), y1 = finite(source.y), x2 = finite(source.x2), y2 = finite(source.y2);
      return {
        ...source, ...base, type: 'ellipse',
        center: point((x1 + x2) / 2, (y1 + y2) / 2),
        rx: Math.abs(x2 - x1) / 2, ry: Math.abs(y2 - y1) / 2,
        rotation: finite(source.rotationTotal, 0),
      };
    }

    case 'dimension': {
      const kindMap = { vertical: 'dimV', horizontal: 'dimH', diameter: 'dimDia', radius: 'dimRad', linear: 'linear', angular: 'dimAngle' };
      return {
        ...source, ...base, type: 'dimension', kind: kindMap[source.kind] || source.kind || 'linear',
        a: point(source.x, source.y), b: point(source.x2, source.y2),
        offset: finite(source.offset, 0), textSize: finite(source.textSize, 3.5),
        labelDx: finite(source.labelDx, 0), labelDy: finite(source.labelDy, 0),
        arrowSize: finite(source.arrowSize, 2.5),
        label: source.label || '',
      };
    }

    case 'text':
      return {
        ...source, ...base, type: 'text',
        x: finite(source.x), y: finite(source.y), text: String(source.text ?? ''),
        size: finite(source.size, 3.5), rotation: finite(source.rotation, 0),
        align: source.align || 'start', font: source.font || 'Arial, sans-serif',
        italic: !!source.italic, bold: !!source.bold,
      };

    default:
      return null;
  }
}

function parseKompasOnlineProject(data) {
  const doc = data.document;
  if (!doc || typeof doc !== 'object') throw new Error('Файл Kompas Online не содержит раздел document');
  const format = typeof doc.format === 'string' ? doc.format : 'A4P';
  const sizes = {
    A4P: [210, 297], A4L: [297, 210], A3P: [297, 420], A3L: [420, 297],
    A2P: [420, 594], A2L: [594, 420], A1P: [594, 841], A1L: [841, 594],
  };
  const [width, height] = sizes[format] || sizes.A4P;
  const sourceTitle = doc.title && typeof doc.title === 'object' ? doc.title : {};
  const overrides = doc.templateTextOverrides && typeof doc.templateTextOverrides === 'object'
    ? doc.templateTextOverrides[doc.titleForm] || {}
    : {};
  const title = {
    title: sourceTitle.title || '',
    code: sourceTitle.code || '',
    material: sourceTitle.material || '',
    liter: sourceTitle.liter || '',
    mass: sourceTitle.mass || '',
    scale: sourceTitle.scale || '',
    sheet: sourceTitle.sheet || '',
    sheets: sourceTitle.sheets || '1',
    company: sourceTitle.company || '',
    developer: sourceTitle.developer || '',
    checker: sourceTitle.checker || '',
    technical: sourceTitle.technical || '',
    normative: sourceTitle.normative || '',
    approved: sourceTitle.approved || '',
    // Preserve the source application's editable template labels for faithful import.
    kompasTemplateTextOverrides: overrides,
    kompasTitleForm: doc.titleForm || '',
    kompasGost: doc.gost || {},
  };
  const objects = (Array.isArray(doc.objects) ? doc.objects : [])
    .map((object, index) => convertKompasObject(object, index))
    .filter(Boolean);
  const templateId = doc.titleForm === 'lab5-template' ? 'kompas-lab5-a4-template' : 'kompas-import-a4-template';
  return {
    format: PROJECT_FORMAT,
    version: 0,
    name: doc.fileName || 'Импортированный чертёж Kompas Online',
    sheet: { width, height, format },
    templateId,
    title,
    objects,
    settings: {
      grid: !!doc.grid,
      snapGrid: !!doc.snap,
      ortho: !!doc.ortho,
      sourceApp: 'Kompas Online',
      sourceVersion: finite(doc.version, 0),
    },
  };
}

export function createProject(state) {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    app: 'CAD Geometry Core restored',
    savedAt: new Date().toISOString(),
    name: state.name || 'Чертёж',
    sheet: structuredClone(state.sheet),
    templateId: state.templateId || 'lab4-reference-template',
    title: structuredClone(state.title || {}),
    objects: structuredClone(state.objects || []),
    settings: structuredClone(state.settings || {}),
  };
}

export function parseProject(input) {
  let data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!data || typeof data !== 'object') throw new Error('Файл проекта пуст или повреждён');
  if (data.kind === 'kompas-online-project' && data.document) return parseKompasOnlineProject(data);
  if (Array.isArray(data)) return { format: 'kcad', version: 0, name: 'Импортированный чертёж', sheet: { width: 297, height: 420, format: 'A3P' }, templateId: 'lab4-reference-template', title: {}, objects: data, settings: {} };
  if (data.format && data.format !== 'kcad' && data.format !== 'cad-geometry-core') throw new Error('Неподдерживаемый формат проекта');
  const objects = Array.isArray(data.objects) ? data.objects : (Array.isArray(data.geometry) ? data.geometry : []);
  return {
    format: 'kcad', version: data.version || 0, name: data.name || 'Импортированный чертёж',
    sheet: { width: Number(data.sheet?.width) || 297, height: Number(data.sheet?.height) || 420, format: data.sheet?.format || 'A3P' },
    templateId: data.templateId || data.template || 'lab4-reference-template',
    title: data.title || data.titleFields || {}, objects, settings: data.settings || {},
  };
}
