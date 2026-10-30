"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { 
  ShieldCheck, LayoutDashboard, Receipt, CalendarClock, Users, 
  Fingerprint, UserCog, LogOut, ShieldAlert, Upload, Activity, 
  CheckCircle2, Search, Lock, Unlock, Mail, Phone, AlertTriangle, 
  RefreshCw, Eye, X, Cpu, Ban, Clock
} from "lucide-react";

interface AttackHistoryItem {
  id: number;
  attack_type: string;
  threat_score: string;
  layer: string;
  masked_payload: string;
  ip_address: string;
  timestamp: string;
}

interface Offender {
  patient_id: number;
  pid: string;
  full_name: string;
  username: string;
  email: string;
  contact_number: string;
  total_attacks: number;
  attacks_24h: number;
  threat_tier: "CRITICAL" | "WARNING" | "LOW";
  is_blocked: boolean;
  blocked_until: string | null;
  block_reason: string | null;
  last_attack_at: string;
  attack_history: AttackHistoryItem[];
}

interface SIEMSummary {
  total_blocked_attacks: number;
  critical_offenders_count: number;
  active_restrictions_count: number;
  gatekeeper_blocks: number;
  onnx_firewall_blocks: number;
}

export default function DigitalForensicsPage() {
  const router = useRouter();

  // 🟢 TAB NAVIGATION STATE ("steganography" | "ai_siem")
  const [activeTab, setActiveTab] = useState<"steganography" | "ai_siem">("steganography");

  // =========================================================
  // TAB 1 STATES: DOCUMENT STEGANOGRAPHY (EXISTING)
  // =========================================================
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  // =========================================================
  // TAB 2 STATES: ARABELLA AI FIREWALL SIEM & THREAT RESPONSE
  // =========================================================
  const [siemLoading, setSiemLoading] = useState(false);
  const [siemError, setSiemError] = useState("");
  const [summary, setSummary] = useState<SIEMSummary>({
    total_blocked_attacks: 0,
    critical_offenders_count: 0,
    active_restrictions_count: 0,
    gatekeeper_blocks: 0,
    onnx_firewall_blocks: 0,
  });
  const [offenders, setOffenders] = useState<Offender[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"ALL" | "CRITICAL" | "WARNING" | "LOW" | "BLOCKED">("ALL");

  // Drill-Down Inspector Modal States
  const [selectedOffender, setSelectedOffender] = useState<Offender | null>(null);
  const [banReasonInput, setBanReasonInput] = useState("Repeated AI Firewall policy violations");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // ---------------------------------------------------------
  // TAB 1 HANDLERS (STEGANOGRAPHY)
  // ---------------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setResult(null); 
      setError("");
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("medcare_token");
      const response = await axios.post("http://localhost:8000/admin/forensics/decrypt", formData, {
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "multipart/form-data" 
        }
      });
      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Forensic analysis failed. Invalid file or system error.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ---------------------------------------------------------
  // TAB 2 HANDLERS (AI FIREWALL SIEM & BAN CONTROL)
  // ---------------------------------------------------------
  const fetchSIEMTelemetry = async (preserveSelectedId?: number) => {
    setSiemLoading(true);
    setSiemError("");
    try {
      const token = localStorage.getItem("medcare_token");
      const response = await axios.get("http://localhost:8000/admin/forensics/ai-threats", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSummary(response.data.summary);
      const list: Offender[] = response.data.offenders || [];
      setOffenders(list);

      if (preserveSelectedId) {
        const updated = list.find((o) => o.patient_id === preserveSelectedId) || null;
        setSelectedOffender(updated);
      }
    } catch (err: any) {
      setSiemError(err.response?.data?.detail || "Failed to load AI Firewall SIEM telemetry.");
    } finally {
      setSiemLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "ai_siem") {
      fetchSIEMTelemetry();
    }
  }, [activeTab]);

  const handleManageBan = async (patientId: number, duration: "24h" | "1w" | "1m" | "permanent" | "unblock") => {
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const token = localStorage.getItem("medcare_token");
      const response = await axios.post(
        `http://localhost:8000/admin/forensics/ai-threats/${patientId}/ban`,
        {
          duration,
          reason: duration === "unblock" ? "Restriction revoked by Admin" : banReasonInput
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActionFeedback({ type: "success", message: response.data.message });
      await fetchSIEMTelemetry(patientId);
    } catch (err: any) {
      setActionFeedback({
        type: "error",
        message: err.response?.data?.detail || "Failed to update Arabella AI access restriction."
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("medcare_token");
    router.push("/login");
  };

  // Filter Offenders for Leaderboard
  const filteredOffenders = offenders.filter((o) => {
    const matchesSearch =
      o.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.pid.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (tierFilter === "CRITICAL") return o.threat_tier === "CRITICAL";
    if (tierFilter === "WARNING") return o.threat_tier === "WARNING";
    if (tierFilter === "LOW") return o.threat_tier === "LOW";
    if (tierFilter === "BLOCKED") return o.is_blocked;
    return true;
  });

  const totalBlocks = summary.total_blocked_attacks || 0;
  const onnxPercent = totalBlocks > 0 ? Math.round((summary.onnx_firewall_blocks / totalBlocks) * 100) : 0;
  const gkPercent = totalBlocks > 0 ? 100 - onnxPercent : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex font-sans overflow-hidden">
      
      {/* 🟢 ADMIN SIDEBAR */}
      <div className="w-72 bg-slate-950 border-r border-slate-800/60 flex flex-col justify-between hidden md:flex z-20 shadow-[4px_0_24px_rgba(0,0,0,0.4)]">
        <div>
          <div className="p-6 border-b border-slate-800/60 flex items-center gap-3 bg-slate-900/20">
            <ShieldCheck className="w-10 h-10 text-indigo-500 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
            <div>
              <h1 className="text-sm font-extrabold tracking-widest uppercase text-white leading-tight">MedCare<br/><span className="text-indigo-400 text-[10px]">Admin Console</span></h1>
            </div>
          </div>
          
          <div className="p-4 space-y-2 mt-4">
            <Link href="/admin" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <LayoutDashboard size={18} /> Command Center
            </Link>
            <Link href="/admin/billing" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <Receipt size={18} /> Automated Billing
            </Link>
            <Link href="/admin/schedule" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <CalendarClock size={18} /> Schedule & Ops
            </Link>
            <Link href="/admin/employees" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <Users size={18} /> Employee Management
            </Link>
            {/* Active Page */}
            <div className="w-full flex items-center gap-3 px-4 py-3 bg-red-900/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(220,38,38,0.1)] transition-all">
              <Fingerprint size={18} /> Digital Forensics
            </div>
            <Link href="/admin/security" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <UserCog size={18} /> Profile & Security
            </Link>
          </div>
        </div>
        <div className="p-4 border-t border-slate-800/60 bg-slate-900/20">
          <button onClick={handleLogout} className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-slate-900 hover:bg-red-950/40 border border-slate-800 hover:border-red-900/50 text-slate-400 hover:text-red-400 rounded-xl text-xs font-bold tracking-widest uppercase transition-all">
            <LogOut size={16} /> Secure Logout
          </button>
        </div>
      </div>

      {/* 🟢 MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto relative bg-slate-950">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
        
        <div className="p-8 md:p-10 max-w-6xl w-full mx-auto z-10">
          
          {/* HEADER & SUB-NAVIGATION TABS */}
          <div className="mb-8 border-b border-slate-800 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl font-light tracking-widest uppercase text-white mb-1">
                Digital <span className="font-bold text-red-500">Forensics</span>
              </h2>
              <p className="text-[10px] text-slate-400 tracking-widest uppercase font-mono">
                MILITARY-GRADE DATA LEAK TRACING & ARABELLA AI SIEM TELEMETRY
              </p>
            </div>

            {/* 🟢 DUAL TABS SWITCHER */}
            <div className="flex bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 shadow-lg shrink-0">
              <button
                onClick={() => setActiveTab("steganography")}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all ${
                  activeTab === "steganography"
                    ? "bg-red-600/20 text-red-400 border border-red-500/40 shadow-[0_0_15px_rgba(220,38,38,0.2)]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Fingerprint size={16} />
                Document Steganography
              </button>

              <button
                onClick={() => setActiveTab("ai_siem")}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase transition-all ${
                  activeTab === "ai_siem"
                    ? "bg-red-600/20 text-red-400 border border-red-500/40 shadow-[0_0_15px_rgba(220,38,38,0.2)]"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <ShieldAlert size={16} />
                Arabella AI Firewall SIEM
              </button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* TAB 1: DOCUMENT STEGANOGRAPHY (100% UNCHANGED LOGIC)      */}
          {/* ========================================================= */}
          {activeTab === "steganography" && (
            <div className="max-w-4xl mx-auto">
              {/* Upload Area */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8 shadow-2xl">
                <div
                  className="border-2 border-dashed border-slate-700 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:border-red-500 transition-colors bg-slate-950/50"
                  onClick={() => document.getElementById("fileInput")?.click()}
                >
                  <Upload size={40} className="text-slate-600 mb-4" />
                  <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Upload Leaked PNG Report</p>
                  <input id="fileInput" type="file" className="hidden" onChange={handleFileChange} accept="image/png" />
                  <p className="text-[10px] text-sky-400 mt-3 font-mono font-bold">{file ? file.name : "Click to select file"}</p>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={!file || analyzing}
                  className="w-full mt-6 py-4 bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-100 rounded-xl text-xs font-bold tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(220,38,38,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {analyzing ? (
                    <>
                      <Activity size={16} className="animate-spin" /> Running Decryption Algorithms...
                    </>
                  ) : (
                    <>
                      <Fingerprint size={16} /> Decrypt & Analyze Source
                    </>
                  )}
                </button>
              </div>

              {/* Results Area */}
              {error && (
                <div className="p-5 rounded-2xl border bg-slate-900 border-red-900/50 text-red-400 flex items-start gap-3 shadow-lg animate-fadeIn">
                  <ShieldAlert size={18} className="mt-0.5 shrink-0" />
                  <div className="text-xs font-mono leading-relaxed">{error}</div>
                </div>
              )}

              {result && (
                <div className="bg-slate-900 border-2 border-red-500/50 rounded-3xl p-8 shadow-[0_0_50px_rgba(220,38,38,0.15)] animate-fadeIn">
                  <div className="flex items-center gap-3 border-b border-slate-800 pb-5 mb-6">
                    <div className="w-10 h-10 bg-red-950/50 border border-red-900 rounded-full flex items-center justify-center shrink-0">
                      <CheckCircle2 size={20} className="text-red-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-red-500 uppercase tracking-widest mb-1">
                        Forensic Decryption Result
                      </h3>
                      <p className="text-[10px] text-slate-500 uppercase font-mono tracking-widest">
                        {result.status || "Leak Source Identified"}
                      </p>
                    </div>
                  </div>

                  {result.status === "CLEAN" ? (
                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-xs font-mono text-emerald-400">
                      {result.message}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 font-mono text-xs text-slate-300">
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Source IP Address</span>
                        <span className="text-white text-sm">{result.source_ip}</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Handler ID</span>
                        <span className="text-white text-sm">{result.handler_id}</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Handler Name</span>
                        <span className="text-white text-sm">{result.handler_name}</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold block mb-1">Timestamp</span>
                        <span className="text-white text-sm">{result.timestamp}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: ARABELLA AI FIREWALL SIEM & THREAT RESPONSE        */}
          {/* ========================================================= */}
          {activeTab === "ai_siem" && (
            <div className="space-y-8 animate-fadeIn">
              
              {/* 1. BI SUMMARY CARDS (4 CARDS) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Blocked Attacks</span>
                    <ShieldAlert size={18} className="text-red-400" />
                  </div>
                  <div className="text-3xl font-black text-white font-mono">{summary.total_blocked_attacks}</div>
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">Pre-LLM Intercepted Payloads</p>
                </div>

                <div className="bg-slate-900/90 border border-red-900/40 rounded-2xl p-6 shadow-[0_0_25px_rgba(220,38,38,0.08)]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Critical Offenders (Red)</span>
                    <AlertTriangle size={18} className="text-red-500" />
                  </div>
                  <div className="text-3xl font-black text-red-500 font-mono">{summary.critical_offenders_count}</div>
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">10+ Malicious Attempts</p>
                </div>

                <div className="bg-slate-900/90 border border-amber-900/40 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Active AI Restrictions</span>
                    <Lock size={18} className="text-amber-400" />
                  </div>
                  <div className="text-3xl font-black text-amber-400 font-mono">{summary.active_restrictions_count}</div>
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">Arabella Micro-Segmented Bans</p>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Firewall Defense Split</span>
                    <Cpu size={18} className="text-sky-400" />
                  </div>
                  <div className="flex justify-between text-xs font-mono font-bold text-slate-300 mb-2">
                    <span>ONNX: {summary.onnx_firewall_blocks} ({onnxPercent}%)</span>
                    <span>GK: {summary.gatekeeper_blocks} ({gkPercent}%)</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                    <div style={{ width: `${onnxPercent}%` }} className="bg-indigo-500 h-full transition-all" />
                    <div style={{ width: `${gkPercent}%` }} className="bg-sky-400 h-full transition-all" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">DistilBERT ONNX vs Regex Gatekeeper</p>
                </div>
              </div>

              {/* PRIVACY / DLP COMPLIANCE BANNER */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={20} className="text-emerald-400 shrink-0" />
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <span className="font-bold text-emerald-400 uppercase tracking-wider">HIPAA / GDPR Data Masking Active: </span>
                    Patient medical symptoms and PII inside blocked payloads are automatically redacted (<code className="text-sky-400 font-mono">[MEDICAL-REDACTED]</code>) before forensic logging.
                  </p>
                </div>
                <button
                  onClick={() => fetchSIEMTelemetry()}
                  disabled={siemLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shrink-0"
                >
                  <RefreshCw size={14} className={siemLoading ? "animate-spin" : ""} />
                  Refresh Telemetry
                </button>
              </div>

              {/* 2. SEARCH & CATEGORY FILTER BAR */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search offender by Name, Username, PID, or Email..."
                      className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 font-mono"
                    />
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { id: "ALL", label: `All (${offenders.length})`, style: "border-slate-700 text-slate-300" },
                      { id: "CRITICAL", label: "🔴 Critical (10+)", style: "border-red-500/40 text-red-400" },
                      { id: "WARNING", label: "🟡 Warning (3-9)", style: "border-amber-500/40 text-amber-400" },
                      { id: "LOW", label: "🔵 Low / Accidental (1-2)", style: "border-sky-500/40 text-sky-400" },
                      { id: "BLOCKED", label: "🔒 Restricted AI", style: "border-purple-500/40 text-purple-400" }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setTierFilter(tab.id as any)}
                        className={`px-3.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider border transition-all ${
                          tierFilter === tab.id
                            ? "bg-slate-800 border-white/30 text-white shadow-md"
                            : `bg-slate-950/60 hover:bg-slate-900 ${tab.style}`
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {siemError && (
                  <div className="p-4 mb-4 rounded-xl bg-red-950/40 border border-red-900/60 text-red-400 text-xs font-mono">
                    {siemError}
                  </div>
                )}

                {/* 3. OFFENDER LEADERBOARD TABLE */}
                <div className="overflow-x-auto max-h-[540px] overflow-y-auto rounded-2xl border border-slate-800/80">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="py-4 px-5">Threat Tier</th>
                        <th className="py-4 px-5">Patient / Account</th>
                        <th className="py-4 px-5">Blocked Attempts</th>
                        <th className="py-4 px-5">Arabella AI Status</th>
                        <th className="py-4 px-5">Last Incident</th>
                        <th className="py-4 px-5 text-right">Forensic Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {siemLoading ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 font-mono">
                            <Activity size={20} className="animate-spin inline mr-2 text-red-500" />
                            Scanning AI Firewall forensic ledger...
                          </td>
                        </tr>
                      ) : filteredOffenders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-500 font-mono">
                            No matching AI Firewall incidents found.
                          </td>
                        </tr>
                      ) : (
                        filteredOffenders.map((offender) => {
                          const isCrit = offender.threat_tier === "CRITICAL";
                          const isWarn = offender.threat_tier === "WARNING";

                          return (
                            <tr
                              key={offender.patient_id}
                              onClick={() => {
                                setSelectedOffender(offender);
                                setActionFeedback(null);
                              }}
                              className={`cursor-pointer transition-colors ${
                                isCrit
                                  ? "bg-red-950/15 hover:bg-red-950/30"
                                  : isWarn
                                  ? "bg-amber-950/10 hover:bg-amber-950/20"
                                  : "hover:bg-slate-900/80"
                              }`}
                            >
                              {/* Tier Badge */}
                              <td className="py-4 px-5 font-mono">
                                {isCrit && (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.2)]">
                                    🔴 CRITICAL
                                  </span>
                                )}
                                {isWarn && (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    🟡 WARNING
                                  </span>
                                )}
                                {!isCrit && !isWarn && (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                    🔵 LOW (ACCIDENTAL)
                                  </span>
                                )}
                              </td>

                              {/* Color-Coded Name & PID */}
                              <td className="py-4 px-5">
                                <div
                                  className={`text-sm tracking-wide ${
                                    isCrit
                                      ? "font-black text-red-400"
                                      : isWarn
                                      ? "font-bold text-amber-300"
                                      : "font-semibold text-sky-400"
                                  }`}
                                >
                                  {offender.full_name}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  @{offender.username} • <span className="text-slate-400">{offender.pid}</span>
                                </div>
                              </td>

                              {/* Attack Counts */}
                              <td className="py-4 px-5 font-mono">
                                <span
                                  className={`text-sm font-black ${
                                    isCrit ? "text-red-400" : isWarn ? "text-amber-300" : "text-slate-200"
                                  }`}
                                >
                                  {offender.total_attacks} Total
                                </span>
                                <span className="block text-[10px] text-slate-500">
                                  ({offender.attacks_24h} in last 24h)
                                </span>
                              </td>

                              {/* Arabella Access Status */}
                              <td className="py-4 px-5 font-mono">
                                {offender.is_blocked ? (
                                  <div>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-900/40 border border-red-500/40 text-red-300 text-[10px] font-bold uppercase">
                                      <Lock size={12} /> AI Restricted
                                    </span>
                                    <span className="block text-[10px] text-slate-400 mt-1">
                                      Until: {offender.blocked_until}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-700/40 text-emerald-400 text-[10px] font-bold uppercase">
                                    <Unlock size={12} /> Active Access
                                  </span>
                                )}
                              </td>

                              {/* Last Attack Timestamp */}
                              <td className="py-4 px-5 font-mono text-slate-400 text-[11px]">
                                {offender.last_attack_at}
                              </td>

                              {/* Inspect Button */}
                              <td className="py-4 px-5 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOffender(offender);
                                    setActionFeedback(null);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-red-900/40 border border-slate-700 hover:border-red-500/40 text-slate-200 hover:text-red-300 text-[11px] font-bold uppercase tracking-wider transition-all"
                                >
                                  <Eye size={14} /> Inspect & Control
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ========================================================= */}
      {/* DRILL-DOWN FORENSIC INSPECTOR MODAL / DRAWER              */}
      {/* ========================================================= */}
      {selectedOffender && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${
                    selectedOffender.threat_tier === "CRITICAL"
                      ? "bg-red-950/60 border-red-500/50 text-red-400"
                      : selectedOffender.threat_tier === "WARNING"
                      ? "bg-amber-950/60 border-amber-500/50 text-amber-400"
                      : "bg-sky-950/60 border-sky-500/50 text-sky-400"
                  }`}
                >
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-black text-white tracking-wide">
                      {selectedOffender.full_name}
                    </h3>
                    <span className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300">
                      {selectedOffender.pid}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    @{selectedOffender.username} • Total Blocked Payloads: {selectedOffender.total_attacks} ({selectedOffender.attacks_24h} in 24h)
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedOffender(null)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-red-950/60 text-slate-400 hover:text-red-400 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* 1. PATIENT CONTACT & DIRECT WARNING PANEL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">
                      Registered Email Address
                    </span>
                    <span className="text-sm font-mono text-white">{selectedOffender.email}</span>
                  </div>
                  {selectedOffender.email !== "N/A" && (
                  <a
                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${selectedOffender.email}&su=${encodeURIComponent("MedCare Security Warning - Arabella AI Misuse")}&body=${encodeURIComponent(`Dear ${selectedOffender.full_name},\n\nOur Zero-Trust AI Firewall detected ${selectedOffender.total_attacks} prohibited or malicious requests originating from your account. Please refrain from submitting non-medical or adversarial inputs.\n\nThank you,\nMedCare Security Team`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    <Mail size={14} /> Send Warning
                  </a>
                )}
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-1">
                      Patient Contact Number
                    </span>
                    <span className="text-sm font-mono text-white">{selectedOffender.contact_number}</span>
                  </div>
                  {selectedOffender.contact_number !== "N/A" && (
                    <a
                      href={`tel:${selectedOffender.contact_number}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      <Phone size={14} /> Call Patient
                    </a>
                  )}
                </div>
              </div>

              {/* 2. MICRO-SEGMENTED ARABELLA AI ACCESS CONTROL */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800/80">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                      <Ban size={15} className="text-red-500" />
                      Arabella AI Access Control (Micro-Segmented Restriction)
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Restricts <span className="text-white font-semibold">only Arabella AI Chat</span>. The patient can still access Lab Reports, Prescriptions, and Manual Booking.
                    </p>
                  </div>

                  {selectedOffender.is_blocked ? (
                    <span className="px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-mono font-bold uppercase shrink-0">
                      🔒 Restricted Until: {selectedOffender.blocked_until}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono font-bold uppercase shrink-0">
                      🔓 AI Access Active
                    </span>
                  )}
                </div>

                {selectedOffender.block_reason && (
                  <div className="mb-4 p-3 rounded-xl bg-red-950/30 border border-red-900/50 text-xs font-mono text-red-300">
                    <span className="font-bold uppercase">Current Restriction Reason: </span>
                    {selectedOffender.block_reason}
                  </div>
                )}

                <div className="mb-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">
                    Admin Restriction Note / Reason
                  </label>
                  <input
                    type="text"
                    value={banReasonInput}
                    onChange={(e) => setBanReasonInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-red-500/50"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    disabled={actionLoading}
                    onClick={() => handleManageBan(selectedOffender.patient_id, "24h")}
                    className="px-4 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    <Clock size={13} className="inline mr-1.5" />
                    Block 24 Hours
                  </button>

                  <button
                    disabled={actionLoading}
                    onClick={() => handleManageBan(selectedOffender.patient_id, "1w")}
                    className="px-4 py-2.5 rounded-xl bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-orange-300 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    <Clock size={13} className="inline mr-1.5" />
                    Block 1 Week
                  </button>

                  <button
                    disabled={actionLoading}
                    onClick={() => handleManageBan(selectedOffender.patient_id, "1m")}
                    className="px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    <Clock size={13} className="inline mr-1.5" />
                    Block 1 Month
                  </button>

                  <button
                    disabled={actionLoading}
                    onClick={() => handleManageBan(selectedOffender.patient_id, "permanent")}
                    className="px-4 py-2.5 rounded-xl bg-red-900/50 hover:bg-red-800 border border-red-600 text-white text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    <Lock size={13} className="inline mr-1.5" />
                    Permanent AI Ban
                  </button>

                  {selectedOffender.is_blocked && (
                    <button
                      disabled={actionLoading}
                      onClick={() => handleManageBan(selectedOffender.patient_id, "unblock")}
                      className="ml-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-black uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50"
                    >
                      <Unlock size={14} className="inline mr-1.5" />
                      Revoke Ban / Unblock AI
                    </button>
                  )}
                </div>

                {actionFeedback && (
                  <div
                    className={`mt-4 p-3 rounded-xl text-xs font-mono border ${
                      actionFeedback.type === "success"
                        ? "bg-emerald-950/40 border-emerald-700/50 text-emerald-300"
                        : "bg-red-950/40 border-red-700/50 text-red-300"
                    }`}
                  >
                    {actionFeedback.message}
                  </div>
                )}
              </div>

              {/* 3. MASKED MALICIOUS PAYLOAD HISTORY (DLP COMPLIANT) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-300">
                    Masked Malicious Prompt History ({selectedOffender.attack_history.length} Events)
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-400">
                    ● PII & Medical Terms Redacted
                  </span>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {selectedOffender.attack_history.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 font-mono text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase">
                            {item.attack_type}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-sky-400 text-[10px]">
                            Layer: {item.layer}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 text-[10px]">
                            Confidence: {item.threat_score}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          IP: {item.ip_address} • {item.timestamp}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-300 break-all">
                        <span className="text-slate-500 select-none">Masked Vector: </span>
                        {item.masked_payload}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}