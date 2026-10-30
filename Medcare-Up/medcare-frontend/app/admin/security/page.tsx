"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { 
  ShieldCheck, LayoutDashboard, FileText, UserCog, LogOut, 
  Activity, Lock, Smartphone, AlertTriangle, CheckCircle2, 
  Trash2, Monitor, Globe, Mail, SmartphoneNfc, QrCode, FileCheck2, XCircle,
  Menu, X, Fingerprint 
} from "lucide-react";

export default function AdminSecurityPage() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [sysMessage, setSysMessage] = useState({ text: "", type: "" });
  
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [profile, setProfile] = useState<any>(null);
  const [editEmail, setEditEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  
  const [mfaEmailEnabled, setMfaEmailEnabled] = useState(false);
  const [mfaAppEnabled, setMfaAppEnabled] = useState(false);
  const [smartShieldEnabled, setSmartShieldEnabled] = useState(false); 
  const [togglingMfa, setTogglingMfa] = useState(false);
  
  const [setupStep, setSetupStep] = useState(0);
  const [qrCodeUri, setQrCodeUri] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verifyingApp, setVerifyingApp] = useState(false);

  const [sessions, setSessions] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("medcare_token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchAllSecurityData(token);
  }, [router]);

  const fetchAllSecurityData = async (token: string) => {
    setLoading(true);
    const config = { headers: { Authorization: `Bearer ${token}` } };
    
    try {
      const [profileRes, sessionsRes, logsRes] = await Promise.all([
        axios.get("http://localhost:8000/admin/profile", config),
        axios.get("http://localhost:8000/auth/sessions/me", config),
        axios.get("http://localhost:8000/admin/me/activity-logs", config)
      ]);

      const profData = profileRes.data;
      setProfile(profData);
      setEditEmail(profData.email || "");
      setMfaEmailEnabled(profData.mfa_email_enabled || false);
      setMfaAppEnabled(profData.mfa_app_enabled || false); 
      setSmartShieldEnabled(profData.smartshield_enabled ?? true); 

      setSessions(sessionsRes.data);
      setActivityLogs(logsRes.data);

    } catch (err) {
      console.error("Failed to fetch security data", err);
      showToast("Unable to load security profile securely.", "error");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (text: string, type: "success" | "error") => {
    setSysMessage({ text, type });
    setTimeout(() => setSysMessage({ text: "", type: "" }), 5000);
  };

  const handleProfileUpdate = async () => {
    setSavingProfile(true);
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return;
      await axios.put("http://localhost:8000/admin/me/profile", {
        email: editEmail
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      showToast("Admin Identity updated successfully.", "success");
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Update failed.", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return;
      await axios.put("http://localhost:8000/auth/security/change-password", {
        current_password: currentPassword,
        new_password: newPassword
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      showToast("Password updated. Other sessions revoked automatically.", "success");
      setCurrentPassword(""); setNewPassword("");
      fetchAllSecurityData(token); 
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Password change failed.", "error");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleEmailMfaToggle = async () => {
    setTogglingMfa(true);
    const newStatus = !mfaEmailEnabled;
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return;
      await axios.post(`http://localhost:8000/auth/mfa/toggle-email?enable=${newStatus}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMfaEmailEnabled(newStatus);
      
      if (newStatus) setSmartShieldEnabled(false);
      showToast(`Email MFA has been ${newStatus ? 'Enabled' : 'Disabled'}`, "success");
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Email MFA toggle failed.", "error");
    } finally {
      setTogglingMfa(false);
    }
  };

  
  const handleSmartShieldToggle = async () => {
    setTogglingMfa(true);
    const newStatus = !smartShieldEnabled;
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return;
      await axios.post(`http://localhost:8000/auth/security/toggle-smartshield?enable=${newStatus}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSmartShieldEnabled(newStatus);
      
      if (newStatus) setMfaEmailEnabled(false);
      showToast(`SmartShield Security has been ${newStatus ? 'Enabled' : 'Disabled'}`, "success");
    } catch (err: any) {
      showToast(err.response?.data?.detail || "SmartShield toggle failed.", "error");
    } finally {
      setTogglingMfa(false);
    }
  };

  const handleSetupAppMfa = async () => {
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return;
      const res = await axios.post("http://localhost:8000/auth/mfa/setup-app", {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQrCodeUri(res.data.qr_uri);
      setMfaSecret(res.data.secret);
      setSetupStep(1);
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Failed to initiate MFA setup.", "error");
    }
  };

  const handleVerifyAppMfa = async () => {
    if (verificationCode.length !== 6) {
      showToast("Please enter a valid 6-digit code.", "error");
      return;
    }
    setVerifyingApp(true);
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return;
      await axios.post("http://localhost:8000/auth/mfa/verify-app", { app_code: verificationCode }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMfaAppEnabled(true);
      setSetupStep(0);
      setVerificationCode("");
      showToast("Authenticator App successfully enabled!", "success");
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Invalid verification code.", "error");
    } finally {
      setVerifyingApp(false);
    }
  };

  const handleDisableAppMfa = async () => {
    if (!window.confirm("Are you sure you want to disable Authenticator App security?")) return;
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return;
      await axios.post("http://localhost:8000/auth/mfa/disable-app", {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMfaAppEnabled(false);
      showToast("Authenticator App security disabled.", "success");
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Failed to disable Authenticator.", "error");
    }
  };

  const handleRevokeSessions = async () => {
    if (!window.confirm("Are you sure? This will log out all other active devices immediately.")) return;
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return;
      await axios.delete("http://localhost:8000/auth/sessions/revoke-others", {
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast("All other remote sessions have been securely wiped.", "success");
      fetchAllSecurityData(token); 
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Failed to wipe remote sessions.", "error");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("medcare_token");
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0F1C] flex flex-col items-center justify-center text-blue-500/50">
        <Activity size={50} className="animate-pulse mb-4" />
        <p className="text-xs uppercase tracking-widest font-bold">Decrypting Security Clearance...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-slate-200 flex font-sans overflow-hidden">
      
      {/* Toast Notification */}
      {sysMessage.text && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[70] px-6 py-3 w-[90%] md:w-auto text-center rounded-full text-[10px] md:text-xs font-bold tracking-widest uppercase shadow-2xl flex items-center justify-center gap-2 animate-fadeIn border ${
          sysMessage.type === "success" ? "bg-emerald-950/90 text-emerald-400 border-emerald-900/50" : "bg-red-950/90 text-red-400 border-red-900/50"
        }`}>
          {sysMessage.type === "success" ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertTriangle size={16} className="shrink-0" />}
          {sysMessage.text}
        </div>
      )}

      {/* 🟢 MOBILE OVERLAY BACKGROUND */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 🟢 ADMIN SIDEBAR (Responsive ) */}
      <div className={`fixed inset-y-0 left-0 w-64 bg-[#0B1120] border-r border-slate-800/50 flex flex-col justify-between z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div>
          <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-widest uppercase text-white leading-tight">MedCare</h1>
                <span className="text-blue-400 text-[9px] font-bold tracking-widest uppercase">Admin Console</span>
              </div>
            </div>
            {/* Phone view Sidebar Close  */}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
          
          <div className="p-4 space-y-1 mt-2">
            <Link href="/admin" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-800/50">
              <LayoutDashboard size={16} /> Command Center
            </Link>
            <Link href="/admin/billing" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-800/50">
              <Activity size={16} /> Automated Billing
            </Link>
            <Link href="/admin/schedule" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-800/50">
              <Activity size={16} /> Schedule & Ops
            </Link>
            <Link href="/admin/employees" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-800/50">
              <UserCog size={16} /> Employee Management
            </Link>
            <Link href="/admin/forensics" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-800/50">
              <Activity size={16} /> Digital Forensics
            </Link>

            {/* Active Page */}
            <div className="w-full flex items-center gap-3 px-4 py-3 bg-blue-900/20 text-blue-400 border border-blue-800/50 rounded-xl text-xs font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(59,130,246,0.1)] transition-all cursor-default">
              <Lock size={16} /> Profile & Security
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-800/50">
          <button onClick={handleLogout} className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-slate-900 hover:bg-red-950/40 border border-slate-800 hover:border-red-900/50 text-slate-400 hover:text-red-400 rounded-xl text-xs font-bold tracking-widest uppercase transition-all">
            <LogOut size={14} /> Secure Logout
          </button>
        </div>
      </div>

      {/* 🟢 MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto relative">
        <div className="p-6 md:p-12 max-w-6xl mx-auto w-full z-10 space-y-8">
          
          {/* 🟢 MOBILE HEADER & MENU BUTTON */}
          <div className="md:hidden flex items-center justify-between border-b border-slate-800/60 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
              </div>
              <h1 className="text-xs font-black tracking-widest uppercase text-white leading-tight">MedCare<br/><span className="text-blue-400 text-[9px]">Admin Console</span></h1>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Menu size={24} />
            </button>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-light tracking-widest uppercase text-white mb-1">
              Admin <span className="font-bold text-blue-500">Security</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* 🔴 COLUMN 1 */}
            <div className="space-y-8">
              
              {/* ADMIN IDENTITY */}
              <div className="bg-[#0F172A]/80 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-xl relative overflow-hidden">
                <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <UserCog size={14} className="text-emerald-400" /> Admin Identity
                </h3>
                
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-[8px] text-slate-500 uppercase tracking-widest font-bold mb-1">Admin Username (Locked)</label>
                    <input type="text" value={profile?.username} disabled className="w-full bg-[#0A0F1C]/50 border border-slate-800 rounded-lg px-4 py-3 text-xs text-slate-500 cursor-not-allowed font-mono" />
                  </div>
                  <div>
                    <label className="block text-[8px] text-slate-500 uppercase tracking-widest font-bold mb-1">Security Email (For OTPs)</label>
                    <input 
                      type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full bg-[#0A0F1C] border border-slate-700 rounded-lg px-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono" 
                    />
                    <p className="text-[8px] text-slate-600 mt-1 font-mono">This email will receive real SMTP OTPs when Email MFA is enabled.</p>
                  </div>
                </div>

                <button 
                  onClick={handleProfileUpdate} disabled={savingProfile}
                  className="px-6 py-2.5 bg-emerald-900/30 hover:bg-emerald-800/50 border border-emerald-700 text-emerald-400 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {savingProfile ? <Activity size={14} className="animate-spin" /> : "Save"}
                </button>
              </div>

              {/* CHANGE PASSWORD */}
              <div className="bg-[#0F172A]/80 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-xl">
                <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Lock size={14} className="text-amber-400" /> Change Password
                </h3>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="block text-[8px] text-slate-500 uppercase tracking-widest font-bold mb-1">Current Password</label>
                    <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full bg-[#0A0F1C] border border-slate-700 rounded-lg px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500 font-mono" />
                  </div>
                  <div>
                    <label className="block text-[8px] text-slate-500 uppercase tracking-widest font-bold mb-1">New Secure Password</label>
                    <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-[#0A0F1C] border border-slate-700 rounded-lg px-4 py-3 text-xs text-amber-400 focus:outline-none focus:border-amber-500 font-mono" />
                  </div>
                  <button 
                    type="submit" disabled={savingPassword}
                    className="w-full mt-2 py-3 bg-amber-900/30 hover:bg-amber-800/50 border border-amber-700 text-amber-400 rounded-lg text-[10px] font-bold tracking-widest uppercase transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingPassword ? <Activity size={14} className="animate-spin" /> : "Update Password"}
                  </button>
                </form>
              </div>

            </div>

            {/* 🔴 COLUMN 2 */}
            <div className="space-y-8">
              
              {/* MFA & SMARTSHIELD (AI GUARD) */}
              <div className="bg-[#0F172A]/80 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-xl">
                <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-6 flex items-center gap-2 border-b border-slate-800 pb-3">
                  <SmartphoneNfc size={14} className="text-blue-400" /> Multi-Factor Authentication
                </h3>

                <div className="space-y-4">
                  
                  {/* 🟢 NEW: SMARTSHIELD AI TOGGLE */}
                  <div className="bg-[#0A0F1C] border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${smartShieldEnabled ? 'bg-indigo-900/50 border border-indigo-500/30 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
                          <Fingerprint size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-white uppercase tracking-widest">SmartShield AI Guard</p>
                          <p className="text-[8px] text-slate-500 uppercase tracking-widest mt-0.5">XGBoost Behavioral Biometrics</p>
                        </div>
                      </div>
                      <button 
                        onClick={handleSmartShieldToggle} disabled={togglingMfa}
                        className={`relative w-10 h-5 rounded-full transition-colors ${smartShieldEnabled ? "bg-indigo-500" : "bg-slate-700"}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${smartShieldEnabled ? "translate-x-5" : "translate-x-0"}`}></div>
                      </button>
                    </div>
                    {smartShieldEnabled && (
                      <p className="text-[8px] font-mono text-indigo-400/80 bg-indigo-950/20 p-2 rounded-lg mt-2 border border-indigo-900/30 text-center">
                        Silent behavioral analysis is active. Email OTP will only be requested if a bot or high-risk activity is detected.
                      </p>
                    )}
                  </div>

                  {/* Email MFA */}
                  <div className="bg-[#0A0F1C] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${mfaEmailEnabled ? 'bg-blue-900/50 border border-blue-500/30 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                        <Mail size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-white uppercase tracking-widest">Email OTP Validation</p>
                        <p className="text-[8px] text-slate-500 uppercase tracking-widest mt-0.5">Always request OTP via Email</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleEmailMfaToggle} disabled={togglingMfa}
                      className={`relative w-10 h-5 rounded-full transition-colors ${mfaEmailEnabled ? "bg-blue-500" : "bg-slate-700"}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${mfaEmailEnabled ? "translate-x-5" : "translate-x-0"}`}></div>
                    </button>
                  </div>

                  {/* App MFA */}
                  <div className="bg-[#0A0F1C] border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${mfaAppEnabled ? 'bg-emerald-900/50 border border-emerald-500/30 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                          <ShieldCheck size={16} />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-white uppercase tracking-widest">Authenticator App</p>
                          <p className="text-[8px] text-slate-500 uppercase tracking-widest mt-0.5">Google Authenticator (TOTP)</p>
                        </div>
                      </div>
                      
                      {!mfaAppEnabled && setupStep === 0 && (
                        <button onClick={handleSetupAppMfa} className="px-4 py-1.5 bg-blue-900/30 hover:bg-blue-800/50 text-blue-400 text-[9px] font-bold uppercase tracking-widest rounded border border-blue-900/50 transition-colors">
                          Enable
                        </button>
                      )}
                      
                      {mfaAppEnabled && (
                        <button onClick={handleDisableAppMfa} className="px-4 py-1.5 bg-red-900/30 hover:bg-red-800/50 text-red-400 text-[9px] font-bold uppercase tracking-widest rounded border border-red-900/50 transition-colors">
                          Disable
                        </button>
                      )}
                    </div>

                    {/* QR Code Section */}
                    {setupStep === 1 && !mfaAppEnabled && (
                      <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col items-center animate-fadeIn">
                        <div className="bg-white p-2 rounded-lg mb-3">
                           <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrCodeUri)}`} alt="QR Code" className="w-28 h-28" />
                        </div>
                        <p className="text-[9px] text-slate-400 font-mono mb-4 text-center">
                          Secret: <span className="text-white font-bold">{mfaSecret}</span>
                        </p>
                        <input 
                          type="text" placeholder="Enter 6-digit code" 
                          value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-full text-center bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-white focus:outline-none focus:border-blue-500 tracking-[0.5em] mb-4"
                        />
                        <div className="flex gap-3 w-full">
                          <button onClick={() => setSetupStep(0)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors">Cancel</button>
                          <button onClick={handleVerifyAppMfa} disabled={verifyingApp || verificationCode.length !== 6} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-colors">Verify</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTIVE SESSIONS */}
              <div className="bg-[#0F172A]/80 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-xl">
                <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-3">
                  <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                    <Monitor size={14} className="text-red-400" /> Active Sessions
                  </h3>
                  <button 
                    onClick={handleRevokeSessions}
                    className="text-[8px] bg-red-950/50 text-red-400 border border-red-900 px-3 py-1.5 rounded font-bold uppercase hover:bg-red-900 transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={10}/> Revoke All Others
                  </button>
                </div>

                <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-2">
                  {sessions.map((sess, i) => (
                    <div key={sess.id || i} className={`p-3 rounded-lg border flex flex-col ${sess.is_current ? 'bg-blue-950/20 border-blue-900/50' : 'bg-[#0A0F1C] border-slate-800'}`}>
                      <p className="text-[10px] font-bold text-slate-300 flex justify-between">
                        {sess.ip_address}
                        {sess.is_current && <span className="text-blue-400 text-[8px]">*Current</span>}
                      </p>
                      <p className="text-[8px] text-slate-500 font-mono truncate mt-1">{sess.user_agent}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* 🟢 ZERO-TRUST ACTIVITY LOGS TABLE (Responsive) */}
          <div className="mt-8 bg-[#0F172A]/80 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-xl">
            
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800">
              <FileText size={18} className="text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Activity Logs</h3>
                <p className="text-[9px] md:text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Monitor account access, IP addresses, and security events</p>
              </div>
            </div>

            {/* Zero-Trust Notice Banner */}
            <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-xl p-4 flex items-start gap-3 mb-6">
              <ShieldCheck size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-[8px] md:text-[9px] text-emerald-500 uppercase tracking-widest font-bold leading-relaxed">
                ZERO-TRUST AUDIT LOG: THIS IS A HIGHLY SECURED LEDGER OF YOUR ACCOUNT ACTIVITIES. IF YOU NOTICE ANY SUSPICIOUS LOGINS OR UNRECOGNIZABLE DEVICES, PLEASE CHANGE YOUR PASSWORD IMMEDIATELY AND CONTACT SUPPORT.
              </p>
            </div>

            {/* The Table */}
            <div className="overflow-x-auto custom-scrollbar pb-4">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-800 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    <th className="py-4 pl-4">Event Type</th>
                    <th className="py-4">Status</th>
                    <th className="py-4">IP Address</th>
                    <th className="py-4">Device / Browser</th>
                    <th className="py-4 text-right pr-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="text-[11px]">
                  {activityLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-600 font-mono text-[10px]">No activity logs found.</td>
                    </tr>
                  ) : (
                    activityLogs.map((log: any) => (
                      <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-900/40 transition-colors">
                        <td className="py-4 pl-4 font-bold text-slate-200 tracking-widest uppercase">
                          {log.action.replace(/_/g, " ")}
                        </td>
                        <td className="py-4">
                          {log.status === "SUCCESS" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-emerald-900/50 bg-emerald-950/30 text-emerald-400 text-[8px] font-bold tracking-widest uppercase">
                              <CheckCircle2 size={10} /> Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-red-900/50 bg-red-950/30 text-red-400 text-[8px] font-bold tracking-widest uppercase">
                              <XCircle size={10} /> Failed
                            </span>
                          )}
                        </td>
                        <td className="py-4 font-mono text-slate-400">{log.ip_address}</td>
                        <td className="py-4 font-mono text-slate-400 flex items-center gap-2">
                          <Globe size={12} className="text-slate-600 shrink-0" />
                          <span className="truncate max-w-[200px]" title={log.device}>{log.device}</span>
                        </td>
                        <td className="py-4 font-mono text-slate-500 text-right pr-4 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}