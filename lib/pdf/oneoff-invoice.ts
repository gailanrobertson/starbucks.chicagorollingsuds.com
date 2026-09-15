import { jsPDF } from 'jspdf';
import { COMPANY } from '../constants';
import { OneOffLineItem } from '../types';

// Superclean billing address (from prior accepted invoices)
const SUPERCLEAN_BILLING = [
  '1380 Corporate Center Curve suite 107',
  'Eagan, Minnesota 55121',
  '(888) 337-8737',
  'documents@gosuperclean.com',
];

export interface OneOffInvoiceData {
  brand: string;
  locNumber: string;
  storeName?: string;
  woNumber: string;
  invoiceNumber: string;
  serviceDate: string;
  serviceCompletedDate?: string;
  address: string;
  suite?: string;
  city: string;
  state: string;
  zip: string;
  lineItems: OneOffLineItem[];
  serviceDescription?: string;
}

export function generateOneOffInvoicePDF(data: OneOffInvoiceData): jsPDF {
  const doc = new jsPDF('p', 'pt', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 50;
  const teal = '#00A4C7';
  const gray = '#888888';
  const darkGray = '#333333';
  let y = 50;

  // Header - Rolling Suds brand
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(teal);
  doc.text('Rolling Suds', margin, y);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor('#aaaaaa');
  doc.text('THE POWER WASHING PROFESSIONALS', margin, y);
  y += 18;

  doc.setFontSize(9);
  doc.setTextColor(darkGray);
  doc.text(COMPANY.name, margin, y);
  y += 13;
  doc.text(COMPANY.phone, margin, y);
  y += 13;
  doc.text(COMPANY.email, margin, y);

  // INVOICE title right-aligned
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(darkGray);
  doc.text('INVOICE', pageWidth - margin, 50, { align: 'right' });

  // Meta fields right-aligned
  const metaX = pageWidth - margin;
  let metaY = 78;
  doc.setFontSize(9);

  const formattedDate = formatDateLong(data.serviceCompletedDate || data.serviceDate);

  const metaFields = [
    ['Invoice #', data.invoiceNumber || ''],
    ['Service Date', formattedDate],
    ['W/O #', data.woNumber],
  ];

  for (const [label, value] of metaFields) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(gray);
    doc.text(label, metaX - 120, metaY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(darkGray);
    doc.text(value, metaX, metaY, { align: 'right' });
    metaY += 15;
  }

  y = 140;

  // Teal divider
  doc.setDrawColor(teal);
  doc.setLineWidth(2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 25;

  // Bill To / Service Location
  const colWidth = (pageWidth - margin * 2) / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(darkGray);
  doc.text('Bill To:', margin, y);
  doc.text('Service Location:', margin + colWidth, y);
  y += 18;

  const billToLines = [
    `Go Super Clean Workorder # ${data.woNumber}`,
    `${data.brand} Store # ${data.locNumber}`,
    ...SUPERCLEAN_BILLING,
  ];

  const locationLines = [
    `${data.brand}${data.storeName ? ` - ${data.storeName}` : ''} - Loc # ${data.locNumber}`,
    `${data.address}${data.suite ? `, ${data.suite}` : ''}`,
    `${data.city}, ${data.state} ${data.zip}`,
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor('#555555');

  const blockHeight = Math.max(billToLines.length, locationLines.length) * 14;
  billToLines.forEach((line, i) => doc.text(line, margin, y + i * 14));
  locationLines.forEach((line, i) => doc.text(line, margin + colWidth, y + i * 14));
  y += blockHeight + 20;

  // Description Table
  const tableLeft = margin;
  const tableRight = pageWidth - margin;
  const tableWidth = tableRight - tableLeft;

  // Header row
  doc.setFillColor(teal);
  doc.rect(tableLeft, y, tableWidth, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor('#FFFFFF');

  const colDesc = tableLeft + 12;
  const colQty = tableLeft + tableWidth * 0.62;
  const colPrice = tableLeft + tableWidth * 0.74;
  const colAmount = tableLeft + tableWidth * 0.88;

  doc.text('Description', colDesc, y + 16);
  doc.text('QTY', colQty, y + 16);
  doc.text('Price', colPrice, y + 16);
  doc.text('Amount', colAmount, y + 16);
  y += 24;

  // One row per line item
  const items = data.lineItems.length > 0 ? data.lineItems : [{ description: 'Service', price: 0 }];
  let subtotal = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as OneOffLineItem;
    subtotal += item.price || 0;

    const titleLines = doc.splitTextToSize(item.description || 'Service', tableWidth * 0.55);
    const subLines = [
      ...(item.woRef ? [item.woRef] : []),
      `${data.brand} - Loc # ${data.locNumber}`,
      `${data.address}, ${data.city}, ${data.state} ${data.zip}`,
    ];
    const rowHeight = 24 + titleLines.length * 11 + subLines.length * 11;

    doc.setFillColor(i % 2 === 0 ? '#f7f7f7' : '#ffffff');
    doc.rect(tableLeft, y, tableWidth, rowHeight, 'F');
    doc.setDrawColor('#e0e0e0');
    doc.setLineWidth(0.5);
    doc.rect(tableLeft, y, tableWidth, rowHeight, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(darkGray);
    doc.text(titleLines, colDesc, y + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#666666');
    subLines.forEach((line, li) => {
      doc.text(line, colDesc, y + 16 + titleLines.length * 11 + li * 11);
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(darkGray);
    doc.text('1', colQty + 5, y + 16);
    doc.text(`$${(item.price || 0).toFixed(2)}`, colPrice, y + 16);
    doc.text(`$${(item.price || 0).toFixed(2)}`, colAmount, y + 16);

    y += rowHeight;
  }

  y += 20;

  // Totals - right aligned
  const totalsLabelX = colPrice - 5;
  const totalsValX = pageWidth - margin;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(gray);
  doc.text('Sub total', totalsLabelX, y, { align: 'right' });
  doc.setTextColor(darkGray);
  doc.text(`$${subtotal.toFixed(2)}`, totalsValX, y, { align: 'right' });
  y += 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(darkGray);
  doc.text('Total', totalsLabelX, y, { align: 'right' });
  doc.text(`$${subtotal.toFixed(2)}`, totalsValX, y, { align: 'right' });
  y += 20;

  doc.setTextColor(teal);
  doc.setFontSize(10);
  doc.text('Balance Due', totalsLabelX, y, { align: 'right' });
  doc.text(`$${subtotal.toFixed(2)}`, totalsValX, y, { align: 'right' });
  y += 30;

  // Service description (Superclean invoicing requirement)
  if (data.serviceDescription) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(darkGray);
    doc.text('Service Description:', margin, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor('#666666');
    const descLines = doc.splitTextToSize(data.serviceDescription, pageWidth - margin * 2);
    doc.text(descLines, margin, y);
  }

  // Bottom teal bar
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFillColor(teal);
  doc.rect(0, pageHeight - 6, pageWidth, 6, 'F');

  return doc;
}

function formatDateLong(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
