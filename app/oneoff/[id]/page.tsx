'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { OneOffJob, OneOffLineItem } from '@/lib/types';
import { useTechnicians } from '@/lib/use-technicians';

interface CCProject {
  id: string;
  name: string;
}

interface CCPhoto {
  id: string;
  urls?: { original?: string; thumbnail?: string };
  uris?: Array<{ type: string; uri: string }>;
  uri?: string;
  photo_url?: string;
  captured_at?: number;
  created_at?: number;
}

export default function OneOffJobPage() {
  const technicians = useTechnicians();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<OneOffJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // CompanyCam state
  const [ccProjects, setCcProjects] = useState<CCProject[]>([]);
  const [ccPhotos, setCcPhotos] = useState<CCPhoto[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [manualPhotos, setManualPhotos] = useState<Array<{id: string; dataUrl: string; name: string}>>([]);
  const [ccSearching, setCcSearching] = useState(false);
  const [ccLoadingPhotos, setCcLoadingPhotos] = useState(false);
  const [ccError, setCcError] = useState('');
  const [ccMatchedProject, setCcMatchedProject] = useState('');

  // Email state
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [sendingDocs, setSendingDocs] = useState(false);
  const [sendingPhotos, setSendingPhotos] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
  const [serviceCompletedDate, setServiceCompletedDate] = useState('');

  function refreshJob() {
    fetch(`/api/oneoff/${id}`).then((r) => r.json()).then(setJob).catch(() => {});
  }

  useEffect(() => {
    fetch(`/api/oneoff/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(setJob)
      .catch(() => setJob(null))
      .finally(() => setLoading(false));

    fetch('/api/email')
      .then((r) => r.json())
      .then((d) => setEmailConfigured(d.configured))
      .catch(() => {});
  }, [id]);

  async function updateField(field: keyof OneOffJob, value: unknown) {
    if (!job) return;
    const updated = { ...job, [field]: value, updatedAt: new Date().toISOString() };
    setJob(updated);
    await fetch(`/api/oneoff/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
  }

  function totalPrice(j: OneOffJob | null): number {
    return (j?.lineItems || []).reduce((s, it) => s + (Number(it.price) || 0), 0);
  }

  async function updateLineItem(idx: number, updates: Partial<OneOffLineItem>) {
    if (!job) return;
    const items = job.lineItems.map((it, i) => (i === idx ? { ...it, ...updates } : it));
    await updateField('lineItems', items);
  }

  // ─── Documents ───

  function invoicePayload(j: OneOffJob) {
    return {
      brand: j.brand,
      locNumber: j.locNumber,
      storeName: j.storeName,
      woNumber: j.woNumber,
      invoiceNumber: j.invoiceNumber || '',
      serviceDate: j.serviceDate,
      ...(serviceCompletedDate ? { serviceCompletedDate } : {}),
      address: j.address,
      suite: j.suite,
      city: j.city,
      state: j.state,
      zip: j.zip || '',
      lineItems: j.lineItems,
      serviceDescription: j.serviceDescription,
    };
  }

  function workOrderPayload(j: OneOffJob) {
    return {
      brand: j.brand,
      locNumber: j.locNumber,
      storeName: j.storeName,
      woNumber: j.woNumber,
      clientPO: j.clientPO,
      orderType: j.orderType,
      serviceDescription: j.serviceDescription,
      address: j.address,
      suite: j.suite,
      city: j.city,
      state: j.state,
      zip: j.zip || '',
      serviceDate: j.serviceDate,
      ...(serviceCompletedDate ? { serviceCompletedDate } : {}),
      technician: j.assignedTech || '',
      startTime: j.startTime || '',
      stopTime: j.stopTime || '',
      photosEmail: j.photosEmail,
    };
  }

  async function generateDoc(type: 'invoice' | 'work-order' | 'both') {
    if (!job) return;
    setSaving(true);
    try {
      const { generateOneOffInvoicePDF } = await import('@/lib/pdf/oneoff-invoice');
      const { generateOneOffWorkOrderPDF } = await import('@/lib/pdf/oneoff-work-order');
      const safeBrand = job.brand.replace(/[^A-Za-z0-9]/g, '');
      if (type === 'invoice' || type === 'both') {
        generateOneOffInvoicePDF(invoicePayload(job)).save(`Invoice_${safeBrand}${job.locNumber}.pdf`);
      }
      if (type === 'work-order' || type === 'both') {
        generateOneOffWorkOrderPDF(workOrderPayload(job)).save(`WO_${safeBrand}${job.locNumber}.pdf`);
      }
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  }

  // ─── CompanyCam ───

  async function searchCompanyCam() {
    if (!job) return;
    setCcSearching(true);
    setCcError('');
    setCcPhotos([]);
    setCcProjects([]);
    setSelectedPhotos(new Set());
    setCcMatchedProject('');

    try {
      const params = new URLSearchParams({ brand: job.brand });
      if (job.locNumber) params.set('locNumber', job.locNumber);
      if (job.woNumber) params.set('woNumber', job.woNumber);
      const fullAddress = [job.address, job.city, job.state].filter(Boolean).join(', ');
      if (job.address) params.set('address', fullAddress);
      if (job.ccProjectName) params.set('projectName', job.ccProjectName);

      const res = await fetch(`/api/companycam?${params}`);
      const data = await res.json();

      if (!data.success) {
        setCcError(data.error || 'Search failed.');
        setCcSearching(false);
        return;
      }

      if (data.matched && data.project) {
        if (data.earliestDate) setServiceCompletedDate(data.earliestDate);
        setCcMatchedProject(data.project.name);
        const photos = data.photos || [];
        setCcPhotos(photos);
        const allUrls = photos.map((p: CCPhoto) => getPhotoUrl(p)).filter(Boolean);
        setSelectedPhotos(new Set(allUrls));
        autoFillTimesFromPhotos(photos);
      } else {
        setCcProjects(data.searchResults || []);
        if ((data.searchResults || []).length === 0) {
          setCcError(`No CompanyCam projects found for ${job.brand} #${job.locNumber}. Try typing the project name in the field above and search again.`);
        } else {
          setCcError(data.message || 'No exact match. Select a project below.');
        }
      }
    } catch {
      setCcError('Failed to connect to CompanyCam.');
    }
    setCcSearching(false);
  }

  async function loadPhotos(projectId: string, projectName?: string) {
    setCcLoadingPhotos(true);
    setCcError('');
    try {
      const res = await fetch(`/api/companycam?projectId=${projectId}`);
      const data = await res.json();
      if (data.success && data.photos) {
        const photos = data.photos;
        setCcPhotos(photos);
        setCcProjects([]);
        setCcMatchedProject(projectName || '');
        const allUrls = photos.map((p: CCPhoto) => getPhotoUrl(p)).filter(Boolean);
        setSelectedPhotos(new Set(allUrls));
        autoFillTimesFromPhotos(photos);
        // Remember the pick so next search hits it directly
        if (projectName && job && job.ccProjectName !== projectName) {
          updateField('ccProjectName', projectName);
        }
      }
    } catch {
      setCcError('Failed to load photos.');
    }
    setCcLoadingPhotos(false);
  }

  function getPhotoUrl(photo: CCPhoto): string {
    if (photo.urls?.original) return photo.urls.original;
    if (photo.uris?.length) {
      const original = photo.uris.find((u) => u.type === 'original');
      if (original) return original.uri;
      return photo.uris[0].uri;
    }
    return photo.uri || photo.photo_url || '';
  }

  function getThumbUrl(photo: CCPhoto): string {
    if (photo.urls?.thumbnail) return photo.urls.thumbnail;
    return getPhotoUrl(photo);
  }

  async function autoFillTimesFromPhotos(photos: CCPhoto[]) {
    if (!job || photos.length === 0) return;
    const timestamps = photos
      .map((p) => p.captured_at || p.created_at || 0)
      .filter((t) => t > 0);
    if (timestamps.length === 0) return;

    const earliest = Math.min(...timestamps);
    const latest = Math.max(...timestamps);

    const toTimeStr = (ts: number) => {
      const ms = ts < 10000000000 ? ts * 1000 : ts;
      const d = new Date(ms);
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    };

    const updates: Record<string, string> = {};
    if (!job.startTime) updates.startTime = toTimeStr(earliest);
    if (!job.stopTime) updates.stopTime = toTimeStr(latest);

    if (Object.keys(updates).length > 0) {
      const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
      setJob(updated);
      await fetch(`/api/oneoff/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    }
  }

  function togglePhoto(url: string) {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function handleManualUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const photoId = `manual-${Date.now()}-${Math.random()}`;
        setManualPhotos((prev) => [...prev, { id: photoId, dataUrl, name: file.name }]);
        setSelectedPhotos((prev) => new Set([...prev, dataUrl]));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function removeManualPhoto(photoId: string, dataUrl: string) {
    setManualPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setSelectedPhotos((prev) => { const next = new Set(prev); next.delete(dataUrl); return next; });
  }

  // ─── Workiz (mirrors the Starbucks job page) ───

  const ZIP_MAP: Record<string, string> = {
    '60005': 'ARLINGTON HEIGHTS - 60005', '60004': 'ARLINGTON HEIGHTS - 60005', '60006': 'ARLINGTON HEIGHTS - 60005',
    '60103': 'ARLINGTON HEIGHTS - 60005', '60010': 'BARRINGTON - 60010', '60011': 'BARRINGTON - 60010',
    '60021': 'BARRINGTON - 60010', '60047': 'BARRINGTON - 60010', '60074': 'PALATINE - 60074',
    '60067': 'PALATINE - 60074', '60120': 'SCHAUMBURG - 60194', '60173': 'SCHAUMBURG - 60194',
    '60176': 'SCHAUMBURG - 60194', '60177': 'SCHAUMBURG - 60194', '60194': 'SCHAUMBURG - 60194',
    '60195': 'SCHAUMBURG - 60194', '60160': 'MELROSE PARK - 60160', '60161': 'MELROSE PARK - 60160',
    '60162': 'MELROSE PARK - 60160', '60163': 'MELROSE PARK - 60160', '60164': 'MELROSE PARK - 60160',
  };

  async function pushJobToWorkiz(): Promise<{ success: boolean; message: string }> {
    if (!job) return { success: false, message: 'No job loaded.' };
    try {
      const res = await fetch('/api/workiz/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FirstName: `${job.brand} # ${job.locNumber}`,
          LastName: `Workorder # ${job.woNumber || ''}`,
          Company: 'Superclean',
          Address: job.address || '',
          City: job.city || '',
          State: job.state || 'IL',
          Country: 'US',
          PostalCode: job.zip || '',
          Email: 'documents@gosuperclean.com',
          JobType: 'Starbucks Cleaning',
          JobSource: 'National Accounts',
          type_of_job: 'National Accounts',
          ServiceArea: ZIP_MAP[job.zip || ''] || 'Schaumburg',
          JobNotes: `${job.brand} #${job.locNumber} WO# ${job.woNumber || ''} (one-off Superclean)`,
        }),
      });
      const data = await res.json();
      if (data.error || !data.success) return { success: false, message: `Workiz push failed: ${data.error || 'Unknown error'}` };
      const workizUuid = data?.data?.UUID || data?.data?.uuid;
      if (workizUuid) await updateField('workizJobId', workizUuid);
      return { success: true, message: data.mode === 'mock' ? 'Workiz (mock): simulated' : 'Pushed to Workiz ✓' };
    } catch {
      return { success: false, message: 'Failed to push to Workiz.' };
    }
  }

  // ─── Emails ───

  // Superclean invoicing requirements — all must be present before sending docs
  function missingDocRequirements(j: OneOffJob): string[] {
    return [
      !j.woNumber && 'Vendor PO #',
      !j.invoiceNumber && 'Invoice #',
      !j.serviceDate && 'Service date',
      !(j.brand && j.locNumber) && 'Brand + Loc #',
      !j.serviceDescription && 'Service description',
      totalPrice(j) <= 0 && 'Price',
    ].filter(Boolean) as string[];
  }

  async function sendDocumentsEmail(test = false) {
    if (!job) return;
    setSendingDocs(true);
    setEmailStatus('');
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'oneoff-documents',
          test,
          jobId: job.id,
          brand: job.brand,
          locNumber: job.locNumber,
          woNumber: job.woNumber,
          invoiceData: invoicePayload(job),
          workOrderData: workOrderPayload(job),
          ...(serviceCompletedDate ? { serviceCompletedDate } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailStatus(test ? 'Test sent to your email' : 'Documents sent to documents@gosuperclean.com');
        refreshJob();
      } else {
        setEmailStatus(`Failed: ${data.error}`);
      }
    } catch (err) {
      setEmailStatus('Failed to send documents email.');
      console.error(err);
    }
    setSendingDocs(false);
  }

  async function sendPhotosEmail(test = false) {
    if (!job || selectedPhotos.size === 0) return;
    setSendingPhotos(true);
    setEmailStatus('');
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'oneoff-photos',
          test,
          jobId: job.id,
          brand: job.brand,
          locNumber: job.locNumber,
          woNumber: job.woNumber,
          photosEmail: job.photosEmail || '',
          photoUrls: Array.from(selectedPhotos),
          ...(serviceCompletedDate ? { serviceCompletedDate } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmailStatus(test ? 'Test sent to your email' : `Photos sent to ${job.photosEmail}`);
        refreshJob();
      } else {
        setEmailStatus(`Failed: ${data.error}`);
      }
    } catch (err) {
      setEmailStatus('Failed to send photos email.');
      console.error(err);
    }
    setSendingPhotos(false);
  }

  async function sendAll() {
    if (!job) return;
    setSendingAll(true);
    setEmailStatus('Sending documents email…');
    const steps: string[] = [];

    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'oneoff-documents', test: false, jobId: job.id,
          brand: job.brand, locNumber: job.locNumber, woNumber: job.woNumber,
          invoiceData: invoicePayload(job), workOrderData: workOrderPayload(job),
          ...(serviceCompletedDate ? { serviceCompletedDate } : {}),
        }),
      });
      const data = await res.json();
      steps.push(data.success ? 'Docs email ✓' : `Docs email ✗: ${data.error}`);
    } catch {
      steps.push('Docs email ✗');
    }

    setEmailStatus('Sending photos email…');
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'oneoff-photos', test: false, jobId: job.id,
          brand: job.brand, locNumber: job.locNumber, woNumber: job.woNumber,
          photosEmail: job.photosEmail || '',
          photoUrls: Array.from(selectedPhotos),
          ...(serviceCompletedDate ? { serviceCompletedDate } : {}),
        }),
      });
      const data = await res.json();
      steps.push(data.success ? 'Photos email ✓' : `Photos email ✗: ${data.error}`);
    } catch {
      steps.push('Photos email ✗');
    }

    setEmailStatus('Pushing to Workiz…');
    const workizResult = await pushJobToWorkiz();
    steps.push(workizResult.message);

    refreshJob();
    setEmailStatus(steps.join(' · '));
    setSendingAll(false);
  }

  if (loading) return <p className="text-gray-500 text-center py-20">Loading...</p>;
  if (!job) return (
    <div className="text-center py-20">
      <p className="text-gray-500 mb-4">Job not found</p>
      <button onClick={() => router.push('/oneoff')} className="text-[#00A4C7] hover:underline">Back to One-Off Jobs</button>
    </div>
  );

  const docsSent = job.emailLogs?.some((l) => l.type === 'documents' && !l.test);
  const photosSent = job.emailLogs?.some((l) => l.type === 'photos' && !l.test);
  const missingDocs = missingDocRequirements(job);

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-500',
    'in-progress': 'bg-yellow-500',
    completed: 'bg-green-500',
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.push('/oneoff')} className="text-gray-400 hover:text-white text-sm mb-2 block">&larr; One-Off Jobs</button>
          <h1 className="text-2xl font-bold text-white">{job.brand} #{job.locNumber} <span className="text-gray-500 text-lg font-normal">One-Off</span></h1>
          <p className="text-gray-400 text-sm">{job.address}{job.suite ? `, ${job.suite}` : ''}, {job.city}, {job.state} {job.zip}</p>
          {job.requesterName && (
            <p className="text-gray-500 text-xs mt-0.5">Requester: {job.requesterName}{job.requesterEmail ? ` (${job.requesterEmail})` : ''}</p>
          )}
        </div>
        <div className={`w-3 h-3 rounded-full ${statusColors[job.status]}`} />
      </div>

      {/* Completed-but-not-sent warning (Superclean 24-48h rule) */}
      {job.status === 'completed' && !docsSent && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-red-400 text-sm">⚠ Job is completed but documents haven&apos;t been sent. Superclean requires the signed WO + invoice within 24-48 hours — Net-45 doesn&apos;t start until they receive everything.</p>
        </div>
      )}

      {/* Job Details */}
      <div className="bg-[#111827] rounded-lg border border-[#1f2937] p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Status</label>
          <div className="flex gap-2">
            {(['scheduled', 'in-progress', 'completed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => updateField('status', s)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  job.status === s
                    ? 'bg-[#00A4C7] text-white'
                    : 'bg-[#0a0f1a] text-gray-400 border border-[#374151] hover:border-[#00A4C7]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <EditField label="Vendor PO / WO #" value={job.woNumber} onSave={(v) => updateField('woNumber', v)} />
          <EditField label="Invoice #" value={job.invoiceNumber || ''} onSave={(v) => updateField('invoiceNumber', v)} />
          <div>
            <label className="block text-sm text-gray-400 mb-1">Assigned Tech</label>
            <select
              value={job.assignedTech || ''}
              onChange={(e) => updateField('assignedTech', e.target.value)}
              className="w-full bg-[#0a0f1a] border border-[#374151] rounded px-3 py-2 text-sm text-gray-100"
            >
              <option value="">Unassigned</option>
              {technicians.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <EditField label="Service Date" value={job.serviceDate} type="date" onSave={(v) => updateField('serviceDate', v)} />
          <EditField label="Start Time" value={job.startTime || ''} type="time" onSave={(v) => updateField('startTime', v)} />
          <EditField label="Stop Time" value={job.stopTime || ''} type="time" onSave={(v) => updateField('stopTime', v)} />
          <EditField label="Client PO / Tracking #" value={job.clientPO || ''} onSave={(v) => updateField('clientPO', v)} />
          <EditField label="Pictures Email" value={job.photosEmail || ''} onSave={(v) => updateField('photosEmail', v)} />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Service Description (goes on invoice + work order)</label>
          <textarea
            defaultValue={job.serviceDescription || ''}
            onBlur={(e) => { if (e.target.value !== (job.serviceDescription || '')) updateField('serviceDescription', e.target.value); }}
            rows={3}
            className="w-full bg-[#0a0f1a] border border-[#374151] rounded px-3 py-2 text-sm text-gray-100 focus:border-[#00A4C7] focus:outline-none"
          />
        </div>

        {/* Line items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">Invoice Line Items</label>
            <button
              onClick={() => updateField('lineItems', [...job.lineItems, { woRef: '', description: '', price: 0 }])}
              className="text-[#00A4C7] text-xs hover:underline"
            >
              + Add line item
            </button>
          </div>
          <div className="space-y-2">
            {job.lineItems.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <DebouncedInput className="w-40" value={item.woRef || ''} placeholder="WO ref"
                  onSave={(v) => updateLineItem(i, { woRef: v })} />
                <DebouncedInput className="flex-1" value={item.description} placeholder="Description"
                  onSave={(v) => updateLineItem(i, { description: v })} />
                <DebouncedInput className="w-28" value={String(item.price || '')} type="number" placeholder="Price"
                  onSave={(v) => updateLineItem(i, { price: Number(v) })} />
                {job.lineItems.length > 1 && (
                  <button
                    onClick={() => updateField('lineItems', job.lineItems.filter((_, j2) => j2 !== i))}
                    className="text-red-400 hover:text-red-300 px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-right text-sm text-white mt-2">Total: <span className="font-semibold">${totalPrice(job).toFixed(2)}</span></p>
        </div>
      </div>

      {/* Send All */}
      <div className="bg-[#0a1628] rounded-lg border border-[#00A4C7]/40 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-white font-semibold text-sm">Send Both Emails + Push to Workiz</p>
          <p className="text-gray-400 text-xs mt-0.5">
            Invoice + signed WO to documents@gosuperclean.com · photos to {job.photosEmail || '(pictures email not set)'} · job pushed to Workiz.
          </p>
          {(missingDocs.length > 0 || selectedPhotos.size === 0 || !job.photosEmail || !emailConfigured) && (
            <p className="text-yellow-400 text-xs mt-1">
              {[
                ...missingDocs.map((m) => `${m} required`),
                selectedPhotos.size === 0 && 'No photos selected',
                !job.photosEmail && 'Pictures email required',
                !emailConfigured && 'Email not configured',
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <button
          onClick={sendAll}
          disabled={sendingAll || missingDocs.length > 0 || selectedPhotos.size === 0 || !job.photosEmail || !emailConfigured}
          className="shrink-0 px-5 py-2.5 bg-[#00A4C7] text-white rounded text-sm font-semibold hover:bg-[#0090b0] transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          {sendingAll ? 'Sending…' : 'Send All'}
        </button>
      </div>

      {/* CompanyCam Photos */}
      <div className="bg-[#111827] rounded-lg border border-[#1f2937] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">CompanyCam Photos</h2>
            {ccMatchedProject && (
              <p className="text-green-400 text-xs mt-1">Matched: {ccMatchedProject}</p>
            )}
          </div>
          <button
            onClick={searchCompanyCam}
            disabled={ccSearching}
            className="px-4 py-2 bg-[#00A4C7] text-white rounded text-sm font-medium hover:bg-[#0090b0] transition-colors disabled:opacity-50"
          >
            {ccSearching ? 'Searching...' : ccPhotos.length > 0 ? 'Refresh' : 'Find Photos'}
          </button>
        </div>

        {/* Manual project-name fallback */}
        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">CompanyCam project name (manual fallback — leave blank for address matching)</label>
          <EditFieldBare value={job.ccProjectName || ''} placeholder="e.g. Cava Bolingbrook" onSave={(v) => updateField('ccProjectName', v)} />
        </div>

        {!ccSearching && ccPhotos.length === 0 && ccProjects.length === 0 && !ccError && (
          <p className="text-gray-500 text-sm mb-3">
            Click &quot;Find Photos&quot; — matches by address like the Starbucks jobs{job.ccProjectName ? `, or by project name "${job.ccProjectName}"` : ''}.
          </p>
        )}

        {ccError && <p className="text-yellow-400 text-sm mb-3">{ccError}</p>}

        {ccProjects.length > 0 && ccPhotos.length === 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-gray-400 text-sm">Select the correct project:</p>
            {ccProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => loadPhotos(p.id, p.name)}
                disabled={ccLoadingPhotos}
                className="block w-full text-left p-3 bg-[#0a0f1a] border border-[#374151] rounded hover:border-[#00A4C7] transition-colors"
              >
                <span className="text-white text-sm font-medium">{p.name}</span>
                <span className="text-gray-500 text-xs ml-2">Click to load photos</span>
              </button>
            ))}
          </div>
        )}

        {ccLoadingPhotos && <p className="text-gray-500 text-sm">Loading photos...</p>}

        {/* Manual photo upload */}
        <div className="mt-4 pt-4 border-t border-[#1f2937]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-400 text-sm font-medium">Upload Photos Manually</p>
            <label className="px-3 py-1.5 bg-[#374151] text-gray-300 rounded text-xs font-medium hover:bg-[#4b5563] transition-colors cursor-pointer">
              + Add Photos
              <input type="file" accept="image/*" multiple onChange={handleManualUpload} className="hidden" />
            </label>
          </div>
          {manualPhotos.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {manualPhotos.map((photo) => {
                const selected = selectedPhotos.has(photo.dataUrl);
                return (
                  <div key={photo.id} className="relative aspect-square rounded overflow-hidden border-2 border-[#00A4C7]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.dataUrl} alt={photo.name} className="w-full h-full object-cover" />
                    <button onClick={() => togglePhoto(photo.dataUrl)} className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${selected ? 'bg-[#00A4C7]' : 'bg-gray-600'}`} />
                    <button onClick={() => removeManualPhoto(photo.id, photo.dataUrl)} className="absolute top-1 left-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      x
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-xs">No manually uploaded photos yet.</p>
          )}
        </div>

        {/* Photo grid */}
        {ccPhotos.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3 mt-4">
              <p className="text-gray-400 text-sm">
                {ccPhotos.length} photo(s) | {selectedPhotos.size} selected
              </p>
              <button
                onClick={() => {
                  if (selectedPhotos.size === ccPhotos.length) {
                    setSelectedPhotos(new Set());
                  } else {
                    setSelectedPhotos(new Set(ccPhotos.map((p) => getPhotoUrl(p)).filter(Boolean)));
                  }
                }}
                className="text-[#00A4C7] text-xs hover:underline"
              >
                {selectedPhotos.size === ccPhotos.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {ccPhotos.map((photo) => {
                const url = getPhotoUrl(photo);
                const thumb = getThumbUrl(photo);
                const selected = selectedPhotos.has(url);
                return (
                  <button
                    key={photo.id}
                    onClick={() => togglePhoto(url)}
                    className={`relative aspect-square rounded overflow-hidden border-2 transition-colors ${
                      selected ? 'border-[#00A4C7]' : 'border-transparent'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb} alt={`Photo ${photo.id}`} className="w-full h-full object-cover" />
                    {selected && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-[#00A4C7] rounded-full flex items-center justify-center text-white text-xs font-bold">
                        &#10003;
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Workiz */}
      <div className="bg-[#111827] rounded-lg border border-[#1f2937] p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Workiz</h2>
        {job.workizJobId && (
          <p className="text-gray-400 text-sm mb-3">
            Job ID: <span className="text-white font-mono">{job.workizJobId}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            disabled={!job.woNumber || saving}
            onClick={async () => {
              setEmailStatus('');
              const result = await pushJobToWorkiz();
              setEmailStatus(result.message);
            }}
            className="px-4 py-2 bg-[#00A4C7] text-white rounded text-sm font-medium hover:bg-[#0090b0] transition-colors disabled:opacity-50"
          >
            {job.workizJobId ? 'Push Again to Workiz' : 'Push Job to Workiz'}
          </button>
          <button
            onClick={async () => {
              if (!job.workizJobId) { setEmailStatus('Push job to Workiz first.'); return; }
              setEmailStatus('');
              try {
                const res = await fetch('/api/workiz/invoice', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    JobUUID: job.workizJobId,
                    Items: job.lineItems.map((item) => ({
                      description: `${item.description} - ${job.brand} #${job.locNumber}${item.woRef ? ` (${item.woRef})` : ''}`,
                      quantity: 1,
                      price: item.price || 0,
                    })),
                  }),
                });
                const data = await res.json();
                if (data.error || !data.success) {
                  setEmailStatus(`Workiz invoice failed: ${data.error || 'Unknown error'}`);
                } else {
                  setEmailStatus(data.mode === 'mock' ? 'Workiz (mock): invoice creation simulated' : 'Invoice created in Workiz!');
                }
              } catch {
                setEmailStatus('Failed to create Workiz invoice.');
              }
            }}
            disabled={!job.workizJobId}
            className="px-4 py-2 bg-[#00A4C7] text-white rounded text-sm font-medium hover:bg-[#0090b0] transition-colors disabled:opacity-50"
          >
            Create Invoice in Workiz
          </button>
        </div>
        {!job.workizJobId && (
          <p className="text-gray-500 text-xs mt-2">Push this job to Workiz first to enable invoice creation</p>
        )}
      </div>

      {/* Documents */}
      <div className="bg-[#111827] rounded-lg border border-[#1f2937] p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Documents</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => generateDoc('invoice')} disabled={saving}
            className="px-4 py-2 bg-[#00A4C7] text-white rounded text-sm font-medium hover:bg-[#0090b0] transition-colors disabled:opacity-50">
            Generate Invoice PDF
          </button>
          <button onClick={() => generateDoc('work-order')} disabled={saving}
            className="px-4 py-2 bg-[#00A4C7] text-white rounded text-sm font-medium hover:bg-[#0090b0] transition-colors disabled:opacity-50">
            Generate Work Order PDF
          </button>
          <button onClick={() => generateDoc('both')} disabled={saving}
            className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50">
            Download Both
          </button>
        </div>
        {missingDocs.length > 0 && (
          <p className="text-yellow-400 text-xs mt-3">Superclean requires: {missingDocs.join(', ')} — fill these before sending.</p>
        )}
      </div>

      {/* Email Sending */}
      <div className="bg-[#111827] rounded-lg border border-[#1f2937] p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Send Emails</h2>

        {!emailConfigured && (
          <p className="text-yellow-400 text-sm mb-4">Email not configured. Set RESEND_API_KEY in .env.local</p>
        )}

        <div className="space-y-4">
          {/* Documents email */}
          <div className="p-4 bg-[#0a0f1a] rounded border border-[#1f2937]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">
                  Invoice + Work Order
                  {docsSent && <span className="ml-2 text-green-400 text-xs font-normal">Sent</span>}
                </p>
                <p className="text-gray-500 text-xs">To: documents@gosuperclean.com</p>
                <p className="text-gray-500 text-xs">Attachments: Invoice PDF, Signed Work Order PDF</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => sendDocumentsEmail(true)}
                  disabled={sendingDocs || !emailConfigured || missingDocs.length > 0}
                  className="px-3 py-2 bg-[#374151] text-gray-300 rounded text-xs font-medium hover:bg-[#4b5563] transition-colors disabled:opacity-50"
                >
                  Test to Me
                </button>
                <button
                  onClick={() => sendDocumentsEmail(false)}
                  disabled={sendingDocs || !emailConfigured || missingDocs.length > 0}
                  className="px-4 py-2 bg-[#00A4C7] text-white rounded text-sm font-medium hover:bg-[#0090b0] transition-colors disabled:opacity-50"
                >
                  {sendingDocs ? 'Sending...' : docsSent ? 'Resend Documents' : 'Send Documents'}
                </button>
              </div>
            </div>
            {missingDocs.length > 0 && (
              <p className="text-yellow-500 text-xs mt-2">Required before sending: {missingDocs.join(', ')}</p>
            )}
          </div>

          {/* Photos email */}
          <div className="p-4 bg-[#0a0f1a] rounded border border-[#1f2937]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">
                  Service Photos ({selectedPhotos.size} selected)
                  {photosSent && <span className="ml-2 text-green-400 text-xs font-normal">Sent</span>}
                </p>
                <p className="text-gray-500 text-xs">To: {job.photosEmail || 'Set the Pictures Email field above'}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => sendPhotosEmail(true)}
                  disabled={sendingPhotos || !emailConfigured || selectedPhotos.size === 0}
                  className="px-3 py-2 bg-[#374151] text-gray-300 rounded text-xs font-medium hover:bg-[#4b5563] transition-colors disabled:opacity-50"
                >
                  Test to Me
                </button>
                <button
                  onClick={() => sendPhotosEmail(false)}
                  disabled={sendingPhotos || !emailConfigured || selectedPhotos.size === 0 || !job.photosEmail}
                  className="px-4 py-2 bg-[#00A4C7] text-white rounded text-sm font-medium hover:bg-[#0090b0] transition-colors disabled:opacity-50"
                >
                  {sendingPhotos ? 'Sending...' : photosSent ? 'Resend Photos' : 'Send Photos'}
                </button>
              </div>
            </div>
            {selectedPhotos.size === 0 && (
              <p className="text-yellow-500 text-xs mt-2">Find or upload photos above first</p>
            )}
            {selectedPhotos.size > 0 && !job.photosEmail && (
              <p className="text-yellow-500 text-xs mt-2">Enter the Pictures Email in the job details above</p>
            )}
          </div>
        </div>

        {emailStatus && (
          <div className={`mt-4 p-3 rounded text-sm ${
            emailStatus.includes('Failed') || emailStatus.includes('✗')
              ? 'bg-red-500/10 border border-red-500/30 text-red-400'
              : 'bg-green-500/10 border border-green-500/30 text-green-400'
          }`}>
            {emailStatus}
          </div>
        )}

        {/* Email send log */}
        {job.emailLogs && job.emailLogs.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#1f2937]">
            <h3 className="text-sm font-semibold text-white mb-2">Email Log</h3>
            <div className="space-y-1">
              {job.emailLogs.map((log, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 bg-[#0a0f1a] rounded">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                      log.type === 'documents' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {log.type === 'documents' ? 'Docs' : 'Photos'}
                    </span>
                    {log.test && <span className="text-yellow-400">[TEST]</span>}
                    <span className="text-gray-400">to {log.to}</span>
                  </div>
                  <span className="text-gray-500">
                    {new Date(log.sentAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditField({ label, value, type = 'text', onSave }: {
  label: string;
  value: string;
  type?: string;
  onSave: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <EditFieldBare value={value} type={type} onSave={onSave} />
    </div>
  );
}

function EditFieldBare({ value, type = 'text', placeholder, onSave }: {
  value: string;
  type?: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [localVal, setLocalVal] = useState(value);
  const [editing, setEditing] = useState(false);

  const displayVal = editing ? localVal : value;

  function handleBlur() {
    setEditing(false);
    if (localVal !== value) onSave(localVal);
  }

  return (
    <input
      type={type}
      value={displayVal}
      placeholder={placeholder}
      onFocus={() => { setEditing(true); setLocalVal(value); }}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(); }}
      className="w-full bg-[#0a0f1a] border border-[#374151] rounded px-3 py-2 text-sm text-gray-100 focus:border-[#00A4C7] focus:outline-none"
    />
  );
}

function DebouncedInput({ value, type = 'text', placeholder, className = '', onSave }: {
  value: string;
  type?: string;
  placeholder?: string;
  className?: string;
  onSave: (v: string) => void;
}) {
  const [localVal, setLocalVal] = useState(value);
  const [editing, setEditing] = useState(false);

  const displayVal = editing ? localVal : value;

  function handleBlur() {
    setEditing(false);
    if (localVal !== value) onSave(localVal);
  }

  return (
    <input
      type={type}
      value={displayVal}
      placeholder={placeholder}
      onFocus={() => { setEditing(true); setLocalVal(value); }}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(); }}
      className={`bg-[#0a0f1a] border border-[#374151] rounded px-3 py-2 text-sm text-gray-100 focus:border-[#00A4C7] focus:outline-none ${className}`}
    />
  );
}
