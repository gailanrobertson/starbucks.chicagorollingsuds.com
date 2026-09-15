import { jsPDF } from 'jspdf';
import { GAILAN_SIG_BASE64 } from './work-order';

export interface OneOffWorkOrderData {
  brand: string;
  locNumber: string;
  storeName?: string;
  woNumber: string;
  clientPO?: string;
  orderType?: string;
  serviceDescription?: string;
  address: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  serviceDate: string;
  serviceCompletedDate?: string;
  technician: string;
  startTime: string;
  stopTime: string;
  photosEmail?: string;
}

export function generateOneOffWorkOrderPDF(data: OneOffWorkOrderData): jsPDF {
  const doc = new jsPDF('p', 'pt', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 36;
  const rightEdge = pageWidth - margin;
  const black = '#000000';
  let y = 36;

  // ─── HEADER LEFT: Superclean info ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(black);
  doc.text('SUPERCLEAN SERVICE COMPANY, INC', margin, y);
  y += 12;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text('Super Service, Super Reliable, Super Clean', margin, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('PO Box 551802', margin, y);
  y += 10;
  doc.text('Dallas, TX 75355', margin, y);
  y += 10;
  doc.text('P: 214-576-1700', margin, y);

  // ─── HEADER RIGHT: WO # and location ───
  const rightCol = pageWidth * 0.48;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`VENDOR PO # ${data.woNumber}`, rightEdge, 38, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  let rY = 56;
  doc.text(`SERVICE: ${data.orderType || 'Pressure Washing'}`, rightCol, rY);
  rY += 13;
  doc.text(`${data.brand}${data.storeName ? ` - ${data.storeName}` : ''} - Loc # ${data.locNumber}`, rightCol, rY);
  rY += 11;
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.address}${data.suite ? `, ${data.suite}` : ''}`, rightCol, rY);
  rY += 11;
  doc.text(`${data.city}, ${data.state} ${data.zip}`, rightCol, rY);
  rY += 11;
  if (data.clientPO) {
    doc.text(`Client PO / Tracking # ${data.clientPO}`, rightCol, rY);
  }

  y += 20;

  // ─── SERVICE DATE / WO# / CLIENT PO TABLE ───
  const tableTop = y;
  const tableHeight = 32;
  const col1W = (pageWidth - margin * 2) * 0.35;
  const col2W = (pageWidth - margin * 2) * 0.38;
  const col3W = (pageWidth - margin * 2) * 0.27;

  doc.setDrawColor(black);
  doc.setLineWidth(0.75);

  doc.setFillColor('#333333');
  doc.rect(margin, tableTop, col1W, 14, 'FD');
  doc.rect(margin + col1W, tableTop, col2W, 14, 'FD');
  doc.rect(margin + col1W + col2W, tableTop, col3W, 14, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor('#FFFFFF');
  doc.text('SERVICE DATE', margin + 4, tableTop + 10);
  doc.text('VENDOR PO #', margin + col1W + 4, tableTop + 10);
  doc.text('CLIENT PO #', margin + col1W + col2W + 4, tableTop + 10);

  doc.setTextColor(black);
  const dataRowY = tableTop + 14;
  doc.rect(margin, dataRowY, col1W, tableHeight - 14, 'S');
  doc.rect(margin + col1W, dataRowY, col2W, tableHeight - 14, 'S');
  doc.rect(margin + col1W + col2W, dataRowY, col3W, tableHeight - 14, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(formatDateFull(data.serviceDate), margin + 4, dataRowY + 12);

  doc.setFont('helvetica', 'normal');
  doc.text(data.woNumber, margin + col1W + 4, dataRowY + 12);
  doc.text(data.clientPO || '', margin + col1W + col2W + 4, dataRowY + 12);

  y = tableTop + tableHeight + 12;

  // ─── SERVICE LINE ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(data.orderType || 'Pressure Washing', margin, y);
  doc.text('COMPLETE_____X_____', rightEdge - 140, y);
  y += 16;

  // ─── SERVICE DESCRIPTION (from the Superclean PO) ───
  doc.setDrawColor(black);
  doc.setLineWidth(0.5);
  const instrBoxTop = y;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(black);

  const instrText = data.serviceDescription ||
    'Pressure washing service per Superclean work order. Photos of service are mandatory.';

  const instrLines = doc.splitTextToSize(instrText, pageWidth - margin * 2 - 8);
  doc.text(instrLines, margin + 4, y + 10);

  const instrBoxHeight = instrLines.length * 8 + 16;
  doc.rect(margin, instrBoxTop - 4, pageWidth - margin * 2, instrBoxHeight, 'S');

  y = instrBoxTop + instrBoxHeight + 16;

  // ─── PHOTO WARNING ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(black);
  doc.text('IMPORTANT! PHOTOS OF SERVICE ARE MANDATORY —', margin, y);
  y += 12;
  doc.text('BEFORE AND AFTER PHOTOS REQUIRED FOR PAYMENT', margin, y);
  y += 18;

  // ─── DIVIDER ───
  doc.setLineWidth(0.5);
  doc.line(margin, y, rightEdge, y);
  y += 14;

  // ─── TECHNICIAN COMPLETION CHECKLIST ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Technician Completion Checklist', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  const checklistItems = [
    'Remember, respectful conduct is a MUST!',
    'Bring WO and Photo ID to service.',
    'Service performed per work order description above',
    'Take before and after photos',
    'Make sure wastewater properly disposed of',
    'Wipe down windows of any over spray',
    ...(data.photosEmail ? [`Photos sent to ${data.photosEmail}`] : []),
  ];

  for (const item of checklistItems) {
    doc.text('_X_', margin, y);
    doc.text(item, margin + 22, y);
    y += 12;
  }

  y += 12;

  // ─── COMPLETION FIELDS ───
  const fieldLineWidth = 200;
  const fieldLabelX = margin;
  const fieldLineX = margin + 95;

  const completedDate = data.serviceCompletedDate ? formatDateShort(data.serviceCompletedDate) : formatDateShort(data.serviceDate);
  const techName = data.technician || '';
  const startFormatted = formatTime(data.startTime);
  const stopFormatted = formatTime(data.stopTime);
  const totalHrs = calculateHours(data.startTime, data.stopTime);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  doc.text('Date Completed:', fieldLabelX, y);
  doc.line(fieldLineX, y + 1, fieldLineX + fieldLineWidth, y + 1);
  if (completedDate) doc.text(completedDate, fieldLineX + 4, y);
  y += 14;

  doc.text('Technician:', fieldLabelX, y);
  doc.line(fieldLineX, y + 1, fieldLineX + fieldLineWidth, y + 1);
  if (techName) doc.text(techName, fieldLineX + 4, y);
  y += 14;

  doc.text('Start Time:', fieldLabelX, y);
  doc.line(fieldLineX, y + 1, fieldLineX + fieldLineWidth, y + 1);
  if (startFormatted) doc.text(startFormatted, fieldLineX + 4, y);
  y += 14;

  doc.text('Stop Time:', fieldLabelX, y);
  doc.line(fieldLineX, y + 1, fieldLineX + fieldLineWidth, y + 1);
  if (stopFormatted) doc.text(stopFormatted, fieldLineX + 4, y);
  y += 14;

  doc.text('Total Hours:', fieldLabelX, y);
  doc.line(fieldLineX, y + 1, fieldLineX + fieldLineWidth, y + 1);
  if (totalHrs) doc.text(totalHrs, fieldLineX + 4, y);
  y += 22;

  // ─── TECH SIGNATURE ───
  doc.text('Tech Signature:', fieldLabelX, y);
  doc.line(fieldLineX, y + 1, fieldLineX + fieldLineWidth, y + 1);

  const sigW = 110;
  const sigH = 24;
  doc.addImage(GAILAN_SIG_BASE64, 'PNG', fieldLineX + 2, y - sigH + 2, sigW, sigH);

  y += 30;

  // ─── FOOTER ───
  doc.setLineWidth(0.5);
  doc.line(margin, y, rightEdge, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Signed work order submitted to Superclean within 24-48 hours of service completion.', margin, y);

  return doc;
}

function formatDateFull(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    const month = d.getMonth() + 1;
    const date = d.getDate();
    const year = d.getFullYear();
    return `${day} ${month}/${date}/${year}`;
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function calculateHours(start: string, stop: string): string {
  if (!start || !stop) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = stop.split(':').map(Number);
  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin < startMin) endMin += 24 * 60; // overnight
  const diff = endMin - startMin;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return `${hours}h ${mins}m`;
}
