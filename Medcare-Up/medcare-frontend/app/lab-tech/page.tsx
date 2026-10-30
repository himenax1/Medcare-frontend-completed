"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { 
  FlaskConical, LayoutDashboard, ScrollText, UserCog, LogOut, 
  Activity, CheckCircle2, AlertTriangle, Upload, Search, 
  Clock, FileImage, ShieldCheck, X, Droplet,
  Menu 
} from "lucide-react";

export default function LabTechDashboard() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sysMessage, setSysMessage] = useState({ text: "", type: "" });
  
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [dashboardData, setDashboardData] = useState({ new_requests: [], pending_uploads: [], expired_requests: [] });
  const [activeTab, setActiveTab] = useState<"new" | "pending" | "expired">("new");
  const [searchQuery, setSearchQuery] = useState(""); 

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadHash, setUploadHash] = useState(""); 

  useEffect(() => {
    const token = localStorage.getItem("medcare_token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchLabDashboard(token);

    const interval = setInterval(() => {
      fetchLabDashboard(token, false);
    }, 20000);
    return () => clearInterval(interval);
  }, [router]);

  const fetchLabDashboard = async (token: string, showLoader = true) => {
    if (showLoader) setLoading(true);
    setError("");

    try {
      const response = await axios.get("http://localhost:8000/lab-tech/dashboard", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDashboardData(response.data);
    } catch (err: any) {
      console.error("Dashboard fetch error", err);
      if (err.response?.status === 403 && err.response?.data?.detail?.includes("Change Password")) {
        router.push("/force-change-password"); 
      } else {
        setError("Unable to sync live lab queue. Checking connection...");
      }
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const showToast = (text: string, type: "success" | "error") => {
    setSysMessage({ text, type });
    setTimeout(() => setSysMessage({ text: "", type: "" }), 5000);
  };

  const handleCollectSample = async (testId: number) => {
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return; 
      await axios.put(`http://localhost:8000/lab-tests/${testId}/collect`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      showToast("Sample collected successfully. Moved to Pending Uploads.", "success");
      fetchLabDashboard(token, false); 
    } catch (err: any) {
      showToast(err.response?.data?.detail || "Failed to collect sample.", "error");
    }
  };

  const openUploadModal = (testId: number) => {
    setSelectedTestId(testId);
    setSelectedFile(null);
    setUploadHash("");
    setUploadModalOpen(true);
    setIsSidebarOpen(false); 
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !selectedTestId) return;

    if (!selectedFile.name.endsWith(".png")) {
      showToast("Security Policy: Only .png files are allowed.", "error");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) return; 
      const response = await axios.post(`http://localhost:8000/lab-tests/${selectedTestId}/upload`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data"
        }
      });
      
      setUploadHash(response.data.hash); 
      showToast("Report uploaded & secured with Steganography.", "success");
      fetchLabDashboard(token, false); 
      
      setTimeout(() => {
        setUploadModalOpen(false);
        setUploadHash("");
      }, 4000);

    } catch (err: any) {
      showToast(err.response?.data?.detail || "File upload or security processing failed.", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("medcare_token");
    router.push("/login");
  };

  const getFilteredData = () => {
    const targetArray = activeTab === "new" ? dashboardData.new_requests : 
                        activeTab === "pending" ? dashboardData.pending_uploads : 
                        dashboardData.expired_requests;
                        
    if (!searchQuery) return targetArray;
    return targetArray.filter((item: any) => 
      item.req_id.toString().includes(searchQuery) || 
      item.patient_pid.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const filteredRecords = getFilteredData();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex font-sans overflow-hidden selection:bg-sky-500/30">
      
      {/* 🔴 SECURE UPLOAD MODAL */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fadeIn">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => !uploading && setUploadModalOpen(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
            
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4 mb-6 mt-2">
              <div className="w-12 h-12 bg-sky-950/50 border border-sky-900 rounded-xl flex items-center justify-center shrink-0">
                <Upload size={24} className="text-sky-400" />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-widest uppercase text-white mb-0.5">Upload Result</h2>
                <p className="text-[10px] text-slate-500 font-mono uppercase">Req ID: {selectedTestId}</p>
              </div>
            </div>

            {uploadHash ? (
              <div className="bg-emerald-950/30 border border-emerald-900/50 p-6 rounded-2xl text-center animate-fadeIn">
                <ShieldCheck size={40} className="text-emerald-400 mx-auto mb-4" />
                <h3 className="text-sm font-bold tracking-widest uppercase text-emerald-400 mb-2">Security Verification Complete</h3>
                <p className="text-[10px] text-emerald-500/70 font-mono uppercase mb-3">Immutable SHA-256 Hash Generated:</p>
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-[9px] font-mono text-slate-400 break-all">
                  {uploadHash}
                </div>
              </div>
            ) : (
              <form onSubmit={handleFileUpload} className="space-y-6">
                <div className="border-2 border-dashed border-slate-700 hover:border-sky-500/50 rounded-2xl p-6 md:p-8 text-center transition-colors relative">
                  <input 
                    type="file" accept=".png" required
                    onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {selectedFile ? (
                    <div className="flex flex-col items-center">
                      <FileImage size={40} className="text-sky-400 mb-3" />
                      <p className="text-sm font-bold text-sky-400 font-mono break-all px-2">{selectedFile.name}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <FileImage size={40} className="text-slate-600 mb-3" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Click to browse file</p>
                      <p className="text-[9px] text-slate-500 font-mono">Strictly .PNG format only</p>
                    </div>
                  )}
                </div>

                <div className="bg-amber-950/20 border border-amber-900/30 p-4 rounded-xl text-[9px] text-amber-500/80 font-mono uppercase leading-relaxed text-center">
                  By uploading this report, your identity and timestamp will be cryptographically embedded into the image pixels (Steganography).
                </div>

                <button 
                  type="submit" disabled={!selectedFile || uploading}
                  className="w-full py-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(56,189,248,0.2)] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? <Activity size={16} className="animate-spin" /> : <ShieldCheck size={16} />} 
                  Encrypt & Send
                </button>
              </form>
            )}
          </div>
        </div>
      )}

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

      {/* 🟢 LAB TECH SIDEBAR  */}
      <div className={`fixed inset-y-0 left-0 w-72 bg-slate-950 border-r border-slate-800/60 flex flex-col justify-between z-50 shadow-[4px_0_24px_rgba(0,0,0,0.4)] transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div>
          <div className="p-6 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/20">
            <div className="flex items-center gap-3">
              <FlaskConical className="w-10 h-10 text-sky-400 drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]" />
              <div>
                <h1 className="text-sm font-extrabold tracking-widest uppercase text-white leading-tight">MedCare<br/><span className="text-sky-400 text-[10px]">Lab Terminal</span></h1>
              </div>
            </div>
            {/* Phone Sidebar Close  */}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
          
          <div className="p-4 space-y-2 mt-4">
            <div className="w-full flex items-center gap-3 px-4 py-3 bg-sky-900/30 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(56,189,248,0.15)] transition-all cursor-default">
              <LayoutDashboard size={18} /> The Lab Hub
            </div>
            <Link href="/lab-tech/analytics" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <Activity size={18} /> Efficiency Matrix
            </Link>
            <Link href="/lab-tech/logs" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <ScrollText size={18} /> Activity Logs
            </Link>
            <Link href="/lab-tech/security" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
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

      {/* 🟢 MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto relative bg-slate-950">
        <div className="absolute top-0 right-0 w-[500px] md:w-[800px] h-[300px] md:h-[500px] bg-sky-500/5 rounded-full blur-[150px] pointer-events-none"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[length:24px_24px] pointer-events-none"></div>
        
        {/* Phone Padding (p-5 md:p-10)  */}
        <div className="p-5 md:p-10 max-w-6xl w-full mx-auto z-10 flex flex-col h-full">
          
          {/* 🟢 MOBILE HEADER & MENU BUTTON */}
          <div className="md:hidden flex items-center justify-between mb-6 pb-4 border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <FlaskConical className="w-8 h-8 text-sky-500" />
              <h1 className="text-xs font-extrabold tracking-widest uppercase text-white leading-tight">MedCare<br/><span className="text-sky-400 text-[9px]">Lab Terminal</span></h1>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Menu size={24} />
            </button>
          </div>

          <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-800 pb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-light tracking-widest uppercase text-white mb-1">
                Live <span className="font-bold text-sky-400">Operations</span>
              </h2>
              <p className="text-[10px] text-slate-400 tracking-widest uppercase font-mono">Clinical Blindness Active</p>
            </div>
            
            <div className="relative w-full md:w-80">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search size={16} className="text-slate-500" />
              </div>
              <input 
                type="text" 
                placeholder="Search Req ID or PID..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors font-mono"
              />
            </div>
          </div>

          {/* 🚨 ERROR BANNER */}
          {error && (
            <div className="mb-6 p-4 bg-red-950/40 border border-red-900/50 rounded-xl flex items-center justify-center gap-2 text-red-400 text-xs font-bold tracking-widest uppercase animate-fadeIn">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {/* Tabs - Phone */}
          <div className="flex flex-col md:flex-row bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800 mb-8 w-full md:w-max gap-1">
            <button 
              onClick={() => setActiveTab("new")}
              className={`flex-1 px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all flex items-center justify-center md:justify-start gap-2 ${
                activeTab === "new" ? "bg-sky-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-300 hover:bg-slate-800/50"
              }`}
            >
              New Requests <span className="bg-slate-950/50 px-2 py-0.5 rounded-md">{dashboardData.new_requests.length}</span>
            </button>
            <button 
              onClick={() => setActiveTab("pending")}
              className={`flex-1 px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all flex items-center justify-center md:justify-start gap-2 ${
                activeTab === "pending" ? "bg-amber-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-300 hover:bg-slate-800/50"
              }`}
            >
              Pending Uploads <span className="bg-slate-950/50 px-2 py-0.5 rounded-md">{dashboardData.pending_uploads.length}</span>
            </button>
            <button 
              onClick={() => setActiveTab("expired")}
              className={`flex-1 px-4 md:px-6 py-2.5 rounded-xl text-[10px] font-bold tracking-widest uppercase transition-all flex items-center justify-center md:justify-start gap-2 ${
                activeTab === "expired" ? "bg-red-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-300 hover:bg-slate-800/50"
              }`}
            >
              Expired Requests <span className="bg-slate-950/50 px-2 py-0.5 rounded-md">{dashboardData.expired_requests.length}</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center text-sky-500/50">
                <Activity size={40} className="animate-spin-slow mb-4" />
                <p className="text-xs uppercase tracking-widest font-bold">Syncing Records...</p>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/50 backdrop-blur-sm p-10">
                <CheckCircle2 size={48} className="text-slate-600 mb-4" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest text-center">No Records Found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-10">
                {filteredRecords.map((record: any) => (
                  <div key={record.req_id} className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition-all shadow-lg flex flex-col justify-between">
                    
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-[10px] font-bold text-sky-400 bg-sky-950/30 px-2 py-1 rounded inline-block uppercase tracking-widest mb-2 border border-sky-900/50">
                          Req ID: {record.req_id}
                        </div>
                        <h3 className="text-sm md:text-base font-bold text-white mb-1 truncate max-w-[150px] md:max-w-[200px]" title={record.patient_name}>{record.patient_name}</h3>
                        <p className="text-[10px] text-slate-500 font-mono">PID: {record.patient_pid}</p>
                      </div>
                      <div className="text-right pl-2">
                        <p className="text-[10px] md:text-xs font-bold text-slate-300 uppercase tracking-widest">{record.test_name}</p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-800/60 pt-4 mt-auto gap-3">
                      <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-mono uppercase">
                        <Clock size={12} />
                        {new Date(record.requested_time).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>

                      {activeTab === "new" || activeTab === "expired" ? (
                        <button 
                          onClick={() => handleCollectSample(record.req_id)}
                          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-600 text-emerald-400 hover:text-white rounded-lg text-[9px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-1.5"
                        >
                          <Droplet size={12} /> Collect Sample
                        </button>
                      ) : (
                        <button 
                          onClick={() => openUploadModal(record.req_id)}
                          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white rounded-lg text-[9px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(56,189,248,0.3)]"
                        >
                          <Upload size={12} /> Upload .PNG
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}