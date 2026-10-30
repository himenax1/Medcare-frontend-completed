"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { 
  ShieldCheck, LayoutDashboard, Receipt, CalendarClock, Users, Fingerprint, 
  UserCog, LogOut, CalendarDays, Search, Save, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle
} from "lucide-react";

export default function ScheduleManagementPage() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [existingSchedules, setExistingSchedules] = useState<string[]>([]);
  const [selectedDoctorName, setSelectedDoctorName] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [formData, setFormData] = useState({ startTime: "09:00", endTime: "12:00", maxPatients: 10 });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" | "" }>({ text: "", type: "" });

  // 🟢 Dynamic Month Navigation State
  const [viewDate, setViewDate] = useState(new Date());

  useEffect(() => {
    const token = localStorage.getItem("medcare_token");
    if (!token) { router.push("/login"); return; }
    axios.get("http://localhost:8000/admin/users/", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setDoctors(res.data.filter((u: any) => u.role === "Doctor" && u.is_active !== false)))
      .catch(err => console.error(err));
  }, [router]);

  const selectDoctor = async (username: string, fullName: string) => {
    setSelectedDoctorName(username);
    const displayName = fullName ? `Dr. ${fullName}` : `Dr. (Profile Not Updated)`;
    setSearchTerm(`${displayName} [${username}]`);
    setDropdownOpen(false);
    setSelectedDate("");
    setStatusMsg({ text: "", type: "" });
    
    try {
      const res = await axios.get(`http://localhost:8000/admin/schedules/doctor/${username}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("medcare_token")}` }
      });
      setExistingSchedules(res.data);
    } catch (err) { console.error(err); }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ text: "", type: "" });

    if (!selectedDoctorName || !selectedDate) {
      setStatusMsg({ text: "Please select both a Doctor and a future Date!", type: "error" });
      return;
    }

    if (selectedDate <= todayDateString) {
      setStatusMsg({ text: "Schedules cannot be created for today or past dates. Please select a date starting from tomorrow.", type: "error" });
      return;
    }

    if (formData.endTime <= formData.startTime) {
      setStatusMsg({ text: "End time must be later than Start time!", type: "error" });
      return;
    }

    try {
      await axios.post("http://localhost:8000/admin/schedules/", {
        doctor_name: selectedDoctorName, 
        date: selectedDate, 
        start_time: formData.startTime, 
        end_time: formData.endTime, 
        max_patients: formData.maxPatients
      }, { headers: { Authorization: `Bearer ${localStorage.getItem("medcare_token")}` } });
      
      setStatusMsg({ text: `Schedule successfully created for ${selectedDate}!`, type: "success" });
      setExistingSchedules([...existingSchedules, selectedDate]);
      setSelectedDate("");
    } catch (err: any) { 
      setStatusMsg({ text: err.response?.data?.detail || "Error occurred while creating schedule.", type: "error" }); 
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("medcare_token");
    router.push("/login");
  };

  // 🟢 Search EXCLUSIVELY by Doctor ID (username) or Name
  const filteredDoctors = doctors.filter(d => 
    d.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.full_name && d.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  const today = new Date();
  const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  
  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();  
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay(); 
  const emptySlotsCount = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const prevMonth = () => setViewDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setViewDate(new Date(currentYear, currentMonth + 1, 1));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <div className="w-72 bg-slate-950 border-r border-slate-800/60 flex flex-col justify-between hidden md:flex z-20 shadow-[4px_0_24px_rgba(0,0,0,0.4)]">
        <div>
          <div className="p-6 border-b border-slate-800/60 flex items-center gap-3 bg-slate-900/20">
            <ShieldCheck className="w-10 h-10 text-indigo-500 drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
            <div>
              <h1 className="text-sm font-extrabold tracking-widest uppercase text-white leading-tight">MedCare<br/><span className="text-indigo-400 text-[10px]">Admin Console</span></h1>
            </div>
          </div>
          <div className="p-4 space-y-2 mt-4">
            <Link href="/admin" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50"><LayoutDashboard size={18} /> Command Center</Link>
            <Link href="/admin/billing" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50"><Receipt size={18} /> Automated Billing</Link>
            <div className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-900/30 text-indigo-400 border border-indigo-500/30 rounded-xl text-xs font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all"><CalendarClock size={18} /> Schedule & Ops</div>
            <Link href="/admin/employees" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50"><Users size={18} /> Employee Management</Link>
            <Link href="/admin/forensics" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50 group"><Fingerprint size={18} className="group-hover:text-red-400 transition-colors" /> Digital Forensics</Link>
            <Link href="/admin/security" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50"><UserCog size={18} /> Profile & Security</Link>
          </div>
        </div>
        <div className="p-4 border-t border-slate-800/60 bg-slate-900/20">
          <button onClick={handleLogout} className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-slate-900 hover:bg-red-950/40 border border-slate-800 hover:border-red-900/50 text-slate-400 hover:text-red-400 rounded-xl text-xs font-bold tracking-widest uppercase transition-all"><LogOut size={16} /> Secure Logout</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10">
        <div className="mb-8">
          <h2 className="text-3xl font-light text-white tracking-widest uppercase mb-1">Doctor <span className="font-bold text-indigo-500">Scheduling</span></h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Advance Roster Management (Same-day & past-date scheduling is locked)</p>
        </div>

        {statusMsg.text && (
          <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 text-xs font-mono font-bold animate-fadeIn ${
            statusMsg.type === "success" 
              ? "bg-emerald-950/50 border-emerald-800 text-emerald-300" 
              : "bg-red-950/50 border-red-800 text-red-300"
          }`}>
            {statusMsg.type === "success" ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertTriangle size={18} className="shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}
        
        {/* 🟢 Searchable Dropdown */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-6 relative">
          <label className="block text-[10px] text-slate-400 uppercase font-bold mb-3">Search & Select Doctor by ID</label>
          <div className="relative">
            <Search className="absolute left-4 top-3 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search by Doctor ID (e.g. D3555)..." 
              value={searchTerm}
              onClick={() => setDropdownOpen(true)}
              onChange={(e) => { setSearchTerm(e.target.value); setDropdownOpen(true); }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-indigo-500 transition-colors font-mono"
            />
            {dropdownOpen && (
              <div className="absolute top-full left-0 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden z-50 max-h-48 overflow-y-auto shadow-2xl">
                {filteredDoctors.length > 0 ? filteredDoctors.map(doc => (
                  <div key={doc.id} onClick={() => selectDoctor(doc.username, doc.full_name)} className="p-4 hover:bg-indigo-600 cursor-pointer border-b border-slate-700/50 transition-colors flex justify-between items-center">
                    <span className="text-sm font-bold text-white">Dr. {doc.full_name || "Name Not Set"}</span>
                    <span className="text-xs text-slate-300 font-mono bg-slate-950/50 px-2 py-1 rounded">ID: {doc.username}</span>
                  </div>
                )) : (
                  <div className="p-4 text-sm text-slate-400 text-center font-mono">No doctors found matching this ID.</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold text-slate-300 uppercase flex items-center gap-2">
                <CalendarDays size={16} className="text-indigo-400"/> Select Future Date
              </h3>
              <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
                <button type="button" onClick={prevMonth} className="p-1 hover:text-indigo-400 transition-colors"><ChevronLeft size={15}/></button>
                <span className="text-[11px] font-bold uppercase tracking-widest text-white w-28 text-center">
                  {viewDate.toLocaleString('default', { month: 'long' })} {currentYear}
                </span>
                <button type="button" onClick={nextMonth} className="p-1 hover:text-indigo-400 transition-colors"><ChevronRight size={15}/></button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-2">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => (<div key={day} className="text-center text-[10px] font-bold text-slate-500 uppercase">{day}</div>))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: emptySlotsCount }).map((_, i) => (<div key={`empty-${i}`} className="h-11"></div>))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const dayStr = String(i+1).padStart(2,'0');
                const monthStr = String(currentMonth + 1).padStart(2,'0');
                const dateStr = `${currentYear}-${monthStr}-${dayStr}`;
                const isBooked = existingSchedules.includes(dateStr);
                const isToday = dateStr === todayDateString;
                // 🛡️ STRICT LOCK: Both Past Dates AND Today (dateStr <= todayDateString) are disabled!
                const isLockedDate = dateStr <= todayDateString;
                
                return (
                  <button 
                    key={i} 
                    type="button"
                    onClick={() => !isBooked && !isLockedDate && setSelectedDate(dateStr)} 
                    disabled={isBooked || isLockedDate || !selectedDoctorName}
                    title={isToday ? "Same-day schedule creation is locked" : isBooked ? "Already scheduled" : ""}
                    className={`h-11 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center relative ${
                      isLockedDate 
                        ? 'bg-slate-950/30 text-slate-700 cursor-not-allowed border border-slate-900/80'
                        : isBooked 
                          ? 'bg-indigo-950/40 text-indigo-700 cursor-not-allowed border border-indigo-900/50'
                          : selectedDate === dateStr 
                            ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]' 
                            : 'bg-slate-950 text-slate-300 hover:border-indigo-500 border border-slate-800 cursor-pointer'
                    }`}
                  >
                    <span>{i + 1}</span>
                    {isToday && <span className="text-[7px] uppercase tracking-tighter text-amber-500/60 font-mono leading-none">Today</span>}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <form onSubmit={handleSaveSchedule} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-[10px] text-slate-400 uppercase mb-2">Start</label><input type="time" value={formData.startTime} onChange={e=>setFormData({...formData, startTime: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white [color-scheme:dark]"/></div>
                <div><label className="block text-[10px] text-slate-400 uppercase mb-2">End</label><input type="time" value={formData.endTime} onChange={e=>setFormData({...formData, endTime: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white [color-scheme:dark]"/></div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 uppercase mb-2">Max Patients</label>
                <input type="number" min={1} max={100} value={formData.maxPatients} onChange={e=>setFormData({...formData, maxPatients: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white" />
              </div>
              <button type="submit" disabled={!selectedDoctorName || !selectedDate} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold uppercase transition-all"><Save size={16} className="inline mr-2"/> Generate Schedule {selectedDate && `for ${selectedDate}`}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}