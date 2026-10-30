"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { 
  ShieldCheck, Home, LogOut, ArrowLeft, Calendar as CalendarIcon, 
  CheckCircle2, AlertTriangle, ChevronLeft, ChevronRight, Activity, Clock, User, Lock
} from "lucide-react";

export default function BookAppointmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState({ text: "", type: "" });

  const [availableSchedules, setAvailableSchedules] = useState<{ [key: string]: any[] }>({});
  // 🛡️ Track patient's own active appointments to enforce 1 slot per doctor per day in UI
  const [myActiveAppointments, setMyActiveAppointments] = useState<any[]>([]);
  
  // 🟢 Dynamic Calendar States (Local Date)
  const [currentDate, setCurrentDate] = useState(new Date());
  const now = new Date();
  const todayDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  // 🟢 3-Step Booking Flow States
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<any | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("medcare_token");
    if (!token) { router.push("/login"); return; }
    fetchSchedulesAndMyBookings(token);
  }, [router]);

  const fetchSchedulesAndMyBookings = async (token: string) => {
    try {
      const [schedRes, myAptRes] = await Promise.all([
        axios.get("http://localhost:8000/schedules/available", {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get("http://localhost:8000/appointments/me/upcoming", {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: { appointments: [] } }))
      ]);
      
      const currentTime = new Date();
      const groupedData: { [key: string]: any[] } = {};

      if (Array.isArray(schedRes.data)) {
        schedRes.data.forEach((schedule: any) => {
          if (schedule.date === todayDateString && schedule.end_time) {
            const [year, month, day] = schedule.date.split("-").map(Number);
            const [hours, minutes] = schedule.end_time.split(":").map(Number);
            const scheduleEnd = new Date(year, month - 1, day, hours, minutes, 0);
            if (currentTime >= scheduleEnd) {
              return;
            }
          }

          if (!groupedData[schedule.date]) groupedData[schedule.date] = [];
          groupedData[schedule.date].push(schedule);
        });
      }
      setAvailableSchedules(groupedData);
      setMyActiveAppointments(myAptRes.data?.appointments || []);
    } catch (err) { 
      console.error(err); 
    } finally { 
      setFetching(false); 
    }
  };

  // 🛡️ Helper: Check if the logged-in patient already has a booking with this doctor on this date
  const getExistingBookingForDoctor = (dateStr: string | null, docObj: any) => {
    if (!dateStr || !docObj) return null;
    const cleanDocName = (docObj.doctor_name || "").toLowerCase().replace(/^dr\.?\s*/i, "").trim();
    const cleanDocUser = (docObj.doctor_username || "").toLowerCase().trim();

    return myActiveAppointments.find((apt: any) => {
      if (apt.date !== dateStr || apt.status === "Cancelled") return false;
      const aptDoc = (apt.doctor_name || "").toLowerCase().replace(/^dr\.?\s*/i, "").trim();
      return aptDoc === cleanDocName || aptDoc === cleanDocUser;
    });
  };

  const handleConfirmBooking = async () => {
    if (!selectedDate || !selectedDoctor || !selectedSlot) return;
    setLoading(true);
    setMessage({ text: "", type: "" });

    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) {
        router.push("/login");
        return;
      }
      
      await axios.post(
        "http://localhost:8000/appointments/", 
        {
          doctor_name: selectedDoctor.doctor_username || selectedDoctor.doctor_name,
          date: selectedDate,
          slot_number: selectedSlot
        }, 
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          } 
        }
      );

      setMessage({ text: `Successfully booked Slot ${selectedSlot} with Dr. ${selectedDoctor.doctor_name} on ${selectedDate}.`, type: "success" });
      setSelectedDoctor(null); 
      setSelectedSlot(null);
      
      // Auto-refresh schedules and patient bookings to lock the doctor/slot
      fetchSchedulesAndMyBookings(token);

    } catch (err: any) {
      let errorText = "Booking failed.";
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        errorText = Array.isArray(detail) ? detail.map((d:any) => d.msg).join(', ') : typeof detail === 'string' ? detail : JSON.stringify(detail);
      }
      setMessage({ text: errorText, type: "error" });
    } finally { setLoading(false); }
  };

  const handleLogout = () => { localStorage.removeItem("medcare_token"); router.push("/login"); };

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const emptySlotsCount = firstDayOfMonth;
  
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const existingDoctorBooking = getExistingBookingForDoctor(selectedDate, selectedDoctor);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex font-sans overflow-hidden">
      
      {/* SIDEBAR NAVIGATION */}
      <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col justify-between hidden md:flex z-10 shadow-2xl">
        <div>
          <div className="p-6 border-b border-slate-800 flex items-center gap-3">
            <ShieldCheck className="w-10 h-10 text-emerald-400" />
            <div><h1 className="text-sm font-bold tracking-widest uppercase text-white">MedCare<br/><span className="text-emerald-400">Patient Portal</span></h1></div>
          </div>
          <div className="p-4 space-y-2 mt-4">
            <Link href="/dashboard" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"><Home size={18} /> Home</Link>
          </div>
        </div>
        <div className="p-4 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-red-950/40 border border-red-900 text-red-400 rounded-xl text-xs font-bold tracking-widest uppercase hover:bg-red-900/60"><LogOut size={16} /> Secure Logout</button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-screen overflow-y-auto p-8 md:p-12 max-w-7xl mx-auto relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>

        <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-500 hover:text-emerald-400 mb-6 text-[10px] font-bold uppercase tracking-widest z-10">
          <ArrowLeft size={14} /> Back to Dashboard
        </Link>

        <div className="mb-8 z-10">
          <h2 className="text-3xl font-light tracking-widest uppercase text-white mb-1">
            Interactive <span className="font-bold text-emerald-400">Booking</span>
          </h2>
          <p className="text-xs text-slate-500 tracking-widest uppercase">Step-by-step appointment scheduling (Max 1 slot per doctor/day)</p>
        </div>

        {message.text && (
          <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 z-10 animate-fadeIn ${message.type === "success" ? "bg-emerald-950/80 border-emerald-900 text-emerald-300" : "bg-red-950/80 border-red-900 text-red-300"}`}>
            {message.type === "success" ? <CheckCircle2 size={20} className="shrink-0 mt-0.5" /> : <AlertTriangle size={20} className="shrink-0 mt-0.5" />}
            <p className="text-sm font-medium leading-relaxed">{message.text}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 z-10">
          
          {/* 🟢 STEP 1: DYNAMIC CALENDAR */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col h-full">
            <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-xs font-bold tracking-widest uppercase text-emerald-400 mb-1">Step 1</h3>
                <p className="text-[10px] text-slate-500 uppercase">Select a Date</p>
              </div>
              <div className="flex items-center gap-4 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
                <button onClick={prevMonth} className="p-1 hover:text-emerald-400 transition-colors"><ChevronLeft size={16} /></button>
                <span className="text-xs font-bold uppercase tracking-widest w-28 text-center text-white">{monthName} {currentYear}</span>
                <button onClick={nextMonth} className="p-1 hover:text-emerald-400 transition-colors"><ChevronRight size={16} /></button>
              </div>
            </div>

            {fetching ? (
              <div className="flex-1 flex flex-col items-center justify-center"><Activity size={32} className="animate-spin text-emerald-500 mb-3"/><span className="text-xs uppercase tracking-widest text-slate-500">Syncing Calendar...</span></div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-2 text-center mb-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{d}</div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: emptySlotsCount }).map((_, i) => (<div key={`empty-${i}`} className="h-16 md:h-20"></div>))}

                  {daysArray.map((day) => {
                    const formattedDate = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                    const daySchedules = availableSchedules[formattedDate];
                    const isSelected = selectedDate === formattedDate;
                    const isPast = formattedDate < todayDateString;

                    return (
                      <button
                        key={day}
                        onClick={() => {
                          if (daySchedules && !isPast) {
                            setSelectedDate(formattedDate);
                            setSelectedDoctor(null); setSelectedSlot(null);
                          }
                        }}
                        disabled={!daySchedules || isPast}
                        className={`h-16 md:h-20 rounded-2xl border flex flex-col items-center justify-center gap-1 transition-all relative ${
                          isPast ? "bg-slate-950/20 border-slate-900 text-slate-800 cursor-not-allowed" 
                          : isSelected ? "bg-emerald-600 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)] text-white" 
                          : daySchedules ? "bg-slate-950 border-slate-700 hover:border-emerald-500 cursor-pointer" 
                          : "bg-slate-950/50 border-slate-900 text-slate-600 cursor-not-allowed" 
                        }`}
                      >
                        <span className={`text-xs md:text-sm font-bold ${isSelected ? "text-white" : isPast ? "text-slate-700" : "text-slate-300"}`}>{day}</span>
                        
                        {/* 🟢 INITIALS DISPLAY */}
                        {daySchedules && !isPast && (
                          <div className="flex flex-wrap gap-1 justify-center px-1">
                            {daySchedules.slice(0, 3).map((doc: any, idx: number) => (
                              <span key={idx} className={`px-1 py-0.5 text-[8px] md:text-[9px] font-black rounded-md ${isSelected ? "bg-emerald-950 text-emerald-400" : "bg-emerald-900/60 border border-emerald-700 text-emerald-300"}`}>
                                {doc.initials}
                              </span>
                            ))}
                            {daySchedules.length > 3 && <span className="text-[8px] text-slate-500 font-bold">+{daySchedules.length - 3}</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* 🟢 STEP 2 & 3: DOCTOR & SLOT SELECTION */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex-1">
              <div className="mb-6 border-b border-slate-800 pb-4">
                 <h3 className="text-xs font-bold tracking-widest uppercase text-cyan-400 mb-1">Step 2</h3>
                 <p className="text-[10px] text-slate-500 uppercase">Select Consultant {selectedDate && `for ${selectedDate}`}</p>
              </div>

              {!selectedDate ? (
                <div className="flex flex-col items-center justify-center text-center text-slate-600 py-10">
                  <CalendarIcon size={40} className="mb-3 opacity-20" />
                  <p className="text-[10px] tracking-widest uppercase">Select a date first</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {availableSchedules[selectedDate]?.map((doc: any, idx: number) => {
                    const alreadyBookedThisDoc = getExistingBookingForDoctor(selectedDate, doc);

                    return (
                      <div 
                        key={idx} 
                        onClick={() => { setSelectedDoctor(doc); setSelectedSlot(null); }} 
                        className={`border rounded-2xl p-4 cursor-pointer transition-all ${
                          selectedDoctor?.id === doc.id ? "bg-cyan-950/40 border-cyan-500 shadow-lg" : "bg-slate-950 border-slate-800 hover:border-slate-600"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 shrink-0">
                              <User size={16} className={selectedDoctor?.id === doc.id ? "text-cyan-400" : "text-slate-500"} />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-white leading-tight">Dr. {doc.doctor_name}</h4>
                              <p className="text-[9px] text-slate-500 tracking-widest uppercase">{doc.specialization}</p>
                            </div>
                          </div>

                          {alreadyBookedThisDoc && (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-700/60 text-amber-400 text-[8px] font-mono font-bold uppercase tracking-widest shrink-0">
                              Booked (Slot #{String(alreadyBookedThisDoc.slot_number).padStart(2, '0')})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400 bg-cyan-950/30 px-3 py-1.5 rounded-lg w-max mt-3">
                          <Clock size={12} /> {doc.start_time} - {doc.end_time}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedDoctor && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl animate-fadeIn">
                <div className="mb-6 border-b border-slate-800 pb-4">
                   <h3 className="text-xs font-bold tracking-widest uppercase text-emerald-400 mb-1">Step 3</h3>
                   <p className="text-[10px] text-slate-500 uppercase">Select Available Slot</p>
                </div>

                {existingDoctorBooking ? (
                  <div className="bg-amber-950/30 border border-amber-800/60 rounded-2xl p-6 text-center space-y-2">
                    <Lock size={28} className="text-amber-400 mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
                      1 Slot Limit Reached for Dr. {selectedDoctor.doctor_name}
                    </p>
                    <p className="text-[11px] text-slate-300 font-mono leading-relaxed">
                      You have already booked <strong>Slot #{String(existingDoctorBooking.slot_number).padStart(2, '0')}</strong> ({existingDoctorBooking.reference_number}) on {selectedDate}. You may book another consultant on this date or select a different date.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 mb-6">
                      {Array.from({ length: selectedDoctor.max_patients || 10 }, (_, i) => i + 1).map((slotNum) => {
                        const isBooked = selectedDoctor.booked_slots?.includes(slotNum);
                        return (
                          <button
                            key={slotNum} disabled={isBooked} onClick={() => setSelectedSlot(slotNum)}
                            className={`py-3 rounded-xl text-xs font-bold uppercase font-mono transition-all ${
                              isBooked ? "bg-red-950/20 border border-red-900/30 text-red-500/50 cursor-not-allowed line-through" 
                              : selectedSlot === slotNum ? "bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] scale-110" 
                              : "bg-slate-950 border border-slate-800 text-slate-300 hover:border-emerald-500 cursor-pointer"
                            }`}
                          >
                            {String(slotNum).padStart(2, '0')}
                          </button>
                        );
                      })}
                    </div>

                    {selectedSlot && (
                      <button onClick={handleConfirmBooking} disabled={loading} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-50 flex justify-center items-center gap-2 animate-fadeIn">
                        {loading ? <><Activity size={16} className="animate-spin" /> Processing...</> : `Confirm Slot ${selectedSlot}`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}