"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { 
  ShieldCheck, Home, Activity, CreditCard, Lock, LogOut, ArrowLeft, 
  Bot, Send, User, Loader2, CalendarCheck, CheckCircle2, ShieldAlert, 
  Calendar, RefreshCw 
} from "lucide-react";


interface ActionCardData {
  doctorUsername: string;
  doctorName: string;
  date: string;
  slotNumber: number;
}


interface ArabellaBanStatus {
  is_blocked: boolean;
  is_permanent?: boolean;
  blocked_until: string | null;
  reason: string | null;
}

export default function ArabellaChatPage() {
  const router = useRouter();
  
  const [messages, setMessages] = useState([
    { 
      sender: "arabella", 
      text: "Hello! I am Arabella, your MedCare AI assistant. How can I help you with your health today, or would you like to schedule an appointment with one of our specialists?",
      actionCard: null as ActionCardData | null,
      isConfirmed: false 
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmingSlot, setConfirmingSlot] = useState<number | null>(null);
  
  // 🔒 NEW: Micro-Segmented AI Restriction States
  const [banStatus, setBanStatus] = useState<ArabellaBanStatus>({
    is_blocked: false,
    is_permanent: false,
    blocked_until: null,
    reason: null
  });
  const [checkingStatus, setCheckingStatus] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  
  const fetchArabellaStatus = async () => {
    try {
      const token = localStorage.getItem("medcare_token");
      if (!token) {
        router.push("/login");
        return;
      }
      const res = await axios.get("http://localhost:8000/patients/me/arabella-status", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBanStatus(res.data);
    } catch (err) {
      
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    fetchArabellaStatus();
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading || banStatus.is_blocked) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { sender: "user", text: userMessage, actionCard: null, isConfirmed: false }]);
    setInput("");
    setLoading(true);

    try {
      const token = localStorage.getItem("medcare_token");
      const res = await axios.post("http://localhost:8000/chat", 
        { message: userMessage }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      let rawResponse: string = res.data.response || "";
      let cardData: ActionCardData | null = null;

      
      const cardMatch = rawResponse.match(/\[UI_ACTION_CARD:\s*DOCTOR_USER:\s*([^,]+),\s*DOCTOR_NAME:\s*([^,]+),\s*DATE:\s*([^,]+),\s*SLOT:\s*(\d+)\s*\]/i);
      
      if (cardMatch) {
        cardData = {
          doctorUsername: cardMatch[1].trim(),
          doctorName: cardMatch[2].trim(),
          date: cardMatch[3].trim(),
          slotNumber: parseInt(cardMatch[4].trim())
        };
        
        rawResponse = rawResponse.replace(/\[UI_ACTION_CARD:.*?\]/i, "").trim();
      }

      setMessages(prev => [...prev, { 
        sender: "arabella", 
        text: rawResponse,
        actionCard: cardData,
        isConfirmed: false 
      }]);

      
      if (
        rawResponse.includes("AUTO-BAN TRIGGERED") ||
        rawResponse.includes("SECURITY COOLDOWN") ||
        rawResponse.includes("ARABELLA AI ACCESS RESTRICTED")
      ) {
        await fetchArabellaStatus();
      }

    } catch (err: any) {
      setMessages(prev => [...prev, { 
        sender: "arabella", 
        text: "⚠️ I am currently experiencing a network interruption. Please try again in a moment.",
        actionCard: null,
        isConfirmed: false 
      }]);
    } finally {
      setLoading(false);
    }
  };

  
  const confirmBooking = async (msgIndex: number, card: ActionCardData) => {
    setConfirmingSlot(msgIndex);
    try {
      const token = localStorage.getItem("medcare_token");
      await axios.post("http://localhost:8000/appointments/ai-confirm", 
        { 
          doctor_username: card.doctorUsername,
          date: card.date,
          slot_number: card.slotNumber
        }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[msgIndex].isConfirmed = true;
        return newMsgs;
      });

    } catch (err: any) {
      alert(err.response?.data?.detail || "Sorry, an error occurred while confirming the booking. The slot might be taken.");
    } finally {
      setConfirmingSlot(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("medcare_token");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex font-sans overflow-hidden selection:bg-cyan-500/30">
      
      {/* SIDEBAR  */}
      <div className="w-64 bg-slate-950 border-r border-slate-800/60 flex flex-col justify-between hidden md:flex z-20 shadow-[4px_0_24px_rgba(0,0,0,0.4)]">
        <div>
          <div className="p-6 border-b border-slate-800/60 flex items-center gap-3 bg-slate-900/20">
            <ShieldCheck className="w-8 h-8 text-cyan-500 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
            <div>
              <h1 className="text-sm font-extrabold tracking-widest uppercase text-white leading-tight">MedCare<br/><span className="text-cyan-400 text-[10px]">Patient Portal</span></h1>
            </div>
          </div>
          
          <div className="p-4 space-y-2 mt-4">
            <Link href="/dashboard" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <Home size={18} /> Home
            </Link>
            <Link href="/dashboard/health-vault" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <Activity size={18} /> My Health Vault
            </Link>
            <Link href="/dashboard/billing" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <CreditCard size={18} /> Billing
            </Link>
            <Link href="/dashboard/security" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all text-slate-500 hover:text-slate-300 hover:bg-slate-900/50">
              <Lock size={18} /> Security & Privacy
            </Link>
          </div>
        </div>
        <div className="p-4 border-t border-slate-800/60 bg-slate-900/20 flex flex-col gap-3">
          <button onClick={handleLogout} className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-slate-900 hover:bg-red-950/40 border border-slate-800 hover:border-red-900/50 text-slate-400 hover:text-red-400 rounded-xl text-xs font-bold tracking-widest uppercase transition-all">
            <LogOut size={16} /> Secure Logout
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-slate-950">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
        <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        
        <div className="flex-1 max-w-5xl w-full mx-auto z-10 flex flex-col p-6 md:p-10 h-full">
          
          <div className="flex justify-between items-center mb-6">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-cyan-400 transition-colors">
              <ArrowLeft size={12} /> Back to Dashboard
            </Link>
            <div className="flex items-center gap-2 px-3 py-1 bg-cyan-950/30 border border-cyan-900/50 rounded-full">
              <ShieldCheck size={12} className="text-cyan-400" />
              <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest">MedCare Triage</span>
            </div>
          </div>

          {/* Header Bar */}
          <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-t-3xl p-6 shadow-lg flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 bg-slate-950 border rounded-full flex items-center justify-center shrink-0 ${
                banStatus.is_blocked 
                  ? "border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]" 
                  : "border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              }`}>
                {banStatus.is_blocked ? (
                  <Lock size={22} className="text-red-400" />
                ) : (
                  <Bot size={24} className="text-cyan-400" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-widest uppercase text-white">
                  ARABELLA <span className={banStatus.is_blocked ? "text-red-500" : "text-cyan-500"}>AI</span>
                </h2>
                <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                  {banStatus.is_blocked ? "🔒 AI Triage Access Suspended" : "🟢 Zero-Trust AI Firewall Protected"}
                </p>
              </div>
            </div>

            {banStatus.is_blocked && (
              <button
                onClick={() => {
                  setCheckingStatus(true);
                  fetchArabellaStatus();
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                <RefreshCw size={13} className={checkingStatus ? "animate-spin" : ""} />
                Check Status
              </button>
            )}
          </div>

          {/* Chat Window */}
          <div className="flex-1 bg-slate-900/50 border-x border-slate-800 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            
            {/* 🔒 MICRO-SEGMENTED RESTRICTION NOTICE BANNER */}
            {banStatus.is_blocked && (
              <div className="bg-red-950/30 border-2 border-red-500/40 rounded-3xl p-6 md:p-8 shadow-[0_0_40px_rgba(220,38,38,0.12)] my-auto mx-auto max-w-2xl w-full animate-fadeIn">
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-red-950/80 border border-red-500/50 flex items-center justify-center shrink-0">
                    <ShieldAlert size={26} className="text-red-400" />
                  </div>
                  <div>
                    <span className="inline-block px-2.5 py-0.5 rounded-md bg-red-500/20 border border-red-500/40 text-red-300 text-[10px] font-mono font-bold uppercase tracking-widest mb-1.5">
                      Micro-Segmented Security Restriction
                    </span>
                    <h3 className="text-base md:text-lg font-black text-white uppercase tracking-wider">
                      Arabella AI Access Temporarily Restricted
                    </h3>
                  </div>
                </div>

                <p className="text-xs md:text-sm text-slate-200 leading-relaxed mb-5 bg-slate-950/80 border border-red-900/50 rounded-2xl p-4 font-mono">
                  🔒 Your access to Arabella AI Assistant has been{" "}
                  {banStatus.is_permanent ? (
                    <span className="text-red-400 font-bold">permanently restricted</span>
                  ) : (
                    <>
                      temporarily restricted until{" "}
                      <span className="text-red-400 font-bold">{banStatus.blocked_until}</span>
                    </>
                  )}{" "}
                  due to security policy violations.
                </p>

                {banStatus.reason && (
                  <div className="mb-5 text-xs font-mono text-slate-400 bg-slate-950/50 p-3.5 rounded-xl border border-slate-800">
                    <span className="text-slate-500 uppercase font-bold block text-[10px] mb-1">
                      SIEM Policy Reason
                    </span>
                    <span className="text-amber-300">{banStatus.reason}</span>
                  </div>
                )}

                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 mb-6">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    <span className="text-cyan-400 font-bold uppercase tracking-wider">Patient Care Guarantee: </span>
                    Your main MedCare hospital account remains <span className="text-emerald-400 font-bold">100% active</span>. You can still book doctor appointments manually, view Lab Reports, and access E-Prescriptions.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/dashboard/book"
                    className="flex-1 min-w-[200px] py-3.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg"
                  >
                    <Calendar size={15} /> Manual Appointment Booking
                  </Link>
                  <Link
                    href="/dashboard/health-vault"
                    className="flex-1 min-w-[180px] py-3.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <Activity size={15} /> My Health Vault
                  </Link>
                </div>
              </div>
            )}

            {/* Chat Messages */}
            {(!banStatus.is_blocked || messages.length > 1) &&
              messages.map((msg, idx) => {
                const isSecurityAlert =
                  msg.sender === "arabella" &&
                  (msg.text.includes("SECURITY ALERT") ||
                    msg.text.includes("AUTO-BAN TRIGGERED") ||
                    msg.text.includes("SECURITY COOLDOWN") ||
                    msg.text.includes("Security Filter Activated"));

                return (
                  <div key={idx} className={`flex gap-4 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                        msg.sender === "arabella"
                          ? isSecurityAlert
                            ? "bg-red-950 border border-red-500/50"
                            : "bg-slate-950 border border-cyan-500/30"
                          : "bg-cyan-900 border border-cyan-500/50"
                      }`}
                    >
                      {msg.sender === "arabella" ? (
                        isSecurityAlert ? (
                          <ShieldAlert size={16} className="text-red-400" />
                        ) : (
                          <Bot size={16} className="text-cyan-400" />
                        )
                      ) : (
                        <User size={16} className="text-white" />
                      )}
                    </div>
                    <div className="flex flex-col gap-2 max-w-[80%]">
                      {/* Chat Text Bubble */}
                      {msg.text && (
                        <div
                          className={`rounded-2xl p-4 text-sm leading-relaxed ${
                            msg.sender === "arabella"
                              ? isSecurityAlert
                                ? "bg-red-950/40 border border-red-500/40 text-red-100 rounded-tl-sm"
                                : "bg-slate-800 text-slate-200 rounded-tl-sm"
                              : "bg-cyan-950/80 border border-cyan-900 text-cyan-50 rounded-tr-sm"
                          }`}
                        >
                          {msg.text.split("\n").map((line, i) => (
                            <p
                              key={i}
                              className={
                                line.includes("✅") ||
                                line.includes("⚠️") ||
                                line.includes("🔴") ||
                                line.includes("🔒") ||
                                line.includes("⏳")
                                  ? "mt-2 first:mt-0 font-bold"
                                  : "mb-2 last:mb-0"
                              }
                            >
                              {line.replace(/\*\*/g, "")}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* GENERATIVE UI ACTION CARD */}
                      {msg.actionCard && (
                        <div
                          className={`mt-2 border rounded-xl overflow-hidden shadow-lg transition-all duration-300 ${
                            msg.isConfirmed
                              ? "bg-emerald-950/30 border-emerald-500/50"
                              : "bg-slate-950 border-cyan-500/50"
                          }`}
                        >
                          <div
                            className={`px-4 py-3 flex items-center gap-3 border-b ${
                              msg.isConfirmed
                                ? "bg-emerald-900/40 border-emerald-900"
                                : "bg-cyan-950/40 border-slate-800"
                            }`}
                          >
                            <CalendarCheck
                              size={18}
                              className={msg.isConfirmed ? "text-emerald-400" : "text-cyan-400"}
                            />
                            <span
                              className={`text-[10px] font-bold tracking-widest uppercase ${
                                msg.isConfirmed ? "text-emerald-400" : "text-cyan-400"
                              }`}
                            >
                              {msg.isConfirmed ? "Appointment Confirmed" : "Pending Confirmation"}
                            </span>
                          </div>

                          <div className="p-4 flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">
                                Consultant
                              </span>
                              <span className="text-sm font-bold text-white">
                                Dr. {msg.actionCard.doctorName}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">
                                Date
                              </span>
                              <span className="text-sm font-bold text-white">{msg.actionCard.date}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">
                                Queue No.
                              </span>
                              <span className="text-sm font-bold text-white bg-slate-800 px-3 py-1 rounded-md">
                                {msg.actionCard.slotNumber}
                              </span>
                            </div>

                            <div className="mt-2">
                              {msg.isConfirmed ? (
                                <div className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-900/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold uppercase tracking-widest">
                                  <CheckCircle2 size={16} /> Booking Secured
                                </div>
                              ) : (
                                <button
                                  onClick={() => confirmBooking(idx, msg.actionCard!)}
                                  disabled={confirmingSlot === idx}
                                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                                >
                                  {confirmingSlot === idx ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    "Confirm Booking"
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            
            {loading && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-950 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-1">
                  <Bot size={16} className="text-cyan-400" />
                </div>
                <div className="bg-slate-800 rounded-2xl rounded-tl-sm p-4 flex items-center gap-2">
                  <Loader2 size={16} className="text-cyan-400 animate-spin" />
                  <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Arabella is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area (Locked when restricted) */}
          <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-b-3xl p-6">
            {banStatus.is_blocked ? (
              <div className="w-full bg-slate-950/90 border border-red-900/50 rounded-2xl px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs font-mono text-red-400">
                  <Lock size={16} className="shrink-0" />
                  <span>
                    Chat input locked until{" "}
                    <strong className="text-white">{banStatus.blocked_until}</strong>. Use manual booking for appointments.
                  </span>
                </div>
                <Link
                  href="/dashboard/book"
                  className="px-4 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 rounded-xl text-[10px] font-bold uppercase tracking-widest shrink-0 transition-all"
                >
                  Book Manually →
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSend} className="relative flex items-center">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your medical query or ask for an appointment..."
                  disabled={loading || checkingStatus}
                  className="w-full bg-slate-950 border border-slate-700 rounded-2xl pl-6 pr-16 py-4 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-50"
                />
                <button 
                  type="submit" 
                  disabled={!input.trim() || loading || checkingStatus}
                  className="absolute right-3 w-10 h-10 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl flex items-center justify-center transition-all disabled:opacity-50"
                >
                  <Send size={18} className="ml-1" />
                </button>
              </form>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}