/* Vector A4 drawing-sheet template reconstructed from the user's reference.
   The layout follows the visible geometry of the supplied sheet and includes
   the standard title-block labels commonly used with GOST 2.104 Form 1.
   All dimensions are expressed in millimetres. */
(function () {
  const BLUE = '#12b9df';
  const TEXT = '#075d76';

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    }[c]));
  }
  function line(x1, y1, x2, y2, width = 0.22, color = BLUE) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" fill="none" vector-effect="non-scaling-stroke"/>`;
  }
  function rect(x, y, w, h, width = 0.25, color = BLUE) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${width}" vector-effect="non-scaling-stroke"/>`;
  }
  function text(x, y, value, size = 2.25, anchor = 'start', rotate = 0, opts = {}) {
    const transform = rotate ? ` transform="rotate(${rotate} ${x} ${y})"` : '';
    const weight = opts.weight ? ` font-weight="${opts.weight}"` : '';
    const style = opts.italic ? ' font-style="italic"' : '';
    const color = opts.color || TEXT;
    return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="${color}" text-anchor="${anchor}"${transform}${weight}${style}>${esc(value)}</text>`;
  }
  function centeredCell(x1, x2, y, value, size = 1.65) {
    return text((x1 + x2) / 2, y, value, size, 'middle');
  }
  function verticalLabel(x, y1, y2, value, size = 1.75) {
    return text(x, (y1 + y2) / 2, value, size, 'middle', -90);
  }

  function portrait(w, h, d) {
    let s = '';
    // Sheet edge is a faint screen boundary; the cyan lines are the actual template.
    s += rect(0, 0, w, h, 0.12, '#9aa5ad');

    // Main frame and full-height left service strip (A4 portrait).
    s += rect(8, 5, 197, 287, 0.32);
    s += rect(20, 5, 185, 287, 0.32);

    // Upper service fields on the left margin.
    s += rect(8, 5, 12, 60, 0.24);
    s += line(14, 5, 14, 65, 0.2);
    s += line(8, 65, 20, 65, 0.2);
    s += rect(8, 65, 12, 60, 0.24);
    s += line(14, 65, 14, 125, 0.2);

    // Blank gap between upper and lower inventory/reference fields is intentional
    // and matches the supplied drawing sheet.
    s += rect(8, 147, 12, 35, 0.24);
    s += line(14, 147, 14, 182, 0.2);
    s += line(8, 182, 20, 182, 0.2);
    s += rect(8, 182, 12, 25, 0.24);
    s += line(14, 182, 14, 207, 0.2);
    s += line(8, 207, 20, 207, 0.2);
    s += rect(8, 207, 12, 30, 0.24);
    s += line(14, 207, 14, 237, 0.2);
    s += rect(8, 237, 12, 55, 0.24);
    s += line(14, 237, 14, 292, 0.2);

    // Upper designation tab visible in the reference.
    s += rect(20, 5, 70, 14, 0.24);
    s += line(20, 19, 90, 19, 0.18);

    // Bottom title block: 185 x 55 mm, with the original major divisions.
    const x0 = 20, x1 = 85, x2 = 155, x3 = 205, y0 = 237, y1 = 292;
    s += rect(x0, y0, x3 - x0, y1 - y0, 0.32);
    s += line(x1, y0, x1, y1, 0.24);
    s += line(x2, y0, x2, y1, 0.24);

    // Change/revision table: five columns (7, 10, 23, 15, 10 mm), five rows.
    const changeCols = [20, 27, 37, 60, 75, 85];
    changeCols.slice(1, -1).forEach(x => { s += line(x, 237, x, 262, 0.18); });
    [242, 247, 252, 257, 262].forEach(y => { s += line(20, y, 85, y, 0.18); });
    s += centeredCell(20, 27, 241.1, 'Изм.', 1.45);
    s += centeredCell(27, 37, 241.1, 'Лист', 1.5);
    s += centeredCell(37, 60, 241.1, '№ докум.', 1.55);
    s += centeredCell(60, 75, 241.1, 'Подп.', 1.5);
    s += centeredCell(75, 85, 241.1, 'Дата', 1.5);

    // Approval / signature rows below the revision table.
    const roleSplit = 36.5;
    s += line(roleSplit, 262, roleSplit, 292, 0.2);
    s += line(60, 262, 60, 292, 0.2);
    s += line(75, 262, 75, 292, 0.2);
    [267, 272, 277, 282, 287, 292].forEach(y => { s += line(20, y, 85, y, 0.18); });
    const roles = [
      ['Разраб.', d.developer], ['Пров.', d.checker], ['Т. контр.', d.technical],
      ['Н. контр.', d.normative], ['Утв.', d.approved], ['','']
    ];
    roles.forEach((r, i) => {
      const baseline = 265.2 + i * 5;
      if (r[0]) s += text(21.1, baseline, r[0], 1.65);
      if (r[1]) s += text(37.2, baseline, r[1], 1.55);
    });

    // Main product/document name cell and lower designation/material cell.
    s += line(85, 250.5, 205, 250.5, 0.22);
    s += line(85, 275, 155, 275, 0.2);
    s += text(87, 255, 'Наименование изделия / документа', 1.7);
    s += text(87, 264, d.title || 'Наименование детали', 2.6);
    s += text(87, 269, `Обозначение: ${d.code || 'ЧЕРТЁЖ.001'}`, 1.8);
    s += text(87, 280, `Материал: ${d.material || 'не указан'}`, 1.75);

    // Right-side metadata columns: literature, mass, scale, sheet count and organisation.
    s += line(170, 250.5, 170, 275, 0.2);
    s += line(187, 250.5, 187, 275, 0.2);
    s += line(155, 255.5, 205, 255.5, 0.16);
    s += line(155, 270, 205, 270, 0.16);
    s += line(180, 270, 180, 280, 0.18);
    s += line(155, 275, 205, 275, 0.2);
    s += line(155, 280, 205, 280, 0.18);
    s += text(157, 254.1, 'Лит.', 1.55);
    s += text(171.5, 254.1, 'Масса', 1.5);
    s += text(188.5, 254.1, 'Масштаб', 1.5);
    s += centeredCell(155, 170, 264, d.liter || 'У', 2.1);
    s += centeredCell(170, 187, 264, d.mass || '—', 2.0);
    s += centeredCell(187, 205, 264, d.scale || '1:1', 2.5);
    s += text(157, 274.1, 'Лист', 1.55);
    s += text(181.5, 274.1, 'Листов', 1.55);
    s += centeredCell(155, 180, 279.3, d.sheet || '1', 2.0);
    s += centeredCell(180, 205, 279.3, d.sheets || '1', 2.0);
    s += text(157, 287.5, d.company || 'Организация', 1.65);

    // Vertical service-field labels from the reference / ESKD title-sheet conventions.
    s += verticalLabel(11, 5, 65, 'Перв. примен.', 1.75);
    s += verticalLabel(11, 65, 125, 'Справ. №', 1.75);
    s += verticalLabel(11, 147, 182, 'Взам. инв. №', 1.7);
    s += verticalLabel(11, 182, 207, 'Инв. № дубл.', 1.65);
    s += verticalLabel(11, 207, 237, 'Подп. и дата', 1.65);
    s += verticalLabel(11, 237, 292, 'Инв. № подл.', 1.7);

    // Bottom captions sit in the 5 mm print margin, as in the screenshot.
    s += text(105, 296, 'Копировал', 1.7, 'middle', 0, { italic: true });
    s += text(200, 296, 'Формат  A4', 1.7, 'end', 0, { italic: true });
    return s;
  }

  function landscape(w, h, d, format) {
    // A simple matching landscape variant with the same editable title-block labels.
    let s = '';
    s += rect(0, 0, w, h, 0.12, '#9aa5ad');
    s += rect(5, 5, w - 10, h - 10, 0.32);
    const bx = w - 190, by = h - 60;
    s += rect(bx, by, 185, 55, 0.32);
    [bx + 7, bx + 17, bx + 40, bx + 55, bx + 65, bx + 135].forEach(x => s += line(x, by, x, by + 55, 0.2));
    [by + 5, by + 10, by + 15, by + 20, by + 25, by + 30, by + 35, by + 40, by + 45, by + 50].forEach(y => s += line(bx, y, bx + 65, y, 0.18));
    s += line(bx + 65, by + 14, bx + 185, by + 14, 0.2);
    s += line(bx + 65, by + 38, bx + 135, by + 38, 0.2);
    s += line(bx + 135, by + 14, bx + 135, by + 55, 0.2);
    s += line(bx + 150, by + 14, bx + 150, by + 38, 0.18);
    s += line(bx + 167, by + 14, bx + 167, by + 38, 0.18);
    ['Изм.','Лист','№ докум.','Подп.','Дата'].forEach((v,i)=>s+=centeredCell([bx,bx+7,bx+17,bx+40,bx+55][i],[bx+7,bx+17,bx+40,bx+55,bx+65][i],by+4,v,1.45));
    ['Разраб.','Пров.','Т. контр.','Н. контр.','Утв.'].forEach((v,i)=>s+=text(bx+1,by+28+i*5,v,1.6));
    s += text(bx + 67, by + 19, d.title || 'Наименование детали', 2.6);
    s += text(bx + 67, by + 27, `Обозначение: ${d.code || 'ЧЕРТЁЖ.001'}`, 1.8);
    s += text(bx + 67, by + 34, `Материал: ${d.material || 'не указан'}`, 1.7);
    s += text(bx + 67, by + 44, d.company || 'Учебный чертёж', 1.7);
    s += text(bx + 137, by + 18, 'Лит.', 1.5);
    s += text(bx + 152, by + 18, 'Масса', 1.5);
    s += text(bx + 169, by + 18, 'Масштаб', 1.5);
    s += centeredCell(bx+135,bx+150,by+31,d.liter||'У',2);
    s += centeredCell(bx+150,bx+167,by+31,d.mass||'—',2);
    s += centeredCell(bx+167,bx+185,by+31,d.scale||'1:1',2.2);
    s += text(bx + 137, by + 43, `Лист ${d.sheet || '1'}`, 1.55);
    s += text(bx + 157, by + 43, `Листов ${d.sheets || '1'}`, 1.55);
    s += text(bx + 92, by + 53, 'Копировал', 1.6, 'middle');
    s += text(bx + 183, by + 53, `Формат ${format ? format.slice(0,2) : (w===297?'A4':'A3')}`, 1.6, 'end');
    return s;
  }

  window.KompasTemplate = {
    dimensions(format) {
      const sizes = {A4:[210,297],A3:[297,420],A2:[420,594],A1:[594,841],A0:[841,1189]};
      const key = String(format || 'A4P');
      const match = key.match(/^(A[0-4])([PL])$/);
      if (!match) return {w:210,h:297};
      const size = sizes[match[1]] || sizes.A4;
      return match[2] === 'L' ? {w:size[1],h:size[0]} : {w:size[0],h:size[1]};
    },
    markup(format, data) {
      const { w, h } = this.dimensions(format);
      return format === 'A4P' ? portrait(w, h, data || {}) : landscape(w, h, data || {}, format);
    },
    render(layer, format, data) {
      layer.innerHTML = this.markup(format, data);
    }
  };
})();
