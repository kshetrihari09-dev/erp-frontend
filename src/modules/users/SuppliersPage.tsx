/**
 * SuppliersPage.tsx
 * Premium ERP Supplier Management Module
 * API: GET /parties?type=supplier  (existing endpoint — no backend changes)
 *
 * Drop-in replacement — preserves all existing CRUD routes & auth.
 */

import {
  useState, useMemo, useEffect, useRef, useCallback, memo
} from "react";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

/** Central fetch wrapper: attaches auth token, handles 401 globally */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── TYPES ───────────────────────────────────────────────────────────────────
/** Shape returned by GET /parties?type=supplier */
interface SupplierAPI {
  id: string;
  party_code?: string;
  code?: string;
  name: string;
  phone?: string;
  phone_number?: string;
  pan_no?: string;
  pan?: string;
  vat_no?: string;
  balance?: number;
  current_balance?: number;
  opening_balance?: number;
  is_active?: boolean;
  status?: string;
  last_transaction_date?: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  province?: string;
  credit_limit?: number;
  total_purchases?: number;
  joined_date?: string;
  created_at?: string;
  control_account_id?:   string;
  control_account_name?: string;
  control_account_code?: string;
}

/** Normalised internal shape */
interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string;
  pan: string;
  balance: number;
  status: "active" | "inactive" | "blocked" | "pending";
  lastTransaction: string;
  email: string;
  address: string;
  city: string;
  creditLimit: number;
  totalPurchases: number;
  joinedDate: string;
  controlAccountId:   string;
  controlAccountName: string;
  controlAccountCode: string;
}

/** Normalise API → internal */
function normalise(s: SupplierAPI): Supplier {
  const rawStatus = s.status ?? (s.is_active === false ? "inactive" : "active");
  const statusMap: Record<string, Supplier["status"]> = {
    active: "active", ACTIVE: "active",
    inactive: "inactive", INACTIVE: "inactive",
    blocked: "blocked", BLOCKED: "blocked",
    pending: "pending", PENDING: "pending",
  };
  return {
    id:             s.id,
    code:           s.party_code ?? s.code ?? "—",
    name:           s.name,
    phone:          s.phone ?? s.phone_number ?? "—",
    pan:            s.pan_no ?? s.pan ?? s.vat_no ?? "—",
    balance:        Number(s.balance ?? s.current_balance ?? s.opening_balance ?? 0),
    status:         statusMap[rawStatus] ?? "active",
    lastTransaction:s.last_transaction_date ?? "",
    email:          s.email ?? "",
    address:        s.address ?? "",
    city:           s.city ?? s.district ?? s.province ?? "",
    creditLimit:    Number(s.credit_limit ?? 0),
    totalPurchases: Number(s.total_purchases ?? 0),
    joinedDate:         s.joined_date ?? s.created_at?.slice(0, 10) ?? "",
    controlAccountId:   s.control_account_id   ?? "",
    controlAccountName: s.control_account_name ?? "",
    controlAccountCode: s.control_account_code ?? "",
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmtCurrency = (n: number) =>
  (n < 0 ? "− " : "") + "₨ " + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const AVATAR_COLORS = [
  "#2563EB","#7C3AED","#DB2777","#D97706",
  "#16A34A","#0891B2","#9333EA","#EA580C",
];
const avatarColor = (id: string) => {
  const n = id.replace(/\D/g, "").slice(-4);
  return AVATAR_COLORS[(parseInt(n || "0") % AVATAR_COLORS.length)];
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

const StatusBadge = memo(({ status }: { status: Supplier["status"] }) => {
  const cfg = {
    active:   { bg: "#F0FDF4", color: "#15803D", dot: "#16A34A", label: "Active" },
    inactive: { bg: "#F3F4F6", color: "#4B5563", dot: "#9CA3AF", label: "Inactive" },
    blocked:  { bg: "#FEF2F2", color: "#B91C1C", dot: "#DC2626", label: "Blocked" },
    pending:  { bg: "#FFFBEB", color: "#B45309", dot: "#F59E0B", label: "Pending" },
  }[status];
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, background:cfg.bg, color:cfg.color, padding:"3px 10px", borderRadius:999, fontSize:12, fontWeight:600, letterSpacing:".2px" }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:cfg.dot, flexShrink:0 }} />
      {cfg.label}
    </span>
  );
});

const BalanceCell = memo(({ value }: { value: number }) => {
  const color = value > 0 ? "#D97706" : value < 0 ? "#DC2626" : "#16A34A";
  const bg    = value > 0 ? "#FFFBEB" : value < 0 ? "#FEF2F2" : "#F0FDF4";
  return (
    <span style={{ display:"inline-block", background:bg, color, padding:"2px 8px", borderRadius:6, fontSize:13, fontWeight:700, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap" }}>
      {value === 0 ? "₨ 0.00" : fmtCurrency(value)}
    </span>
  );
});

// ─── KPI CARD ────────────────────────────────────────────────────────────────
const KPICard = memo(({ icon, label, value, sub, bg }: {
  icon: string; label: string; value: string | number; sub: string; bg: string;
}) => {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, padding:"20px 22px", boxShadow: hov ? "0 8px 28px rgba(0,0,0,.10)" : "0 1px 4px rgba(0,0,0,.07)", transition:"transform .18s,box-shadow .18s", transform: hov ? "translateY(-3px)" : "none", cursor:"pointer" }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:11, fontWeight:600, color:"#6B7280", textTransform:"uppercase", letterSpacing:".6px", marginBottom:8 }}>{label}</p>
          <p style={{ fontSize:24, fontWeight:700, color:"#111827", letterSpacing:"-.5px", marginBottom:4 }}>{value}</p>
          <p style={{ fontSize:12, color:"#9CA3AF" }}>{sub}</p>
        </div>
        <div style={{ width:44, height:44, borderRadius:12, background:bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginLeft:12 }}>
          <span style={{ fontSize:22 }}>{icon}</span>
        </div>
      </div>
    </div>
  );
});

// ─── SKELETON ROW ────────────────────────────────────────────────────────────
const SkeletonRow = () => (
  <tr>
    {[44,80,220,140,120,110,90,120,70].map((w, i) => (
      <td key={i} style={{ padding:"14px", borderBottom:"1px solid #F3F4F6" }}>
        <div style={{ width:w, height:14, background:"#F3F4F6", borderRadius:6, animation:"pulse 1.4s ease-in-out infinite" }} />
      </td>
    ))}
  </tr>
);

// ─── ACTION MENU ─────────────────────────────────────────────────────────────
const ActionMenu = memo(({ supplier, onView, onEdit, onLedger, onDelete }: {
  supplier: Supplier;
  onView:   (s: Supplier) => void;
  onEdit:   (s: Supplier) => void;
  onLedger: (s: Supplier) => void;
  onDelete: (s: Supplier) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const items: Array<{ icon:string; label:string; action:()=>void; danger?:boolean } | { divider:true }> = [
    { icon:"👁",  label:"View Supplier",     action:() => { onView(supplier);   setOpen(false); } },
    { icon:"✏️", label:"Edit Supplier",     action:() => { onEdit(supplier);   setOpen(false); } },
    { icon:"📊", label:"Open Ledger",       action:() => { onLedger(supplier); setOpen(false); } },
    { icon:"📋", label:"View Transactions", action:() => { onView(supplier);   setOpen(false); } },
    { icon:"🖨",  label:"Print Statement",  action:() => { window.print();     setOpen(false); } },
    { divider: true },
    { icon:"🗑",  label:"Delete Supplier",  action:() => { onDelete(supplier); setOpen(false); }, danger:true },
  ];
  return (
    <div ref={ref} style={{ position:"relative", display:"inline-block" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:32, height:32, borderRadius:7, border:"1px solid #E5E7EB", background: open ? "#F3F4F6" : "#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:"#6B7280", transition:".12s" }}>⋮</button>
      {open && (
        <div style={{ position:"absolute", right:0, top:"calc(100% + 4px)", background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,.12)", minWidth:200, zIndex:200, padding:6 }}>
          {items.map((item, i) =>
            "divider" in item ? (
              <div key={i} style={{ height:1, background:"#F3F4F6", margin:"4px 0" }} />
            ) : (
              <button key={i} onClick={item.action}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:7, border:"none", background:"transparent", cursor:"pointer", fontSize:13, color: item.danger ? "#DC2626" : "#374151", textAlign:"left", transition:".1s", fontFamily:"inherit" }}
                onMouseEnter={e => (e.currentTarget.style.background = item.danger ? "#FEF2F2" : "#F8FAFC")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <span style={{ fontSize:15 }}>{item.icon}</span>{item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
});

// ─── SUPPLIER DRAWER ─────────────────────────────────────────────────────────
const SupplierDrawer = memo(({ supplier, onClose, onEdit, onLedger }: {
  supplier: Supplier | null;
  onClose:  () => void;
  onEdit:   (s: Supplier) => void;
  onLedger: (s: Supplier) => void;
}) => {
  if (!supplier) return null;
  const color = avatarColor(supplier.id);
  const rows: { icon:string; label:string; value:string; accent?: boolean }[] = [
    { icon:"🏦", label:"Control Account",  value: supplier.controlAccountName || "Company default (Sundry Creditors)", accent: !!supplier.controlAccountName },
    { icon:"📞", label:"Phone",           value: supplier.phone || "—" },
    { icon:"📧", label:"Email",           value: supplier.email || "—" },
    { icon:"🪪", label:"PAN / VAT",       value: supplier.pan   || "—" },
    { icon:"📍", label:"Address",         value: [supplier.address, supplier.city].filter(Boolean).join(", ") || "—" },
    { icon:"📅", label:"Joined Date",     value: supplier.joinedDate || "—" },
    { icon:"💳", label:"Credit Limit",    value: supplier.creditLimit ? fmtCurrency(supplier.creditLimit) : "—" },
    { icon:"🛒", label:"Total Purchases", value: supplier.totalPurchases ? fmtCurrency(supplier.totalPurchases) : "—" },
    { icon:"🕐", label:"Last Transaction",value: supplier.lastTransaction || "—" },
  ];
  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", zIndex:300 }} />
      <div style={{ position:"fixed", top:0, right:0, height:"100%", width:420, background:"#fff", zIndex:400, boxShadow:"-4px 0 32px rgba(0,0,0,.12)", display:"flex", flexDirection:"column", overflowY:"auto" }}>
        {/* Header */}
        <div style={{ padding:"24px 24px 20px", borderBottom:"1px solid #F3F4F6", background:"#FAFAFA" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
            <span style={{ fontSize:12, color:"#9CA3AF", fontWeight:600, textTransform:"uppercase", letterSpacing:".6px" }}>Supplier Profile</span>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#6B7280" }}>×</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ width:60, height:60, borderRadius:16, background:color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:22, color:"#fff", flexShrink:0, boxShadow:`0 4px 14px ${color}55` }}>
              {initials(supplier.name)}
            </div>
            <div>
              <div style={{ fontSize:17, fontWeight:700, color:"#111827", lineHeight:1.3 }}>{supplier.name}</div>
              <div style={{ fontSize:12, color:"#6B7280", marginTop:3 }}>{supplier.code}</div>
              <div style={{ marginTop:6 }}><StatusBadge status={supplier.status} /></div>
            </div>
          </div>
        </div>

        {/* Balance card */}
        <div style={{ padding:"20px 24px 0" }}>
          <div style={{ background: supplier.balance > 0 ? "#FFFBEB" : supplier.balance < 0 ? "#FEF2F2" : "#F0FDF4", border:`1px solid ${supplier.balance > 0 ? "#FDE68A" : supplier.balance < 0 ? "#FECACA" : "#BBF7D0"}`, borderRadius:12, padding:"16px 20px", marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#6B7280", textTransform:"uppercase", letterSpacing:".5px", marginBottom:4 }}>Current Balance</div>
            <div style={{ fontSize:26, fontWeight:700, color: supplier.balance > 0 ? "#B45309" : supplier.balance < 0 ? "#B91C1C" : "#15803D", letterSpacing:"-.5px" }}>
              {supplier.balance === 0 ? "₨ 0.00" : fmtCurrency(supplier.balance)}
            </div>
            <div style={{ fontSize:12, color:"#9CA3AF", marginTop:4 }}>
              {supplier.balance > 0 ? "Outstanding payable" : supplier.balance < 0 ? "Advance / overpaid" : "Settled — no outstanding"}
            </div>
          </div>

          {/* Details */}
          {rows.map(r => (
            <div key={r.label} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"10px 0", borderBottom:"1px solid #F3F4F6" }}>
              <span style={{ fontSize:15, marginTop:1 }}>{r.icon}</span>
              <div>
                <div style={{ fontSize:11, color:"#9CA3AF", fontWeight:600, textTransform:"uppercase", letterSpacing:".4px" }}>{r.label}</div>
                <div style={{ fontSize:14, color: r.accent ? "#1D4ED8" : "#1F2937", fontWeight: r.accent ? 600 : 500, marginTop:2 }}>{r.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding:"16px 24px", borderTop:"1px solid #F3F4F6", display:"flex", gap:8, marginTop:"auto" }}>
          <button onClick={() => onLedger(supplier)} style={{ flex:1, height:38, background:"#2563EB", color:"#fff", border:"none", borderRadius:9, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            Open Ledger
          </button>
          <button onClick={() => onEdit(supplier)} style={{ flex:1, height:38, background:"#fff", color:"#374151", border:"1px solid #E5E7EB", borderRadius:9, fontWeight:500, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            Edit Details
          </button>
        </div>
      </div>
    </>
  );
});

// ─── ANALYTICS BAR ───────────────────────────────────────────────────────────
const AnalyticsBar = memo(({ suppliers }: { suppliers: Supplier[] }) => {
  const top5 = useMemo(() =>
    [...suppliers].filter(s => s.totalPurchases > 0)
      .sort((a, b) => b.totalPurchases - a.totalPurchases).slice(0, 5),
    [suppliers]
  );
  const max = top5[0]?.totalPurchases || 1;
  if (top5.length === 0) return (
    <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, padding:"22px 24px", display:"flex", alignItems:"center", justifyContent:"center", color:"#9CA3AF", fontSize:13 }}>
      No purchase data available
    </div>
  );
  return (
    <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, padding:"22px 24px", boxShadow:"0 1px 4px rgba(0,0,0,.07)" }}>
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:14, fontWeight:600, color:"#111827" }}>Top Suppliers by Purchase</div>
        <div style={{ fontSize:12, color:"#9CA3AF", marginTop:2 }}>Ranked by total purchase volume</div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
        {top5.map(s => {
          const pct = (s.totalPurchases / max) * 100;
          const color = avatarColor(s.id);
          return (
            <div key={s.id}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                <span style={{ fontSize:12, fontWeight:500, color:"#374151" }}>{s.name.split(" ").slice(0, 3).join(" ")}</span>
                <span style={{ fontSize:12, fontWeight:700, color:"#111827" }}>
                  ₨ {(s.totalPurchases / 1000).toFixed(0)}K
                </span>
              </div>
              <div style={{ height:8, background:"#F3F4F6", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:99, transition:"width .8s ease" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── DELETE MODAL ────────────────────────────────────────────────────────────
const DeleteModal = ({ supplier, onCancel, onConfirm, deleting }: {
  supplier: Supplier; onCancel:()=>void; onConfirm:()=>void; deleting:boolean;
}) => (
  <>
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:500 }} />
    <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"#fff", borderRadius:16, padding:28, width:380, zIndex:600, boxShadow:"0 20px 60px rgba(0,0,0,.2)" }}>
      <div style={{ fontSize:36, marginBottom:12, textAlign:"center" }}>⚠️</div>
      <h3 style={{ fontSize:16, fontWeight:700, color:"#111827", marginBottom:8, textAlign:"center" }}>Delete Supplier?</h3>
      <p style={{ fontSize:13, color:"#6B7280", textAlign:"center", lineHeight:1.6, marginBottom:20 }}>
        Are you sure you want to delete <strong>{supplier.name}</strong>? This action cannot be undone.
      </p>
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={onCancel} disabled={deleting} style={{ flex:1, height:38, background:"#fff", color:"#374151", border:"1px solid #E5E7EB", borderRadius:9, fontWeight:500, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
        <button onClick={onConfirm} disabled={deleting} style={{ flex:1, height:38, background:"#DC2626", color:"#fff", border:"none", borderRadius:9, fontWeight:600, fontSize:13, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? .7 : 1, fontFamily:"inherit" }}>
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  </>
);

// ─── TOAST ────────────────────────────────────────────────────────────────────
const Toast = ({ msg, type, onClose }: { msg:string; type:"success"|"error"; onClose:()=>void }) => (
  <div style={{ position:"fixed", bottom:28, right:28, zIndex:700, background: type === "success" ? "#15803D" : "#B91C1C", color:"#fff", padding:"12px 20px", borderRadius:10, fontSize:13, fontWeight:500, boxShadow:"0 8px 24px rgba(0,0,0,.2)", display:"flex", alignItems:"center", gap:10, maxWidth:340 }}>
    <span style={{ fontSize:16 }}>{type === "success" ? "✓" : "✕"}</span>
    {msg}
    <button onClick={onClose} style={{ background:"transparent", border:"none", color:"rgba(255,255,255,.8)", cursor:"pointer", fontSize:16, padding:0, marginLeft:4 }}>×</button>
  </div>
);

// ─── SORT ICON ────────────────────────────────────────────────────────────────
const SortIcon = ({ col, sortBy, sortDir }: { col:string; sortBy:string; sortDir:"asc"|"desc" }) => (
  <span style={{ fontSize:10, marginLeft:4, opacity: sortBy === col ? 1 : .3, color: sortBy === col ? "#2563EB" : "#9CA3AF" }}>
    {sortBy === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
  </span>
);

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SuppliersPage() {
  // ── API state ──
  const [suppliers, setSuppliers]       = useState<Supplier[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [toast, setToast]               = useState<{ msg:string; type:"success"|"error" } | null>(null);

  // ── UI state ──
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("");
  const [sortBy, setSortBy]             = useState("name");
  const [sortDir, setSortDir]           = useState<"asc"|"desc">("asc");
  const [page, setPage]                 = useState(1);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [drawer, setDrawer]             = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const perPage = 15;

  // ── Fetch suppliers ────────────────────────────────────────────────────────
  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Tries the most common party-list endpoint shapes.
      // Adjust the path to match your actual route if different.
      const data = await apiFetch<SupplierAPI[] | { data: SupplierAPI[] } | { parties: SupplierAPI[] } | { suppliers: SupplierAPI[] }>(
        "/parties/suppliers?limit=500"
      );
      // Handle various response envelope shapes
      const raw: SupplierAPI[] =
        Array.isArray(data)           ? data :
        "data"      in data           ? (data as any).data :
        "parties"   in data           ? (data as any).parties :
        "suppliers" in data           ? (data as any).suppliers :
        [];
      setSuppliers(raw.map(normalise));
    } catch (err: any) {
      setError(err.message ?? "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/parties/${deleteTarget.id}`, { method: "DELETE" });
      setSuppliers(prev => prev.filter(s => s.id !== deleteTarget.id));
      setToast({ msg: `${deleteTarget.name} deleted successfully.`, type: "success" });
    } catch (err: any) {
      setToast({ msg: err.message ?? "Delete failed. Please try again.", type: "error" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  // ── Navigate to ledger / edit (adapt paths to your router) ────────────────
  const handleLedger = useCallback((s: Supplier) => {
    window.location.href = `/finance/ledger?party=${s.id}`;
  }, []);
  const handleEdit = useCallback((s: Supplier) => {
    window.location.href = `/parties/suppliers/${s.id}/edit`;
  }, []);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => ({
    total:    suppliers.length,
    active:   suppliers.filter(s => s.status === "active").length,
    payables: suppliers.filter(s => s.balance > 0).reduce((sum, s) => sum + s.balance, 0),
    recent:   suppliers.filter(s => s.lastTransaction >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).length,
  }), [suppliers]);

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let data = suppliers.filter(s => {
      if (q && ![s.name, s.code, s.phone, s.pan, s.email].some(v => v.toLowerCase().includes(q))) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (balanceFilter === "outstanding" && s.balance <= 0) return false;
      if (balanceFilter === "settled"     && s.balance !== 0) return false;
      if (balanceFilter === "overpaid"    && s.balance >= 0) return false;
      return true;
    });
    return [...data].sort((a, b) => {
      const cmp =
        sortBy === "name"    ? a.name.localeCompare(b.name) :
        sortBy === "code"    ? a.code.localeCompare(b.code) :
        sortBy === "balance" ? a.balance - b.balance :
        sortBy === "date"    ? a.lastTransaction.localeCompare(b.lastTransaction) : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [suppliers, search, statusFilter, balanceFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSort = useCallback((col: string) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  }, [sortBy]);

  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const toggleAll = useCallback(() => {
    setSelected(prev => prev.size === paged.length ? new Set() : new Set(paged.map(s => s.id)));
  }, [paged]);

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const rows = [
      ["Code","Name","Phone","PAN/VAT","Balance","Status","Last Transaction"],
      ...filtered.map(s => [s.code, s.name, s.phone, s.pan, s.balance.toString(), s.status, s.lastTransaction]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    a.download = `suppliers_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }, [filtered]);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const S = {
    page:       { minHeight:"100vh", background:"#F8FAFC", fontFamily:"'Inter',-apple-system,sans-serif", color:"#111827", fontSize:14, lineHeight:"1.5" } as React.CSSProperties,
    card:       { background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, boxShadow:"0 1px 4px rgba(0,0,0,.07)" } as React.CSSProperties,
    th:         { padding:"11px 14px", fontSize:11, fontWeight:600, color:"#6B7280", textTransform:"uppercase" as const, letterSpacing:".5px", textAlign:"left" as const, whiteSpace:"nowrap" as const, background:"#FAFAFA", userSelect:"none" as const, cursor:"pointer", borderBottom:"1px solid #E5E7EB" },
    td:         { padding:"13px 14px", fontSize:13, color:"#374151", borderBottom:"1px solid #F3F4F6", whiteSpace:"nowrap" as const, verticalAlign:"middle" as const },
    input:      { height:38, borderRadius:9, border:"1px solid #D1D5DB", padding:"0 12px", fontSize:13, fontFamily:"inherit", color:"#111827", background:"#fff", outline:"none", boxSizing:"border-box" as const, transition:".15s" },
    btnPrimary: { height:38, padding:"0 20px", background:"linear-gradient(135deg,#2563EB,#1D4ED8)", color:"#fff", border:"none", borderRadius:9, fontWeight:600, fontSize:13, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:7, boxShadow:"0 2px 8px rgba(37,99,235,.3)", transition:".15s", fontFamily:"inherit" } as React.CSSProperties,
    btnOutline: { height:38, padding:"0 16px", background:"#fff", color:"#374151", border:"1px solid #D1D5DB", borderRadius:9, fontWeight:500, fontSize:13, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, transition:".15s", fontFamily:"inherit" } as React.CSSProperties,
  };

  const selectStyle = { ...S.input, paddingRight:32, backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 10px center", appearance:"none" as const };

  return (
    <div style={S.page}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes spin  { to{transform:rotate(360deg)} }
      `}</style>

      {/* TOP BAR */}
      <header style={{ height:56, background:"#fff", borderBottom:"1px solid #E5E7EB", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px", position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:32, height:32, background:"#2563EB", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:14, color:"#fff" }}>M</div>
          <span style={{ fontWeight:700, fontSize:15, color:"#111827", letterSpacing:"-.2px" }}>MediERP</span>
          <span style={{ color:"#E5E7EB", fontSize:18 }}>|</span>
          <span style={{ fontSize:13, color:"#6B7280" }}>Supplier Management</span>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button onClick={fetchSuppliers} disabled={loading}
            style={{ width:34, height:34, borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:"#6B7280" }}
            title="Refresh">
            <span style={{ display:"inline-block", animation: loading ? "spin 1s linear infinite" : "none" }}>↻</span>
          </button>
          <div style={{ width:34, height:34, borderRadius:"50%", background:"linear-gradient(135deg,#7C3AED,#2563EB)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, color:"#fff" }}>AM</div>
        </div>
      </header>

      <main style={{ maxWidth:1400, margin:"0 auto", padding:"0 28px 40px" }}>

        {/* BREADCRUMB + HEADER */}
        <div style={{ padding:"24px 0 20px" }}>
          <nav style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#9CA3AF", marginBottom:8 }}>
            <a href="/parties" style={{ color:"#9CA3AF", textDecoration:"none" }}>Parties</a>
            <span>›</span>
            <span style={{ color:"#374151", fontWeight:500 }}>Suppliers</span>
          </nav>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <h1 style={{ fontSize:26, fontWeight:800, color:"#0F172A", letterSpacing:"-.4px", margin:0 }}>Suppliers</h1>
              <p style={{ fontSize:13, color:"#6B7280", marginTop:4 }}>Manage supplier information, balances, and transactions.</p>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {selected.size > 0 && (
                <span style={{ fontSize:12, color:"#2563EB", fontWeight:600, background:"#EFF6FF", padding:"4px 12px", borderRadius:7, border:"1px solid #BFDBFE" }}>
                  {selected.size} selected
                </span>
              )}
              <button onClick={exportCSV} style={S.btnOutline}>📥 Export CSV</button>
              <button onClick={() => window.location.href = "/parties/suppliers/new"} style={S.btnPrimary}>
                <span style={{ fontSize:16, lineHeight:1 }}>+</span> New Supplier
              </button>
            </div>
          </div>
        </div>

        {/* ERROR BANNER */}
        {error && (
          <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:12, padding:"14px 20px", marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:18 }}>⚠️</span>
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"#B91C1C" }}>Failed to load suppliers</div>
                <div style={{ fontSize:12, color:"#DC2626", marginTop:2 }}>{error}</div>
              </div>
            </div>
            <button onClick={fetchSuppliers} style={{ ...S.btnOutline, borderColor:"#FECACA", color:"#B91C1C", height:32, fontSize:12 }}>Retry</button>
          </div>
        )}

        {/* KPI CARDS */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:16, marginBottom:24 }}>
          <KPICard icon="🏢" label="Total Suppliers"     value={loading ? "…" : kpi.total}                                  sub={loading ? "Loading…" : `${kpi.active} active, ${kpi.total - kpi.active} others`}                  bg="#EFF6FF" />
          <KPICard icon="✅" label="Active Suppliers"    value={loading ? "…" : kpi.active}                                 sub={loading ? "" : `${kpi.total ? Math.round((kpi.active/kpi.total)*100) : 0}% of total suppliers`}  bg="#F0FDF4" />
          <KPICard icon="💰" label="Outstanding Payables" value={loading ? "…" : `₨ ${(kpi.payables/1000).toFixed(0)}K`}   sub={loading ? "" : `${suppliers.filter(s=>s.balance>0).length} suppliers with open balance`}            bg="#FFFBEB" />
          <KPICard icon="🔄" label="Recent Transactions"  value={loading ? "…" : kpi.recent}                                sub="Transactions in last 30 days"                                                                    bg="#F5F3FF" />
        </div>

        {/* ANALYTICS + FILTER */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:20, marginBottom:24 }}>
          {/* FILTER CARD */}
          <div style={{ ...S.card, padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
              <span>🔍</span>
              <span style={{ fontSize:14, fontWeight:600, color:"#111827" }}>Search & Filter</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto auto", gap:10, marginBottom:14 }}>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", fontSize:14, color:"#9CA3AF" }}>🔍</span>
                <input type="text" placeholder="Search by name, code, phone, PAN…" value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  style={{ ...S.input, width:"100%", paddingLeft:34 }} />
              </div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ ...selectStyle, width:150 }}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blocked">Blocked</option>
                <option value="pending">Pending</option>
              </select>
              <select value={balanceFilter} onChange={e => { setBalanceFilter(e.target.value); setPage(1); }} style={{ ...selectStyle, width:165 }}>
                <option value="">All Balances</option>
                <option value="outstanding">Outstanding (Dr)</option>
                <option value="settled">Settled (Zero)</option>
                <option value="overpaid">Overpaid (Cr)</option>
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...selectStyle, width:145 }}>
                <option value="name">Sort: Name</option>
                <option value="code">Sort: Code</option>
                <option value="balance">Sort: Balance</option>
                <option value="date">Sort: Last Txn</option>
              </select>
            </div>
            <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ display:"flex", gap:6 }}>
                {(["all","active","inactive","blocked","pending"] as const).map(f => {
                  const val = f === "all" ? "" : f;
                  const active = statusFilter === val;
                  return (
                    <button key={f} onClick={() => { setStatusFilter(val); setPage(1); }}
                      style={{ height:28, padding:"0 12px", borderRadius:6, border:`1px solid ${active ? "#2563EB" : "#E5E7EB"}`, background: active ? "#EFF6FF" : "#fff", color: active ? "#2563EB" : "#6B7280", fontSize:12, fontWeight:500, cursor:"pointer", textTransform:"capitalize", fontFamily:"inherit", transition:".1s" }}>
                      {f === "all" ? "All" : f.charAt(0).toUpperCase()+f.slice(1)}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                <button onClick={() => { setSearch(""); setStatusFilter(""); setBalanceFilter(""); setSortBy("name"); setSortDir("asc"); setPage(1); }}
                  style={{ ...S.btnOutline, height:32, padding:"0 12px", fontSize:12 }}>↺ Reset</button>
                <button onClick={exportCSV} style={{ ...S.btnOutline, height:32, padding:"0 12px", fontSize:12 }}>📥 Export</button>
              </div>
            </div>
          </div>

          {/* ANALYTICS */}
          <AnalyticsBar suppliers={suppliers} />
        </div>

        {/* TABLE */}
        <div style={S.card}>
          {/* Toolbar */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:"1px solid #F3F4F6", flexWrap:"wrap", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:15, fontWeight:700, color:"#111827" }}>Supplier Directory</span>
              <span style={{ background:"#EFF6FF", color:"#2563EB", padding:"2px 9px", borderRadius:7, fontSize:12, fontWeight:600 }}>
                {loading ? "…" : `${filtered.length} results`}
              </span>
              {loading && <span style={{ fontSize:12, color:"#9CA3AF", display:"flex", alignItems:"center", gap:5 }}><span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>⟳</span> Loading…</span>}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={fetchSuppliers} style={{ ...S.btnOutline, height:32, padding:"0 12px", fontSize:12 }}>🔃 Refresh</button>
            </div>
          </div>

          <div style={{ overflowX:"auto" }}>
            {!loading && filtered.length === 0 ? (
              /* EMPTY STATE */
              <div style={{ padding:"60px 20px", textAlign:"center" }}>
                <div style={{ fontSize:52, marginBottom:12 }}>🏢</div>
                <div style={{ fontSize:16, fontWeight:600, color:"#374151", marginBottom:6 }}>
                  {search || statusFilter || balanceFilter ? "No suppliers match your filters" : "No suppliers found"}
                </div>
                <div style={{ fontSize:13, color:"#9CA3AF", marginBottom:20 }}>
                  {search || statusFilter || balanceFilter ? "Try adjusting your search or filter criteria" : "Get started by adding your first supplier"}
                </div>
                {search || statusFilter || balanceFilter ? (
                  <button onClick={() => { setSearch(""); setStatusFilter(""); setBalanceFilter(""); }} style={{ ...S.btnOutline }}>Clear Filters</button>
                ) : (
                  <button onClick={() => window.location.href = "/parties/suppliers/new"} style={S.btnPrimary}>
                    + Create First Supplier
                  </button>
                )}
              </div>
            ) : (
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, width:44 }}>
                      <input type="checkbox" checked={!loading && selected.size === paged.length && paged.length > 0} onChange={toggleAll} style={{ cursor:"pointer" }} />
                    </th>
                    <th style={S.th} onClick={() => toggleSort("code")}>Code <SortIcon col="code" sortBy={sortBy} sortDir={sortDir} /></th>
                    <th style={S.th} onClick={() => toggleSort("name")}>Supplier Name <SortIcon col="name" sortBy={sortBy} sortDir={sortDir} /></th>
                    <th style={S.th}>Phone</th>
                    <th style={S.th}>PAN / VAT</th>
                    <th style={{ ...S.th, textAlign:"right" }} onClick={() => toggleSort("balance")}>Balance <SortIcon col="balance" sortBy={sortBy} sortDir={sortDir} /></th>
                    <th style={S.th}>Control Account</th>
                    <th style={S.th}>Status</th>
                    <th style={S.th} onClick={() => toggleSort("date")}>Last Transaction <SortIcon col="date" sortBy={sortBy} sortDir={sortDir} /></th>
                    <th style={{ ...S.th, textAlign:"center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                    : paged.map((s, i) => {
                        const isSelected = selected.has(s.id);
                        const color = avatarColor(s.id);
                        return (
                          <tr key={s.id}
                            style={{ background: isSelected ? "#EFF6FF" : i % 2 === 1 ? "#FAFAFA" : "#fff", transition:".1s" }}
                            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#F1F5FF"; }}
                            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? "#FAFAFA" : "#fff"; }}>
                            <td style={{ ...S.td, width:44 }}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(s.id)} onClick={e => e.stopPropagation()} style={{ cursor:"pointer" }} />
                            </td>
                            <td style={S.td}>
                              <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#2563EB", background:"#EFF6FF", padding:"2px 8px", borderRadius:5 }}>{s.code}</span>
                            </td>
                            <td style={{ ...S.td, cursor:"pointer" }} onClick={() => setDrawer(s)}>
                              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                <div style={{ width:36, height:36, borderRadius:10, background:color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, color:"#fff", flexShrink:0 }}>
                                  {initials(s.name)}
                                </div>
                                <div>
                                  <div style={{ fontWeight:700, color:"#111827", fontSize:13 }}>{s.name}</div>
                                  <div style={{ fontSize:11, color:"#9CA3AF", marginTop:1 }}>{s.city || s.code}</div>
                                </div>
                              </div>
                            </td>
                            <td style={S.td}><a href={`tel:${s.phone}`} style={{ color:"#374151", textDecoration:"none" }}>{s.phone}</a></td>
                            <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#4B5563" }}>{s.pan}</td>
                            <td style={{ ...S.td, textAlign:"right" }}><BalanceCell value={s.balance} /></td>
                            <td style={S.td}>
                              {s.controlAccountName
                                ? <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:12, color:"#1D4ED8", background:"#EFF6FF", border:"1px solid #BFDBFE", padding:"2px 8px", borderRadius:6, fontWeight:600 }}>🏦 {s.controlAccountName}</span>
                                : <span style={{ fontSize:12, color:"#9CA3AF", fontStyle:"italic" }}>company default</span>
                              }
                            </td>
                            <td style={S.td}><StatusBadge status={s.status} /></td>
                            <td style={{ ...S.td, fontSize:12, color:"#6B7280", fontVariantNumeric:"tabular-nums" }}>{s.lastTransaction || "—"}</td>
                            <td style={{ ...S.td, textAlign:"center" }}>
                              <ActionMenu supplier={s} onView={setDrawer} onEdit={handleEdit} onLedger={handleLedger} onDelete={setDeleteTarget} />
                            </td>
                          </tr>
                        );
                      })
                  }
                </tbody>
              </table>
            )}
          </div>

          {/* PAGINATION */}
          {!loading && filtered.length > 0 && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderTop:"1px solid #F3F4F6", flexWrap:"wrap", gap:10 }}>
              <div style={{ fontSize:12, color:"#6B7280" }}>
                Showing <strong>{(page-1)*perPage+1}</strong>–<strong>{Math.min(page*perPage, filtered.length)}</strong> of <strong>{filtered.length}</strong> suppliers
              </div>
              <div style={{ display:"flex", gap:4 }}>
                <button disabled={page===1} onClick={() => setPage(p=>p-1)}
                  style={{ width:32, height:32, borderRadius:7, border:"1px solid #E5E7EB", background: page===1 ? "#F9FAFB" : "#fff", color: page===1 ? "#9CA3AF":"#374151", cursor: page===1 ? "not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, k) => k + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    style={{ width:32, height:32, borderRadius:7, border:`1px solid ${page===p ? "#2563EB":"#E5E7EB"}`, background: page===p ? "#2563EB":"#fff", color: page===p ? "#fff":"#374151", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight: page===p ? 600:400 }}>
                    {p}
                  </button>
                ))}
                {totalPages > 7 && <span style={{ display:"flex", alignItems:"center", padding:"0 4px", color:"#9CA3AF" }}>…</span>}
                <button disabled={page===totalPages} onClick={() => setPage(p=>p+1)}
                  style={{ width:32, height:32, borderRadius:7, border:"1px solid #E5E7EB", background: page===totalPages ? "#F9FAFB":"#fff", color: page===totalPages ? "#9CA3AF":"#374151", cursor: page===totalPages ? "not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* DRAWER */}
      <SupplierDrawer supplier={drawer} onClose={() => setDrawer(null)} onEdit={handleEdit} onLedger={handleLedger} />

      {/* DELETE MODAL */}
      {deleteTarget && <DeleteModal supplier={deleteTarget} onCancel={() => setDeleteTarget(null)} onConfirm={handleDelete} deleting={deleting} />}

      {/* TOAST */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}