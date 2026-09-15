// Parses the text of a Superclean "SIGN OFF SHEET / VENDOR PO" PDF into
// one-off job fields. PDF text extraction order can vary, so parsing is
// regex-based over both the joined text and individual lines, rather than
// depending on strict line order. Every parsed field is user-editable in
// the review form, so best-effort extraction is acceptable.

export interface ParsedVendorPO {
  woNumber: string;
  brand: string;
  locNumber: string;
  storeName: string;
  address: string;
  suite: string;
  city: string;
  state: string;
  zip: string;
  clientPO: string;
  orderType: string;
  serviceDate: string; // YYYY-MM-DD
  serviceTime: string; // e.g. "10:00 PM"
  serviceDescription: string;
  requesterName: string;
  requesterEmail: string;
}

// Superclean's own addresses appear on the PO — never mistake them for the job site.
const SUPERCLEAN_ZIPS = new Set(['75355', '55121']);

export function parseVendorPO(lines: string[]): ParsedVendorPO {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  const text = cleaned.join('\n');

  const result: ParsedVendorPO = {
    woNumber: '', brand: '', locNumber: '', storeName: '',
    address: '', suite: '', city: '', state: '', zip: '',
    clientPO: '', orderType: '', serviceDate: '', serviceTime: '',
    serviceDescription: '', requesterName: '', requesterEmail: '',
  };

  // Vendor PO # — "VENDOR PO #" header followed by e.g. "2035528-02"
  const woMatch = text.match(/VENDOR\s*PO\s*#?\s*\n?\s*(\d{5,9}-\d{1,3})/i) || text.match(/\b(\d{6,9}-\d{2})\b/);
  if (woMatch) result.woNumber = woMatch[1];

  // Service date + time — "Service Date 9/15/26 10:00 PM"
  const dateMatch = text.match(/Service\s*Date\s*(\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+(\d{1,2}:\d{2}\s*[AP]M))?/i);
  if (dateMatch) {
    result.serviceDate = toISODate(dateMatch[1]);
    result.serviceTime = dateMatch[2] || '';
  }

  // Order type — "Order Type Pressure Washing"
  const orderMatch = text.match(/Order\s*Type\s+([A-Za-z][A-Za-z /&-]*)/);
  if (orderMatch) result.orderType = orderMatch[1].trim();

  // Client PO / Tracking #
  const clientPoMatch = text.match(/Client\s*PO\s*#?\s*\n?\s*(\d{6,})/i) || text.match(/Tracking\s*#\s*(\d{6,})/i);
  if (clientPoMatch) result.clientPO = clientPoMatch[1];
  else {
    // Layout quirk: the number can appear on the line BEFORE "Client PO #"
    const idx = cleaned.findIndex((l) => /Client\s*PO\s*#/i.test(l));
    if (idx > 0 && /^\d{6,}$/.test(cleaned[idx - 1])) result.clientPO = cleaned[idx - 1];
  }

  // Requester — first @gosuperclean.com address that isn't documents@
  const emails = text.match(/[A-Za-z0-9._%+-]+@gosuperclean\.com/gi) || [];
  const requester = emails.find((e) => !/^documents@/i.test(e));
  if (requester) {
    result.requesterEmail = requester;
    // "Briagh.Tunell@gosuperclean.com" → "Briagh Tunell"
    result.requesterName = requester.split('@')[0].replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Loc # + store name — "Bolingbrook East - Loc # 010614"
  const locMatch = text.match(/(?:^|\n)([^\n]*?)\s*-\s*Loc\s*#\s*([0-9A-Za-z-]+)/i);
  if (locMatch) {
    result.storeName = locMatch[1].trim();
    result.locNumber = locMatch[2];
  } else {
    const bareLoc = text.match(/Loc\s*#\s*([0-9A-Za-z-]+)/i);
    if (bareLoc) result.locNumber = bareLoc[1];
  }

  // Brand — line(s) after "SERVICE LOCATION": "Cava / Zoes Kitchen" then "Cava".
  // Prefer the shortest standalone brand line; fall back to SITE INSTRUCTIONS
  // pattern like "CAVA # 010614".
  const svcLocIdx = cleaned.findIndex((l) => /^SERVICE\s+LOCATION/i.test(l));
  if (svcLocIdx !== -1) {
    const candidates: string[] = [];
    for (let i = svcLocIdx + 1; i < Math.min(svcLocIdx + 5, cleaned.length); i++) {
      const l = cleaned[i];
      if (/^\d/.test(l)) break; // reached the street address
      if (/Loc\s*#/i.test(l) || /Client\s*PO/i.test(l)) break;
      candidates.push(l.split('/')[0].trim());
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.length - b.length);
      result.brand = candidates[0];
    }
  }
  if (!result.brand) {
    const siteMatch = text.match(/SITE\s+INSTRUCTIONS\s*\n\s*([A-Za-z][A-Za-z' ]+?)\s*#/i);
    if (siteMatch) result.brand = titleCase(siteMatch[1].trim());
  }

  // Street address / suite / city-state-zip — restrict to non-Superclean lines
  for (const line of cleaned) {
    if (!result.suite) {
      const suiteMatch = line.match(/^Suite\s*#?\s*(.+)$/i);
      if (suiteMatch) { result.suite = `Suite ${suiteMatch[1].trim()}`; continue; }
    }
    const cszMatch = line.match(/^([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/);
    if (cszMatch && !SUPERCLEAN_ZIPS.has(cszMatch[3])) {
      result.city = cszMatch[1].trim();
      result.state = cszMatch[2];
      result.zip = cszMatch[3];
      continue;
    }
    if (!result.address) {
      // Street line: starts with a number, not a PO Box or Superclean's own street
      if (/^\d+\s+[A-Za-z]/.test(line) && !/^1380\s+Corporate/i.test(line) && !/PO Box/i.test(line)
          && !/^\d{6,}$/.test(line) && !line.includes(',')) {
        result.address = line;
      }
    }
  }

  // Service description — between "SERVICE DESCRIPTION" and the sign-off area
  const descMatch = text.match(/SERVICE\s+DESCRIPTION\s*\n([\s\S]*?)(?:\n\s*(?:Store Manager|STORE STAMP|Print Name|Print Date|Time In)|$)/i);
  if (descMatch) {
    result.serviceDescription = descMatch[1].replace(/\s*\n\s*/g, ' ').trim();
  }

  return result;
}

function toISODate(mdy: string): string {
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return '';
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
