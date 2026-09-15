import { NextRequest, NextResponse } from 'next/server';
import { sendEmail, isEmailConfigured } from '@/lib/email';
import { downloadPhotoAsBase64 } from '@/lib/companycam';
import { generateInvoicePDF } from '@/lib/pdf/invoice';
import { generateWorkOrderPDF } from '@/lib/pdf/work-order';
import { generateOneOffInvoicePDF, OneOffInvoiceData } from '@/lib/pdf/oneoff-invoice';
import { generateOneOffWorkOrderPDF, OneOffWorkOrderData } from '@/lib/pdf/oneoff-work-order';
import { getJobById, updateJob, getOneOffJobById, updateOneOffJob } from '@/lib/db';
import { EmailLog } from '@/lib/types';

interface OneOffSendRequest {
  type: 'oneoff-documents' | 'oneoff-photos';
  test?: boolean;
  jobId?: string;
  brand: string;
  locNumber: string;
  woNumber: string;
  /** Required for oneoff-photos (unless test): where the pictures email goes */
  photosEmail?: string;
  invoiceData?: OneOffInvoiceData;
  workOrderData?: OneOffWorkOrderData;
  photoUrls?: string[];
  serviceCompletedDate?: string;
}

interface SendRequest {
  type: 'documents' | 'photos';
  test?: boolean;
  jobId?: string;
  storeNumber: string;
  woNumber: string;
  invoiceData?: {
    invoiceNumber: string;
    price: number;
    serviceDate: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  workOrderData?: {
    address: string;
    city: string;
    state: string;
    zip: string;
    storePhone: string;
    serviceDate: string;
    technician: string;
    startTime: string;
    stopTime: string;
  };
  photoUrls?: string[];
  serviceCompletedDate?: string;
}

async function logEmailToOneOffJob(jobId: string | undefined, log: EmailLog) {
  if (!jobId) return;
  try {
    const job = await getOneOffJobById(jobId);
    if (!job) return;
    const logs = job.emailLogs || [];
    logs.push(log);
    await updateOneOffJob(jobId, { emailLogs: logs });
  } catch (err) {
    console.error('Failed to log one-off email:', err);
  }
}

async function logEmailToJob(jobId: string | undefined, log: EmailLog) {
  if (!jobId) return;
  try {
    const job = await getJobById(jobId);
    if (!job) return;
    const logs = job.emailLogs || [];
    logs.push(log);
    await updateJob(jobId, { emailLogs: logs } as Record<string, unknown>);
  } catch (err) {
    console.error('Failed to log email:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isEmailConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Email not configured. Set RESEND_API_KEY in .env.local' },
        { status: 500 }
      );
    }

    const body: SendRequest | OneOffSendRequest = await req.json();
    const testRecipient = process.env.EMAIL_REPLY_TO || 'gailan.robertson@rollingsuds.com';

    // ─── One-off (non-Starbucks) Superclean jobs ───
    if (body.type === 'oneoff-documents') {
      if (!body.invoiceData || !body.workOrderData) {
        return NextResponse.json({ error: 'invoiceData and workOrderData required' }, { status: 400 });
      }

      const to = body.test ? testRecipient : 'documents@gosuperclean.com';
      const label = `${body.brand} #${body.locNumber} WO# ${body.woNumber}`;
      const subject = `${body.test ? '[TEST] ' : ''}${label} Invoice`;

      const invPdf = generateOneOffInvoicePDF(body.invoiceData);
      const invBase64 = Buffer.from(invPdf.output('arraybuffer')).toString('base64');

      const woPdf = generateOneOffWorkOrderPDF(body.workOrderData);
      const woBase64 = Buffer.from(woPdf.output('arraybuffer')).toString('base64');

      const safeBrand = body.brand.replace(/[^A-Za-z0-9]/g, '');
      await sendEmail({
        to,
        subject,
        body: `<p>Attached is the invoice and signed WO for ${label}${body.serviceCompletedDate ? ` completed on ${formatDateForEmail(body.serviceCompletedDate)}` : ''}. Let me know if you have any questions. Thanks.</p>`,
        attachments: [
          { name: `Invoice_${safeBrand}${body.locNumber}_WO${body.woNumber}.pdf`, contentType: 'application/pdf', base64: invBase64 },
          { name: `WorkOrder_${safeBrand}${body.locNumber}_WO${body.woNumber}.pdf`, contentType: 'application/pdf', base64: woBase64 },
        ],
      });

      await logEmailToOneOffJob(body.jobId, {
        type: 'documents', to, subject, sentAt: new Date().toISOString(), test: !!body.test,
      });

      return NextResponse.json({ success: true, message: 'Documents email sent' });

    } else if (body.type === 'oneoff-photos') {
      if (!body.photoUrls || body.photoUrls.length === 0) {
        return NextResponse.json({ error: 'photoUrls required' }, { status: 400 });
      }
      if (!body.test && !body.photosEmail) {
        return NextResponse.json({ error: 'photosEmail required — enter the pictures email address on the job' }, { status: 400 });
      }

      const to = body.test ? testRecipient : body.photosEmail!;
      const label = `${body.brand} #${body.locNumber} WO# ${body.woNumber}`;
      const subject = `${body.test ? '[TEST] ' : ''}${label} Pictures`;

      const safeBrand = body.brand.replace(/[^A-Za-z0-9]/g, '');
      const attachments = [];
      for (let i = 0; i < body.photoUrls.length; i++) {
        const { base64, contentType } = await downloadPhotoAsBase64(body.photoUrls[i]);
        const ext = contentType.includes('png') ? 'png' : 'jpg';
        attachments.push({ name: `${safeBrand}${body.locNumber}_photo_${i + 1}.${ext}`, contentType, base64 });
      }

      await sendEmail({
        to,
        subject,
        body: `<p>Attached are the before/after pictures for ${label}${body.serviceCompletedDate ? ` completed on ${formatDateForEmail(body.serviceCompletedDate)}` : ''}. Let me know if you have any questions. Thanks.</p>`,
        attachments,
      });

      await logEmailToOneOffJob(body.jobId, {
        type: 'photos', to, subject, sentAt: new Date().toISOString(), test: !!body.test,
      });

      return NextResponse.json({ success: true, message: 'Photos email sent' });
    }

    if (body.type === 'documents') {
      if (!body.invoiceData || !body.workOrderData) {
        return NextResponse.json({ error: 'invoiceData and workOrderData required' }, { status: 400 });
      }

      const to = body.test ? testRecipient : 'documents@gosuperclean.com';
      const subject = `${body.test ? '[TEST] ' : ''}Starbucks #${body.storeNumber} WO# ${body.woNumber} Invoice`;

      const invPdf = generateInvoicePDF({
        storeNumber: body.storeNumber,
        woNumber: body.woNumber,
        ...body.invoiceData,
        ...(body.serviceCompletedDate ? { serviceCompletedDate: body.serviceCompletedDate } : {}),
      });
      const invBase64 = Buffer.from(invPdf.output('arraybuffer')).toString('base64');

      const woPdf = generateWorkOrderPDF({
        storeNumber: body.storeNumber,
        woNumber: body.woNumber,
        ...body.workOrderData,
        ...(body.serviceCompletedDate ? { serviceCompletedDate: body.serviceCompletedDate } : {}),
      });
      const woBase64 = Buffer.from(woPdf.output('arraybuffer')).toString('base64');

      await sendEmail({
        to,
        subject,
        body: `<p>Attached is the invoice and signed WO for Starbucks #${body.storeNumber} WO# ${body.woNumber}${body.serviceCompletedDate ? ` completed on ${formatDateForEmail(body.serviceCompletedDate)}` : ''}. Let me know if you have any questions. Thanks.</p>`,
        attachments: [
          {
            name: `Invoice_SB${body.storeNumber}_WO${body.woNumber}.pdf`,
            contentType: 'application/pdf',
            base64: invBase64,
          },
          {
            name: `WorkOrder_SB${body.storeNumber}_WO${body.woNumber}.pdf`,
            contentType: 'application/pdf',
            base64: woBase64,
          },
        ],
      });

      await logEmailToJob(body.jobId, {
        type: 'documents',
        to,
        subject,
        sentAt: new Date().toISOString(),
        test: !!body.test,
      });

      return NextResponse.json({ success: true, message: 'Documents email sent' });

    } else if (body.type === 'photos') {
      if (!body.photoUrls || body.photoUrls.length === 0) {
        return NextResponse.json({ error: 'photoUrls required' }, { status: 400 });
      }

      const to = body.test ? testRecipient : 'starbucks@gosuperclean.com';
      const subject = `${body.test ? '[TEST] ' : ''}Starbucks #${body.storeNumber} WO# ${body.woNumber} Pictures`;

      const attachments = [];
      for (let i = 0; i < body.photoUrls.length; i++) {
        const { base64, contentType } = await downloadPhotoAsBase64(body.photoUrls[i]);
        const ext = contentType.includes('png') ? 'png' : 'jpg';
        attachments.push({
          name: `SB${body.storeNumber}_photo_${i + 1}.${ext}`,
          contentType,
          base64,
        });
      }

      await sendEmail({
        to,
        subject,
        body: `<p>Attached are the before/after pictures and front door photo for Starbucks #${body.storeNumber} WO# ${body.woNumber}${body.serviceCompletedDate ? ` completed on ${formatDateForEmail(body.serviceCompletedDate)}` : ''}. Let me know if you have any questions. Thanks.</p>`,
        attachments,
      });

      await logEmailToJob(body.jobId, {
        type: 'photos',
        to,
        subject,
        sentAt: new Date().toISOString(),
        test: !!body.test,
      });

      return NextResponse.json({ success: true, message: 'Photos email sent' });

    } else {
      return NextResponse.json({ error: 'type must be "documents" or "photos"' }, { status: 400 });
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function formatDateForEmail(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return dateStr; }
}

export async function GET() {
  return NextResponse.json({ configured: isEmailConfigured() });
}
