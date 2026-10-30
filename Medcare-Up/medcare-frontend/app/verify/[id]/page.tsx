"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import axios from "axios";
import { 
  ShieldCheck, Pill, Stethoscope, Calendar, CheckCircle2, AlertOctagon, 
  Building, Activity, FileText, Download, EyeOff, Eye, Lock, Fingerprint, Clock, FileKey2, User
} from "lucide-react";

export default function PublicPrescriptionVerification() {
  const params = useParams();
  const searchParams = useSearchParams();
  
  const prescriptionId = decodeURIComponent((params?.id as string) || "");
  const zkpProof = searchParams.get("proof") || "";
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<number | null>(null);

  useEffect(() => {
    if (prescriptionId) {
      verifyPrescription(prescriptionId, zkpProof);
    } else {
      setError("Invalid Prescription Reference URL.");
      setLoading(false);
    }
  }, [prescriptionId, zkpProof]);

  const verifyPrescription = async (id: string, proofToken: string) => {
    setLoading(true);
    setError("");
    try {
      // 🛡️ Public ZKP API Call (Includes ?proof= HMAC Signature if present)
      const query = proofToken ? `?proof=${encodeURIComponent(proofToken)}` : "";
      const response = await axios.get(
        `http://localhost:8000/verify/prescription/${encodeURIComponent(id)}${query}`
      );
      setData(response.data);
    } catch (err: any) {
      console.error("Verification Error:", err);
      const status = err.response?.status || 500;
      setErrorCode(status);

      if (status === 429) {
        setError("SECURITY ALERT: Rate limit exceeded (Max 15 scans/min). Automated scraping blocked.");
      } else if (status === 403) {
        setError(err.response?.data?.detail || "ZKP CRYPTOGRAPHIC PROOF FAILED: QR signature mismatch or tampered prescription!");
      } else {
        setError(err.response?.data?.detail || "Invalid or Tampered Prescription. Verification Failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-cyan-500/50 font-sans">
        <Activity size={50} className="animate-pulse mb-4 text-cyan-400" />
        <p className="text-xs uppercase tracking-widest font-bold text-white mb-1">Verifying Zero-Knowledge Proof...</p>
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Validating HMAC-SHA256 Commitment for {prescriptionId}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-lg w-full bg-slate-900 border-2 border-red-900/60 rounded-3xl p-10 text-center shadow-[0_0_50px_rgba(220,38,38,0.15)] animate-fadeIn">
          <AlertOctagon size={64} className="text-red-500 mx-auto mb-6 opacity-90" />
          <span className="px-3 py-1 rounded-full bg-red-950 border border-red-800 text-red-300 text-[9px] font-mono uppercase tracking-widest font-bold">
            HTTP {errorCode || 400} • ZKP Verification Rejected
          </span>
          <h1 className="text-xl font-black tracking-widest uppercase text-red-500 mt-3 mb-2">Verification Failed</h1>
          <p className="text-xs text-slate-300 font-mono mb-6 leading-relaxed">{error}</p>
          <div className="text-[10px] text-slate-400 uppercase tracking-widest bg-slate-950 p-4 rounded-xl border border-slate-800 leading-relaxed">
            ⚠️ Do <strong>NOT</strong> dispense medications. Ensure the QR code was scanned directly from an unaltered MedCare E-Prescription.
          </div>
        </div>
      </div>
    );
  }

  const isPrivacyOn = Boolean(data?.privacy_mode);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30 py-12 px-4 md:px-6 print:bg-white print:text-black print:h-auto print:overflow-visible">      
      <div className="max-w-4xl mx-auto">
        
        {/* Header / Brand */}
        <div className="flex flex-col items-center justify-center mb-10">
          <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(6,182,212,0.2)]">
            <ShieldCheck size={32} className="text-cyan-400" />
          </div>
          <h1 className="text-2xl font-black tracking-widest uppercase text-white">MedCare <span className="text-cyan-400">ZKP Verify</span></h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-1 flex items-center gap-1.5">
            <Fingerprint size={12} className="text-cyan-400" /> Zero-Knowledge E-Prescription Verification System
          </p>
        </div>

        {/* The E-Prescription Document */}
        <div className={`bg-slate-900/80 backdrop-blur-md border-2 rounded-3xl overflow-hidden shadow-2xl relative transition-all ${
          isPrivacyOn ? "border-purple-500/50 shadow-[0_0_45px_rgba(168,85,247,0.12)]" : "border-emerald-500/40 shadow-[0_0_45px_rgba(16,185,129,0.1)]"
        }`}>
          
          {/* Top Authentic Ribbon */}
          <div className={`border-b px-8 py-4 flex flex-wrap items-center justify-between gap-3 ${
            isPrivacyOn 
              ? "bg-gradient-to-r from-emerald-950/60 via-slate-900 to-purple-950/60 border-purple-900/50" 
              : "bg-emerald-950/40 border-emerald-900/50"
          }`}>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
                {data?.status || "✅ ZKP VERIFIED: AUTHENTIC PRESCRIPTION"}
              </span>
            </div>

            <span className={`px-3 py-1 rounded-full text-[9px] font-mono font-bold uppercase tracking-widest border flex items-center gap-1.5 ${
              isPrivacyOn 
                ? "bg-purple-950/80 border-purple-500/50 text-purple-300" 
                : "bg-emerald-950/80 border-emerald-500/40 text-emerald-300"
            }`}>
              {isPrivacyOn ? <><EyeOff size={11} /> Anonymous ZKP Mode (PII Blinded)</> : <><Eye size={11} /> Standard Full View</>}
            </span>
          </div>

          <div className="p-8 md:p-12 animate-fadeIn">
            
            {/* 1. Header Details (Doctor & Prescription Ref - ALWAYS VISIBLE) */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-8 border-b border-slate-800 mb-8">
              <div>
                <h2 className="text-2xl font-black text-white flex items-center gap-3 mb-2">
                  <Stethoscope size={24} className="text-cyan-400" /> Dr. {data?.doctor_details?.name || "Verified Consultant"}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                  <span className="flex items-center gap-1.5">
                    <Building size={12} className="text-cyan-500/70" /> DEPT: {data?.doctor_details?.specialization || "General"}
                  </span>
                  {data?.doctor_details?.slmc_number && (
                    <span className="flex items-center gap-1.5">
                      <FileText size={12} className="text-cyan-500/70" /> SLMC: {data.doctor_details.slmc_number}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-left md:text-right w-full md:w-auto bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Prescription Ref</p>
                <p className="text-lg font-mono font-bold text-cyan-400">{data?.prescription_id}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-1 flex items-center md:justify-end gap-2">
                  <span><Calendar size={10} className="inline mr-1" /> {data?.issue_date}</span>
                  {data?.issue_time && <span><Clock size={10} className="inline mr-1" /> {data.issue_time}</span>}
                </p>
              </div>
            </div>

            {/* 2. Patient Identity Section: Blinded if Privacy ON (🙈), Visible if Privacy OFF (👁️) */}
            {isPrivacyOn || !data?.patient_details ? (
              <div className="bg-purple-950/20 border border-purple-500/40 rounded-2xl p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-purple-950/60 border border-purple-500/50 flex items-center justify-center shrink-0">
                    <Lock size={18} className="text-purple-300" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300 block">
                      Zero-Knowledge Patient Privacy Active
                    </span>
                    <p className="text-xs text-slate-300 font-mono mt-0.5">
                      {data?.privacy_message || "Patient identity (Name, PID, Age, Gender) and clinical notes are blinded via Zero-Knowledge Proof."}
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-lg bg-slate-950 border border-purple-800/60 text-[9px] font-mono text-purple-300 uppercase tracking-widest shrink-0">
                  KYC Patient Verified
                </span>
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 mb-8 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-cyan-950/30 border border-cyan-900/50 flex items-center justify-center shrink-0">
                  <User size={20} className="text-cyan-400" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full text-[11px] font-mono">
                  <div>
                    <span className="text-slate-500 block uppercase tracking-widest text-[9px] mb-1">Patient Name</span>
                    <span className="text-slate-200 font-bold">{data.patient_details.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase tracking-widest text-[9px] mb-1">Patient ID</span>
                    <span className="text-cyan-400 font-bold">{data.patient_details.pid}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase tracking-widest text-[9px] mb-1">Age</span>
                    <span className="text-slate-200">{data.patient_details.age} Years</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase tracking-widest text-[9px] mb-1">Gender</span>
                    <span className="text-slate-200">{data.patient_details.gender}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Prescribed Medicines List (ALWAYS VISIBLE TO PHARMACY FOR SAFE DISPENSING & ANTI-FORGERY) */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Pill size={14} className="text-cyan-400" /> Prescribed Medications (Verified Unaltered)
              </h3>
              <div className="border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[9px] text-slate-500 uppercase tracking-widest">
                      <th className="p-4 font-bold">Medicine Name</th>
                      <th className="p-4 font-bold">Dosage</th>
                      <th className="p-4 font-bold">Frequency</th>
                      <th className="p-4 font-bold">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {data?.medicines && data.medicines.map((med: any, idx: number) => (
                      <tr key={idx} className="bg-slate-900/50 hover:bg-slate-800/50 transition-colors">
                        <td className="p-4 text-sm font-bold text-white">
                          <span className="flex items-center gap-2">
                            <Pill size={12} className="text-cyan-500" /> {med.medicine_name}
                          </span>
                          {(med.generic_name || med.strength) && (
                            <span className="block text-[9px] text-slate-500 font-mono font-normal mt-1 ml-5">
                              {med.generic_name} {med.strength ? `• ${med.strength}` : ""}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-xs text-slate-300 font-mono">{med.dose}</td>
                        <td className="p-4">
                          <span className="text-[9px] font-bold tracking-widest uppercase text-cyan-200 bg-cyan-950/40 border border-cyan-900/50 px-2 py-1 rounded block w-fit mb-1">
                            {med.frequency}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">{med.before_after_meals}</span>
                        </td>
                        <td className="p-4 text-xs text-slate-400 font-mono">{med.duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Doctor Note / Clinical Instructions (Visible when Privacy is OFF; Blinded when Privacy is ON) */}
            {!isPrivacyOn && data?.doctor_note && (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 mb-8 flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    Consultant's Instructions / Additional Clinical Notes
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed font-mono">{data.doctor_note}</p>
                </div>
              </div>
            )}

            {/* 5. ZKP Commitment Hash Footer */}
            {data?.zkp_commitment_hash && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                  <FileKey2 size={12} className="text-emerald-400" /> ZKP Commitment Hash:
                </span>
                <span className="text-[10px] text-slate-400 break-all">{data.zkp_commitment_hash}</span>
              </div>
            )}

          </div>

          <div className="bg-slate-950 px-8 py-6 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-[9px] text-slate-500 uppercase tracking-widest max-w-md text-center sm:text-left">
              This is a Zero-Knowledge cryptographically verified medical document issued by Project MedCare. Do not dispense medicines if verification fails.
            </p>
            <button 
              onClick={() => window.print()} 
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2 border border-slate-700 print:hidden"
            >
              <Download size={12} /> Print Record
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}