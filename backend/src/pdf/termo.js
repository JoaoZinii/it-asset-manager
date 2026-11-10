import PDFDocument from 'pdfkit';

const NAVY = '#0e2038';
const GRAY = '#5b6b80';
const LINE = '#c9d2de';
const BLANK = '______________________';
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '');

const CLAUSES_ENTREGA = [
  'O equipamento acima descrito é de propriedade da empresa e é entregue ao colaborador exclusivamente para uso profissional.',
  'O colaborador é responsável pela guarda e conservação do equipamento e deve comunicar imediatamente à área de TI qualquer defeito, perda, furto ou roubo.',
  'É vedada a instalação de programas não autorizados, a alteração de configurações de segurança e a cessão do equipamento a terceiros.',
  'As informações da empresa armazenadas no equipamento são confidenciais e seu uso deve seguir a política de segurança da informação vigente.',
  'O equipamento deve ser devolvido à área de TI quando solicitado, em caso de substituição ou no desligamento do colaborador.',
];

/**
 * Gera o termo em PDF. `t` = dados do vínculo (ver service.getTermData); `tipo` = 'entrega' | 'devolucao'.
 * Modelo genérico: recomenda-se revisão do texto pelo Jurídico/RH da empresa.
 */
export function buildTermPdf(t, tipo, company) {
  const isReturn = tipo === 'devolucao';
  const doc = new PDFDocument({
    size: 'A4', margins: { top: 50, bottom: 50, left: 56, right: 56 },
    info: { Title: `Termo de ${isReturn ? 'devolução' : 'entrega'} - ${t.asset_tag}`, Author: company },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  // Cabeçalho
  doc.rect(0, 0, doc.page.width, 92).fill(NAVY);
  doc.fillColor('#9fb3cc').font('Helvetica').fontSize(9).text(company.toUpperCase(), left, 28);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19).text('TERMO DE RESPONSABILIDADE', left, 42);
  doc.font('Helvetica').fontSize(11).fillColor('#dbe5f1')
    .text(isReturn ? 'Devolução de equipamento de TI' : 'Entrega de equipamento de TI', left, 66);
  doc.fillColor('#dbe5f1').fontSize(9).text(`Nº ${String(t.id).padStart(6, '0')}`, left, 30, { width, align: 'right' });
  doc.text(`Data: ${fmtDate(isReturn ? t.returned_at : t.delivered_at)}`, left, 44, { width, align: 'right' });

  doc.y = 116;
  const section = (title) => {
    doc.moveDown(0.6);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), left, doc.y);
    const y = doc.y + 2;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor(LINE).lineWidth(1).stroke();
    doc.y = y + 7;
  };
  const row = (label, value) => {
    const y = doc.y;
    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5).text(label, left, y, { width: 100 });
    doc.fillColor('#14233a').font('Helvetica-Bold').fontSize(10.5).text(value || BLANK, left + 105, y, { width: width - 105 });
    doc.moveDown(0.25);
  };

  section('Colaborador');
  row('Nome', t.employee_name);
  row('RA', t.registration);
  row('E-mail', t.email);
  row('Departamento', t.department);
  row('Unidade', t.employee_site);

  section('Equipamento');
  row('Tipo', t.type === 'desktop' ? 'Desktop' : 'Notebook');
  row('Marca / Modelo', `${t.brand} ${t.model}`);
  row('Patrimônio', t.asset_tag);
  row('Service Tag', t.service_tag);
  if (t.barcode) row('Etiqueta', t.barcode);
  if (t.hostname) row('Hostname', t.hostname);

  if (isReturn) {
    section('Declaração de devolução');
    doc.fillColor('#14233a').font('Helvetica').fontSize(10.5).text(
      'Declaro que devolvi à área de TI o equipamento acima identificado, encerrando minha responsabilidade sobre ele a partir desta data.',
      left, doc.y, { width, align: 'justify' });
    doc.moveDown(0.8);
    const box = (label) => {
      const y = doc.y;
      doc.rect(left, y + 1, 10, 10).strokeColor('#14233a').lineWidth(0.8).stroke();
      doc.fillColor('#14233a').font('Helvetica').fontSize(10.5).text(label, left + 16, y, { width: width - 16 });
      doc.moveDown(0.3);
    };
    box('Equipamento em bom estado, sem avarias');
    box('Equipamento com avarias (descrever nas observações)');
    box('Acessórios devolvidos (carregador, mouse, mochila etc.)');
    if (t.return_notes) {
      doc.moveDown(0.3);
      row('Observações', t.return_notes);
    }
  } else {
    section('Condições de uso');
    CLAUSES_ENTREGA.forEach((c, i) => {
      doc.fillColor('#14233a').font('Helvetica').fontSize(10).text(`${i + 1}. ${c}`, left, doc.y, { width, align: 'justify' });
      doc.moveDown(0.35);
    });
    if (t.delivery_notes && t.source !== 'importacao') { // a nota de carga inicial é interna
      doc.moveDown(0.3);
      row('Observações', t.delivery_notes);
    }
  }

  // Assinaturas
  const yLine = Math.max(doc.y + 56, 640);
  doc.fillColor('#14233a').font('Helvetica').fontSize(10).text(`Local e data: ____________________, ____ / ____ / ________`, left, yLine - 36);
  const half = (width - 30) / 2;
  [[left, 'Colaborador', t.employee_name], [left + half + 30, 'Responsável pela TI', '']].forEach(([x, role, name]) => {
    doc.moveTo(x, yLine + 18).lineTo(x + half, yLine + 18).strokeColor('#14233a').lineWidth(0.8).stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#14233a').text(role, x, yLine + 23, { width: half, align: 'center' });
    if (name) doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(name, x, yLine + 37, { width: half, align: 'center' });
  });

  doc.page.margins.bottom = 0; // sem isso, escrever perto do rodapé cria uma página extra
  doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(
    `Documento gerado pelo IT Asset Manager em ${new Date().toLocaleString('pt-BR')}.`,
    left, doc.page.height - 44, { width, align: 'center', lineBreak: false });
  doc.end();
  return done;
}
