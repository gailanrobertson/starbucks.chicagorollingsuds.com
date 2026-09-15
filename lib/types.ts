export interface EmailLog {
  type: 'documents' | 'photos';
  to: string;
  subject: string;
  sentAt: string;
  test: boolean;
}

export interface Job {
  id: string;
  workizJobId?: string;
  storeNumber: string;
  woNumber?: string;
  invoiceNumber?: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
  storePhone?: string;
  price: number;
  serviceDate: string;
  nightNumber?: number;
  assignedTech?: string;
  status: 'scheduled' | 'in-progress' | 'completed';
  startTime?: string;
  stopTime?: string;
  emailLogs?: EmailLog[];
  createdAt: string;
  updatedAt: string;
}

export interface OneOffLineItem {
  /** Full WO reference for this line, e.g. "3820865-01" (optional) */
  woRef?: string;
  description: string;
  price: number;
}

export interface OneOffJob {
  id: string;
  /** Brand / chain name, e.g. "Cava" */
  brand: string;
  /** Client location number, e.g. "010614" */
  locNumber: string;
  /** Store name, e.g. "Bolingbrook East" */
  storeName?: string;
  address: string;
  suite?: string;
  city: string;
  state: string;
  zip?: string;
  /** Vendor PO # from the Superclean sign-off sheet, e.g. "2035528-02" */
  woNumber: string;
  /** Client PO / Tracking # */
  clientPO?: string;
  invoiceNumber?: string;
  orderType?: string;
  serviceDescription?: string;
  /** Superclean requester on the PO */
  requesterName?: string;
  requesterEmail?: string;
  serviceDate: string;
  /** Scheduled time from the PO, e.g. "10:00 PM" */
  serviceTime?: string;
  lineItems: OneOffLineItem[];
  assignedTech?: string;
  status: 'scheduled' | 'in-progress' | 'completed';
  startTime?: string;
  stopTime?: string;
  /** Manual CompanyCam project name override (fallback when address match fails) */
  ccProjectName?: string;
  /** Where the pictures email goes — manually entered per job */
  photosEmail?: string;
  emailLogs?: EmailLog[];
  createdAt: string;
  updatedAt: string;
}

export interface ParsedScheduleRow {
  night: number;
  date: string;
  store: string;
  storeNumber: string;
  address: string;
  city: string;
  state: string;
  price?: number;
}
