import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Wallet,
  UserCog,
  Users,
  BarChart3,
  Code2,
  GraduationCap,
  Menu,
  X,
  Search,
  ChevronDown,
  Bell,
  Newspaper,
  Receipt,
  BookOpen,
  ClipboardList,
  FileText,
  Award,
  MessageSquare,
  CalendarDays,
  Trophy,
  Palette,
  Languages,
  Zap,
  Settings,
  Building2,
  BookCheck,
  ListChecks,
  GraduationCap as GradIcon,
  PencilRuler,
  QrCode,
  ClipboardCheck,
  CalendarCheck,
  Bus,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Dashboard } from "@/modules/Dashboard";
import { StudentsModule } from "@/modules/StudentsModule";
import { FinanceModule } from "@/modules/FinanceModule";
import { HRModule } from "@/modules/HRModule";
import { AnalyticsModule } from "@/modules/AnalyticsModule";
import { ApiDocsModule } from "@/modules/ApiDocsModule";
import { ClassAttendanceModule } from "@/modules/ClassAttendanceModule";
import { TransportModule } from "@/modules/TransportModule";
import { ExamsModule } from "@/modules/ExamsModule";
import { ParentCommunicationModule } from "@/modules/ParentCommunicationModule";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AIAssistantWidget } from "@/components/AIAssistantWidget";

type ModuleKey =
  | "dashboard"
  | "students"
  | "finance"
  | "hr"
  | "analytics"
  | "api"
  | "attendance"
  | "transport"
  | "exams"
  | "communication";

type NavItem = { key: ModuleKey; label: string; icon: React.ReactNode; group: string };

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} />, group: "Overview" },

  // MANAGEMENT
  { key: "finance", label: "Finance & Fees", icon: <Wallet size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "Accounts", icon: <BookOpen size={17} />, group: "MANAGEMENT" },
  { key: "students", label: "Student Information", icon: <Users size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "Academics", icon: <BookCheck size={17} />, group: "MANAGEMENT" },
  { key: "attendance", label: "Class Attendance", icon: <CalendarCheck size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "Front Office", icon: <ClipboardList size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "Offline Examinations", icon: <FileText size={17} />, group: "MANAGEMENT" },
  { key: "exams", label: "External Examinations", icon: <Trophy size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "CBC Academics", icon: <ListChecks size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "Online Examinations", icon: <GradIcon size={17} />, group: "MANAGEMENT" },
  { key: "hr", label: "Human Resource", icon: <UserCog size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "PTM Meetings", icon: <CalendarDays size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "Lesson Planner", icon: <PencilRuler size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "OSM Module", icon: <ClipboardCheck size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "QR Code Attendance", icon: <QrCode size={17} />, group: "MANAGEMENT" },
  { key: "dashboard", label: "Assessment", icon: <Award size={17} />, group: "MANAGEMENT" },

  // MODULES
  { key: "dashboard", label: "Study Center", icon: <BookOpen size={17} />, group: "MODULES" },
  { key: "dashboard", label: "Certificates", icon: <Award size={17} />, group: "MODULES" },
  { key: "dashboard", label: "Communicate", icon: <MessageSquare size={17} />, group: "MODULES" },
  { key: "communication", label: "Parent Communication", icon: <MessageSquare size={17} />, group: "MODULES" },
  { key: "transport", label: "Transport & Buses", icon: <Bus size={17} />, group: "MODULES" },
  { key: "dashboard", label: "Events", icon: <CalendarDays size={17} />, group: "MODULES" },
  { key: "dashboard", label: "Sports", icon: <Trophy size={17} />, group: "MODULES" },
  { key: "dashboard", label: "Arts", icon: <Palette size={17} />, group: "MODULES" },
  { key: "dashboard", label: "Languages", icon: <Languages size={17} />, group: "MODULES" },
  { key: "analytics", label: "Energy Consumption", icon: <Zap size={17} />, group: "MODULES" },
  { key: "api", label: "Settings", icon: <Settings size={17} />, group: "MODULES" },
];

const GROUP_ORDER = ["Overview", "MANAGEMENT", "MODULES"];

export default function App() {
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [schoolSwitcherOpen, setSchoolSwitcherOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [activeLabel, setActiveLabel] = useState("Dashboard");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: NAV.filter((n) => n.group === g),
  }));

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  const renderModule = () => {
    switch (active) {
      case "dashboard":
        return <Dashboard onNavigate={(m) => { setActive(m); setActiveLabel(NAV.find((n) => n.key === m)?.label ?? m); }} />;
      case "students":
        return <StudentsModule />;
      case "finance":
        return <FinanceModule />;
      case "hr":
        return <HRModule />;
      case "analytics":
        return <AnalyticsModule />;
      case "attendance":
        return <ClassAttendanceModule />;
      case "transport":
        return <TransportModule />;
      case "exams":
        return <ExamsModule />;
      case "communication":
        return <ParentCommunicationModule />;
      case "api":
        return <ApiDocsModule />;
    }
  };

  const handleNav = (item: NavItem) => {
    setActive(item.key);
    setActiveLabel(item.label);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-200",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-800">
          <div className="rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 p-2 shadow-lg shadow-sky-500/20">
            <GraduationCap size={22} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold leading-tight truncate">Yug International</p>
            <p className="text-[11px] text-slate-400 truncate">School Management</p>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto lg:hidden text-slate-400 hover:text-white"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-3 border-b border-slate-800">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              placeholder="Search modules…"
              className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition"
            />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 sidebar-scroll">
          {grouped.map(({ group, items }) => (
            <div key={group}>
              {group !== "Overview" && (
                <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500 mb-1.5">
                  {group}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item, i) => {
                  const isActive = item.key === active && activeLabel === item.label;
                  return (
                    <button
                      key={`${item.label}-${i}`}
                      onClick={() => handleNav(item)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition group",
                        isActive
                          ? "bg-sky-600 text-white shadow-sm shadow-sky-600/30"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white",
                      )}
                    >
                      <span className={cn("shrink-0", isActive ? "text-white" : "text-slate-400 group-hover:text-sky-400")}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-5 py-3 border-t border-slate-800 text-[11px] text-slate-500">
          <p>Academic Year 2026–2027</p>
          <p className="mt-0.5 text-slate-600">v1.0 · Supabase</p>
        </div>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
          <div className="flex items-center px-4 sm:px-6 h-16 gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            {/* School switcher */}
            <div className="relative">
              <button
                onClick={() => setSchoolSwitcherOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-slate-100 transition"
              >
                <Building2 size={18} className="text-sky-600" />
                <span className="font-semibold text-sm text-slate-800 hidden sm:inline">Yug International</span>
                <ChevronDown size={15} className="text-slate-400" />
              </button>
              {schoolSwitcherOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSchoolSwitcherOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-xl bg-white shadow-xl ring-1 ring-slate-200 py-1.5 text-sm">
                    {["Yug International", "Delhi Public School", "Greenwood High"].map((s, i) => (
                      <button
                        key={s}
                        onClick={() => setSchoolSwitcherOpen(false)}
                        className={cn(
                          "w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2",
                          i === 0 ? "text-sky-700 font-medium" : "text-slate-700",
                        )}
                      >
                        <Building2 size={15} className="text-slate-400" />
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Greeting + date */}
            <div className="hidden md:flex items-center gap-3 ml-2 pl-3 border-l border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-800 leading-tight">{greeting}</p>
                <p className="text-[11px] text-slate-500">
                  {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })} ·{" "}
                  {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {/* Alert pills */}
              <div className="hidden sm:flex items-center gap-1.5">
                <AlertPill tone="info" icon={<Bell size={13} />} label="Updates" />
                <AlertPill tone="warning" icon={<Newspaper size={13} />} label="News Alert" />
                <AlertPill tone="error" icon={<Receipt size={13} />} label="Fees Rx" />
              </div>

              {/* Language */}
              <LanguageToggle />

              {/* Profile */}
              <div className="flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 hover:bg-slate-100 transition cursor-pointer">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center text-white text-xs font-semibold">
                  AD
                </div>
                <div className="hidden lg:block leading-tight">
                  <p className="text-xs font-semibold text-slate-800">Admin</p>
                  <p className="text-[10px] text-slate-500">Administrator</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className="mb-5">
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">{activeLabel}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {greeting}, Admin — here's your campus snapshot for today.
            </p>
          </div>
          {renderModule()}
        </main>
      </div>

      <AIAssistantWidget />
    </div>
  );
}

function AlertPill({
  tone,
  icon,
  label,
}: {
  tone: "info" | "warning" | "error";
  icon: React.ReactNode;
  label: string;
}) {
  const tones = {
    info: "bg-sky-50 text-sky-700 ring-sky-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    error: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1", tones[tone])}>
      {icon}
      {label}
    </span>
  );
}
