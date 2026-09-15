'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OneOffJob, OneOffLineItem } from '@/lib/types';
import { parseVendorPO, ParsedVendorPO } from '@/lib/parse-vendor-po';
import { DEFAULT_PRICE } from '@/lib/constants';

export default function OneOffPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<OneOffJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Review form state (null = no PO parsed yet)
  const [form, setForm] = useState<(ParsedVendorPO & { photosEmail: string; lineItems: OneOffLineItem[] }) | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/oneoff')
      .then((r) => r.json())
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function extractPdfLines(file: File): Promise<string[]> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();

    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const lines: string[] = [];

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Group text items into visual lines by y coordinate
      const rows = new Map<number, Array<{ x: number; str: string }>>();
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        let key = y;
        for (const k of rows.keys()) {
          if (Math.abs(k - y) <= 2) { key = k; break; }
        }
        const row = rows.get(key) || [];
        row.push({ x: item.transform[4], str: item.str });
        rows.set(key, row);
      }
      const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]);
      for (const [, row] of sorted) {
        row.sort((a, b) => a.x - b.x);
        lines.push(row.map((r) => r.str).join(' ').replace(/\s+/g, ' ').trim());
      }
    }
    return lines;
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setParseError('Please upload the Superclean Vendor PO as a PDF.');
      return;
    }
    setParsing(true);
    setParseError('');
    try {
      const lines = await extractPdfLines(file);
      const parsed = parseVendorPO(lines);
      setForm({
        ...parsed,
        photosEmail: '',
        lineItems: [{
          woRef: parsed.woNumber,
          description: parsed.orderType || 'Pressure Washing',
          price: DEFAULT_PRICE,
        }],
      });
      if (!parsed.woNumber && !parsed.address) {
        setParseError('Could not read much from that PDF — fill the fields in manually below.');
      }
    } catch (err) {
      console.error(err);
      setParseError('Failed to read the PDF. You can still create the job manually below.');
      setForm({
        woNumber: '', brand: '', locNumber: '', storeName: '', address: '', suite: '',
        city: '', state: 'IL', zip: '', clientPO: '', orderType: 'Pressure Washing',
        serviceDate: '', serviceTime: '', serviceDescription: '', requesterName: '',
        requesterEmail: '', photosEmail: '',
        lineItems: [{ description: 'Pressure Washing', price: DEFAULT_PRICE }],
      });
    }
    setParsing(false);
  }

  function setField<K extends keyof NonNullable<typeof form>>(key: K, value: NonNullable<typeof form>[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateLineItem(idx: number, updates: Partial<OneOffLineItem>) {
    setForm((prev) => {
      if (!prev) return prev;
      const items = prev.lineItems.map((it, i) => (i === idx ? { ...it, ...updates } : it));
      return { ...prev, lineItems: items };
    });
  }

  async function saveJob() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch('/api/oneoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: form.brand,
          locNumber: form.locNumber,
          storeName: form.storeName || undefined,
          address: form.address,
          suite: form.suite || undefined,
          city: form.city,
          state: form.state,
          zip: form.zip || undefined,
          woNumber: form.woNumber,
          clientPO: form.clientPO || undefined,
          orderType: form.orderType || undefined,
          serviceDescription: form.serviceDescription || undefined,
          requesterName: form.requesterName || undefined,
          requesterEmail: form.requesterEmail || undefined,
          serviceDate: form.serviceDate,
          serviceTime: form.serviceTime || undefined,
          photosEmail: form.photosEmail || undefined,
          lineItems: form.lineItems.filter((it) => it.description),
          status: 'scheduled',
        }),
      });
      const data = await res.json();
      if (data.success && data.job) {
        router.push(`/oneoff/${data.job.id}`);
      } else {
        setParseError(data.error || 'Failed to save job.');
        setSaving(false);
      }
    } catch {
      setParseError('Failed to save job.');
      setSaving(false);
    }
  }

  const total = form ? form.lineItems.reduce((s, it) => s + (Number(it.price) || 0), 0) : 0;
  const canSave = form && form.brand && form.woNumber && form.serviceDate && form.address;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">One-Off Superclean Jobs</h1>
        <p className="text-gray-400 text-sm mt-1">
          Upload a Superclean Vendor PO (sign-off sheet PDF) to create a one-time job — photos, invoice, work order, and both emails.
        </p>
      </div>

      {/* Upload zone */}
      {!form && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-[#00A4C7] bg-[#00A4C7]/5' : 'border-[#374151] hover:border-[#00A4C7]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = '';
            }}
          />
          <p className="text-white font-medium">{parsing ? 'Reading Vendor PO…' : 'Drop the Vendor PO PDF here'}</p>
          <p className="text-gray-500 text-sm mt-1">or click to browse</p>
        </div>
      )}

      {parseError && <p className="text-yellow-400 text-sm">{parseError}</p>}

      {/* Review form */}
      {form && (
        <div className="bg-[#111827] rounded-lg border border-[#1f2937] p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Review Parsed Work Order</h2>
            <button onClick={() => { setForm(null); setParseError(''); }} className="text-gray-400 text-sm hover:text-white">
              ✕ Start over
            </button>
          </div>
          <p className="text-gray-500 text-xs -mt-3">Check every field against the PO — parsing is best-effort. All fields stay editable on the job page too.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Brand *" value={form.brand} onChange={(v) => setField('brand', v)} placeholder="Cava" />
            <Field label="Loc #" value={form.locNumber} onChange={(v) => setField('locNumber', v)} placeholder="010614" />
            <Field label="Store Name" value={form.storeName} onChange={(v) => setField('storeName', v)} placeholder="Bolingbrook East" />
            <Field label="Vendor PO / WO # *" value={form.woNumber} onChange={(v) => setField('woNumber', v)} placeholder="2035528-02" />
            <Field label="Client PO / Tracking #" value={form.clientPO} onChange={(v) => setField('clientPO', v)} />
            <Field label="Order Type" value={form.orderType} onChange={(v) => setField('orderType', v)} />
            <Field label="Service Date *" type="date" value={form.serviceDate} onChange={(v) => setField('serviceDate', v)} />
            <Field label="Service Time" value={form.serviceTime} onChange={(v) => setField('serviceTime', v)} placeholder="10:00 PM" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <Field label="Street Address *" value={form.address} onChange={(v) => setField('address', v)} />
            </div>
            <Field label="Suite" value={form.suite} onChange={(v) => setField('suite', v)} />
            <Field label="City" value={form.city} onChange={(v) => setField('city', v)} />
            <Field label="State" value={form.state} onChange={(v) => setField('state', v)} />
            <Field label="Zip" value={form.zip} onChange={(v) => setField('zip', v)} />
            <Field label="Requester" value={form.requesterName} onChange={(v) => setField('requesterName', v)} />
            <Field label="Requester Email" value={form.requesterEmail} onChange={(v) => setField('requesterEmail', v)} />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Pictures Email (where the photos email goes)</label>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={form.photosEmail}
                onChange={(e) => setField('photosEmail', e.target.value)}
                placeholder="Enter manually, or use a quick-fill →"
                className="flex-1 min-w-[240px] bg-[#0a0f1a] border border-[#374151] rounded px-3 py-2 text-sm text-gray-100 focus:border-[#00A4C7] focus:outline-none"
              />
              {form.requesterEmail && (
                <button onClick={() => setField('photosEmail', form.requesterEmail)}
                  className="px-3 py-1.5 bg-[#374151] text-gray-300 rounded text-xs hover:bg-[#4b5563]">
                  Use requester
                </button>
              )}
              <button onClick={() => setField('photosEmail', 'starbucks@gosuperclean.com')}
                className="px-3 py-1.5 bg-[#374151] text-gray-300 rounded text-xs hover:bg-[#4b5563]">
                starbucks@gosuperclean.com
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Service Description (from PO — goes on invoice + work order)</label>
            <textarea
              value={form.serviceDescription}
              onChange={(e) => setField('serviceDescription', e.target.value)}
              rows={4}
              className="w-full bg-[#0a0f1a] border border-[#374151] rounded px-3 py-2 text-sm text-gray-100 focus:border-[#00A4C7] focus:outline-none"
            />
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-400">Invoice Line Items (one Vendor PO per invoice — Superclean rejects mixed WO numbers)</label>
              <button
                onClick={() => setForm((prev) => prev ? { ...prev, lineItems: [...prev.lineItems, { woRef: '', description: '', price: 0 }] } : prev)}
                className="text-[#00A4C7] text-xs hover:underline"
              >
                + Add line item
              </button>
            </div>
            <div className="space-y-2">
              {form.lineItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={item.woRef || ''}
                    onChange={(e) => updateLineItem(i, { woRef: e.target.value })}
                    placeholder="WO ref (e.g. 2035528-02)"
                    className="w-44 bg-[#0a0f1a] border border-[#374151] rounded px-3 py-2 text-sm text-gray-100"
                  />
                  <input
                    value={item.description}
                    onChange={(e) => updateLineItem(i, { description: e.target.value })}
                    placeholder="Description (e.g. Pressure Washing, Awning)"
                    className="flex-1 bg-[#0a0f1a] border border-[#374151] rounded px-3 py-2 text-sm text-gray-100"
                  />
                  <div className="relative">
                    <span className="absolute left-2 top-2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      value={item.price || ''}
                      onChange={(e) => updateLineItem(i, { price: Number(e.target.value) })}
                      className="w-28 bg-[#0a0f1a] border border-[#374151] rounded pl-6 pr-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                  {form.lineItems.length > 1 && (
                    <button
                      onClick={() => setForm((prev) => prev ? { ...prev, lineItems: prev.lineItems.filter((_, j) => j !== i) } : prev)}
                      className="text-red-400 hover:text-red-300 px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-right text-sm text-white mt-2">Total: <span className="font-semibold">${total.toFixed(2)}</span></p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#1f2937]">
            {!canSave && <p className="text-yellow-400 text-xs">Brand, Vendor PO #, Service Date, and Address are required</p>}
            <button
              onClick={saveJob}
              disabled={!canSave || saving}
              className="ml-auto px-5 py-2.5 bg-[#00A4C7] text-white rounded text-sm font-semibold hover:bg-[#0090b0] transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Create One-Off Job'}
            </button>
          </div>
        </div>
      )}

      {/* Job list */}
      <div className="bg-[#111827] rounded-lg border border-[#1f2937] p-6">
        <h2 className="text-lg font-semibold text-white mb-4">One-Off Jobs</h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-gray-500 text-sm">No one-off jobs yet. Upload a Vendor PO above to create one.</p>
        ) : (
          <div className="space-y-2">
            {[...jobs].sort((a, b) => (b.serviceDate || '').localeCompare(a.serviceDate || '')).map((job) => {
              const docsSent = job.emailLogs?.some((l) => l.type === 'documents' && !l.test);
              const photosSent = job.emailLogs?.some((l) => l.type === 'photos' && !l.test);
              const needsDocs = job.status === 'completed' && !docsSent;
              const statusColors: Record<string, string> = {
                scheduled: 'bg-blue-500', 'in-progress': 'bg-yellow-500', completed: 'bg-green-500',
              };
              const totalPrice = (job.lineItems || []).reduce((s, it) => s + (it.price || 0), 0);
              return (
                <Link
                  key={job.id}
                  href={`/oneoff/${job.id}`}
                  className="flex items-center justify-between p-3 bg-[#0a0f1a] border border-[#374151] rounded hover:border-[#00A4C7] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColors[job.status]}`} />
                    <div>
                      <p className="text-white text-sm font-medium">
                        {job.brand} #{job.locNumber} <span className="text-gray-500">· WO# {job.woNumber}</span>
                      </p>
                      <p className="text-gray-500 text-xs">{job.address}, {job.city} · {job.serviceDate}{job.serviceTime ? ` ${job.serviceTime}` : ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-sm">${totalPrice.toFixed(2)}</p>
                    <div className="flex gap-2 justify-end text-xs mt-0.5">
                      {needsDocs && <span className="text-red-400 font-medium">⚠ Docs not sent (24-48h rule)</span>}
                      {docsSent && <span className="text-green-400">Docs ✓</span>}
                      {photosSent && <span className="text-green-400">Photos ✓</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0a0f1a] border border-[#374151] rounded px-3 py-2 text-sm text-gray-100 focus:border-[#00A4C7] focus:outline-none"
      />
    </div>
  );
}
