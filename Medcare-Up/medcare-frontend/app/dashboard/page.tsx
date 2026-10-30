"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { 
  ShieldCheck, Home, Bot, Bell, CalendarPlus, 
  CalendarClock, LogOut, User, Activity, CreditCard, LockKeyhole,
  Menu, X 
} from "lucide-react";

export default function PatientDashboard() {
  const router = useRouter();
  const [patientName, setPatientName] = useState("Patient");
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("medcare_token");
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchDashboardData = async () => {
      try {
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const [profileRes, notifRes] = await Promise.all([
          axios.get("http://localhost:8000/patients/me/profile", config),
          axios.get("http://localhost:8000/patients/me/notifications", config)
        ]);
        
        setPatientName(profileRes.data.first_name || "Patient");
        
        const unreadExists = notifRes.data.some((n: any) => n.is_read === false);
        setHasUnreadNotifications(unreadExists);

      } catch (err) {
        console.error("Dashboard sync error", err);
      }
    };

    fetchDashboardData();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("medcare_token");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex font-sans overflow-hidden print:bg-white print:text-black print:h-auto print:overflow-visible">      
      
      {/* 🟢 MOBILE OVERLAY BACKGROUND  */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden print:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 🟢 FIXED SIDEBAR NAVIGATION  */}
      <div className={`fixed inset-y-0 left-0 w-72 bg-slate-900 border-r border-slate-800 flex flex-col justify-between z-50 shadow-[4px_0_24px_rgba(0,0,0,0.4)] transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 print:hidden ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>        
        <div>
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-10 h-10 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]" />
              <div>
                <h1 className="text-sm font-bold tracking-widest uppercase text-white leading-tight">MedCare<br/><span className="text-cyan-400">Patient Portal</span></h1>
              </div>
            </div>
            {/* 🟢 Phone  */}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
          
          <div className="p-4 space-y-2 mt-4">
            <button className="w-full flex items-center gap-3 px-4 py-3 bg-cyan-900/50 text-cyan-400 border border-cyan-800 rounded-xl text-xs font-bold tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(6,182,212,0.1)] cursor-default">
              <Home size={18} /> Home
            </button>
            <Link href="/dashboard/health-vault" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-800/50">
              <Activity size={18} /> My Health Vault
            </Link>
            <Link href="/dashboard/billing" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-800/50">
              <CreditCard size={18} /> Billing
            </Link>
            <Link href="/dashboard/security" onClick={() => setIsSidebarOpen(false)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-800/50">
              <LockKeyhole size={18} /> Security & Privacy
            </Link>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-slate-800/30 rounded-xl border border-slate-700/50">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
              <User size={16} className="text-slate-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white tracking-widest uppercase">{patientName}</span>
              <span className="text-[9px] text-emerald-400 tracking-widest uppercase">Verified Access</span>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-red-950/40 border border-red-900 text-red-400 hover:bg-red-900/60 rounded-xl text-xs font-bold tracking-widest uppercase transition-colors">
            <LogOut size={16} /> Secure Logout
          </button>
        </div>
      </div>

      {/* 🟢 MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto relative print:h-auto print:overflow-visible print:bg-white print:text-black">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none"></div>
        
        {/* Phone වලට පෙනෙන පරිදි Padding (p-6 md:p-12) වෙනස් කර ඇත */}
        <div className="p-6 md:p-12 max-w-5xl w-full mx-auto z-10">
          
          {/* 🟢 MOBILE HEADER & MENU BUTTON */}
          <div className="md:hidden flex items-center justify-between mb-8 pb-4 border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-cyan-500" />
              <h1 className="text-xs font-extrabold tracking-widest uppercase text-white leading-tight">MedCare<br/><span className="text-cyan-400 text-[9px]">Patient Portal</span></h1>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Menu size={24} />
            </button>
          </div>

          <div className="mb-10">
            <h2 className="text-2xl md:text-3xl font-light tracking-widest uppercase text-white mb-2">
              Welcome to your <span className="font-bold text-cyan-400">Dashboard</span>
            </h2>
            <p className="text-[10px] md:text-xs text-slate-500 tracking-widest uppercase">Select an option below to manage your healthcare</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <Link href="/arabella" className="group bg-slate-900 border border-slate-800 p-8 rounded-3xl relative overflow-hidden hover:border-cyan-500 transition-all shadow-lg hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]">
              <div className="absolute -right-4 -top-4 w-32 h-32 bg-cyan-900/20 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all"></div>
              <div className="w-14 h-14 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:border-cyan-500">
                <Bot className="w-7 h-7 text-cyan-400" />
              </div>
              <h3 className="text-xl font-bold text-white tracking-widest uppercase mb-2">Ask <span className="text-cyan-400">Arabella AI</span></h3>
              <p className="text-xs text-slate-500 tracking-wide leading-relaxed">
                Describe your symptoms. Get instant medical advice through AI technology and get directed to the right specialist.
              </p>
            </Link>

            <Link href="/dashboard/notifications" className="group bg-slate-900 border border-slate-800 p-8 rounded-3xl relative overflow-hidden hover:border-amber-500 transition-all shadow-lg hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]">
              <div className="absolute -right-4 -top-4 w-32 h-32 bg-amber-900/20 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all"></div>
              <div className="w-14 h-14 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:border-amber-500">
                <Bell className="w-7 h-7 text-amber-400" />
              </div>
              
              {hasUnreadNotifications && (
                <div className="absolute top-8 right-8 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </span>
                  <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">New</span>
                </div>
              )}

              <h3 className="text-xl font-bold text-white tracking-widest uppercase mb-2">Notifications</h3>
              <p className="text-xs text-slate-500 tracking-wide leading-relaxed">
                View important system messages, laboratory report releases, and medical announcements here.
              </p>
            </Link>

            <Link href="/dashboard/book" className="group bg-slate-900 border border-slate-800 p-8 rounded-3xl relative overflow-hidden hover:border-emerald-500 transition-all shadow-lg hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]">
              <div className="absolute -right-4 -top-4 w-32 h-32 bg-emerald-900/20 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
              <div className="w-14 h-14 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:border-emerald-500">
                <CalendarPlus className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white tracking-widest uppercase mb-2">Book Appointment</h3>
              <p className="text-xs text-slate-500 tracking-wide leading-relaxed">
                Check your preferred doctor's schedule and easily book a new appointment (channeling) through the system.
              </p>
            </Link>

            <Link href="/dashboard/appointments" className="group bg-slate-900 border border-slate-800 p-8 rounded-3xl relative overflow-hidden hover:border-purple-500 transition-all shadow-lg hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]">
              <div className="absolute -right-4 -top-4 w-32 h-32 bg-purple-900/20 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
              <div className="w-14 h-14 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:border-purple-500">
                <CalendarClock className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white tracking-widest uppercase mb-2">Upcoming Visits</h3>
              <p className="text-xs text-slate-500 tracking-wide leading-relaxed">
                View your list of upcoming booked medical appointments, check their status, and cancel them if necessary.
              </p>
            </Link>

          </div>
        </div>
      </div>
    </div>
  );
}