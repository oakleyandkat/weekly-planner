"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  addEvent,
  updateEvent,
  deleteEvent,
  clearAllEvents,
  getEventsForOwner,
  getProfile,
  saveProfile,
  type ProfileDTO,
} from "./actions";

type PlannerEvent = {
  id: number;
  eventDate: string; // YYYY-MM-DD
  dayOfWeek: number;
  time: string;
  text: string;
  category: string;
};

type Role = "student" | "teacher";

const DAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const THEMES = [
  { id: "bubbly", name: "Bubbly", color: "#ffd1e0" },
  { id: "sticky", name: "Sticky Notes", color: "#fff59d" },
  { id: "midnight", name: "Midnight", color: "#3a2d6a" },
  { id: "minimal", name: "Minimal", color: "#0a0a0a" },
  { id: "y2k", name: "Y2K", color: "#ff2db8" },
  { id: "cottage", name: "Cottagecore", color: "#c8d4b8" },
  { id: "sunset", name: "Sunset", color: "#ffae6c" },
  { id: "forest", name: "Forest", color: "#5a7a4a" },
  { id: "ocean", name: "Ocean", color: "#6cc8e0" },
  { id: "galaxy", name: "Galaxy", color: "#6c2dc7" },
  { id: "kawaii", name: "Kawaii 🎀", color: "#ff66a3" },
  { id: "goth", name: "Goth 🕶️", color: "#b30021" },
  { id: "brat", name: "Brat 🟢", color: "#8acf00" },
  { id: "oldmoney", name: "Old Money 🌾", color: "#355e3b" },
  { id: "academia", name: "Dark Academia 📚", color: "#b87333" },
  { id: "vapor", name: "Vaporwave 🌴", color: "#ff10f0" },
  { id: "coastal", name: "Coastal 🐚", color: "#7ab3a3" },
  { id: "whimsigoth", name: "Whimsigoth 🌙", color: "#d4a850" },
] as const;

// Category sets per role. Each category has an emoji for quick scanning.
// The `id` here maps to an allowed value in actions.ts (normaliseCategory).
const STUDENT_CATEGORIES = [
  { id: "class", name: "class", emoji: "📚" },
  { id: "homework", name: "homework", emoji: "✏️" },
  { id: "test", name: "test / quiz", emoji: "📝" },
  { id: "project", name: "project", emoji: "🎯" },
  { id: "event", name: "school event", emoji: "🎉" },
  { id: "personal", name: "personal", emoji: "💗" },
] as const;

const TEACHER_CATEGORIES = [
  { id: "class", name: "class", emoji: "📚" },
  { id: "lesson", name: "lesson plan", emoji: "📋" },
  { id: "grading", name: "grading", emoji: "🖊️" },
  { id: "meeting", name: "meeting", emoji: "👥" },
  { id: "event", name: "school event", emoji: "🎉" },
  { id: "personal", name: "personal", emoji: "💗" },
] as const;

function categoriesFor(role: Role | ""): readonly {
  id: string;
  name: string;
  emoji: string;
}[] {
  if (role === "teacher") return TEACHER_CATEGORIES;
  return STUDENT_CATEGORIES;
}

const THEME_KEY = "weeklyPlannerTheme_v2";
const OWNER_KEY = "weeklyPlannerOwner_v1";
const VIEW_KEY = "weeklyPlannerView_v1";

type ViewMode = "week" | "month";

// -------------------- date helpers (all local-calendar, no UTC) --------------------

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function weekDates(d: Date): Date[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// 6-week grid (42 cells) anchored on the Sunday before/at the month's 1st.
// Keeps layout stable across months.
function monthGridDates(d: Date): Date[] {
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fmtMonthDay(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function fmtMonthYear(d: Date): string {
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

// -------------------- misc --------------------

function isValidName(s: string): boolean {
  const t = s.trim();
  return t.length >= 1 && t.length <= 30 && /^[A-Za-z0-9 _-]+$/.test(t);
}

function prettyName(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PlannerClient() {
  const [theme, setTheme] = useState<string>("bubbly");
  const [owner, setOwner] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Separate flag for profile-fetched. Until this is true, we show a loading
  // state instead of flashing the onboarding wizard at returning users.
  const [profileChecked, setProfileChecked] = useState(false);
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>("week");
  // The "anchor" date — for week view, any date in the visible week;
  // for month view, any date in the visible month. Starts at today.
  const [viewDate, setViewDate] = useState<Date>(() => startOfDay(new Date()));
  const [modal, setModal] = useState<{
    open: boolean;
    date: string; // YYYY-MM-DD
    editingId: number | null;
    initialTime: string;
    initialText: string;
    initialCategory: string;
  }>({
    open: false,
    date: ymd(new Date()),
    editingId: null,
    initialTime: "",
    initialText: "",
    initialCategory: "",
  });
  const [pending, startTransition] = useTransition();

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t) setTheme(t);
      const o = localStorage.getItem(OWNER_KEY);
      if (o) setOwner(o);
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "week" || v === "month") setView(v);
    } catch {}
    setHydrated(true);
  }, []);

  // Apply theme to <html> + persist
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  // Persist view mode
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {}
  }, [view]);

  // Load profile when we know who the user is
  useEffect(() => {
    let cancelled = false;
    if (!owner) {
      setProfile(null);
      setProfileChecked(hydrated); // true means "we're sure there's no owner"
      return;
    }
    setProfileChecked(false);
    getProfile(owner).then((p) => {
      if (cancelled) return;
      setProfile(p);
      setProfileChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [owner, hydrated]);

  // Load events when we know who the user is
  const loadEvents = useCallback(async (who: string) => {
    setLoading(true);
    try {
      const rows = await getEventsForOwner(who);
      setEvents(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (owner) loadEvents(owner);
  }, [owner, loadEvents, pending]);

  function chooseOwner(name: string) {
    const normalised = name.trim().toLowerCase();
    setOwner(normalised);
    try {
      localStorage.setItem(OWNER_KEY, normalised);
    } catch {}
  }

  function switchUser() {
    setOwner(null);
    setProfile(null);
    setProfileChecked(false);
    setEvents([]);
    try {
      localStorage.removeItem(OWNER_KEY);
    } catch {}
  }

  async function handleProfileComplete(
    displayName: string,
    role: Role,
    school: string,
    grade: string,
  ) {
    if (!owner) return;
    await saveProfile(owner, displayName, role, school, grade);
    // Reload so the planner header + category set reflect the new profile.
    const next = await getProfile(owner);
    setProfile(next);
  }

  // Group events by date (YYYY-MM-DD) for quick lookup
  const eventsByDate = new Map<string, PlannerEvent[]>();
  for (const e of events) {
    const arr = eventsByDate.get(e.eventDate);
    if (arr) arr.push(e);
    else eventsByDate.set(e.eventDate, [e]);
  }

  const today = startOfDay(new Date());
  const role: Role | "" = profile?.role === "teacher" ? "teacher" : profile?.role === "student" ? "student" : "";

  function openAdd(date: Date) {
    setModal({
      open: true,
      date: ymd(date),
      editingId: null,
      initialTime: "",
      initialText: "",
      initialCategory: "",
    });
  }

  function openEdit(ev: PlannerEvent) {
    setModal({
      open: true,
      date: ev.eventDate,
      editingId: ev.id,
      initialTime: ev.time,
      initialText: ev.text,
      initialCategory: ev.category || "",
    });
  }

  function closeModal() {
    setModal((m) => ({ ...m, open: false }));
  }

  function handleSave(time: string, text: string, category: string) {
    if (!owner) return;
    const { editingId, date } = modal;
    closeModal();
    if (!text.trim()) {
      if (editingId !== null) {
        startTransition(() => deleteEvent(owner, editingId));
      }
      return;
    }
    startTransition(() => {
      if (editingId !== null) {
        return updateEvent(owner, editingId, time, text, category);
      }
      return addEvent(owner, date, time, text, category);
    });
  }

  function handleDelete(id: number) {
    if (!owner) return;
    startTransition(() => deleteEvent(owner, id));
  }

  function handleClearAll() {
    if (!owner) return;
    const word = view === "week" ? "the whole week" : "every event you've made";
    if (confirm(`erase ${word}?`)) {
      startTransition(() => clearAllEvents(owner));
    }
  }

  function goPrev() {
    setViewDate((d) => (view === "week" ? addDays(d, -7) : addMonths(d, -1)));
  }
  function goNext() {
    setViewDate((d) => (view === "week" ? addDays(d, 7) : addMonths(d, 1)));
  }
  function goToday() {
    setViewDate(startOfDay(new Date()));
  }

  // -------- render gates --------

  if (!hydrated) return null;

  // No owner yet → full onboarding (landing → name → role → school)
  if (!owner) {
    return (
      <Onboarding
        onPickName={(n) => chooseOwner(n)}
        onComplete={handleProfileComplete}
      />
    );
  }

  // Have owner, still loading their profile → small skeleton
  if (!profileChecked) {
    return (
      <div className="loading-screen">
        <span>loading your planner…</span>
      </div>
    );
  }

  // Have owner but no role saved (old user before this update) → ask them
  // to finish onboarding (role + school + grade). Name is already set.
  if (!profile || !profile.role) {
    return (
      <Onboarding
        skipName
        initialName={owner}
        onPickName={() => {}}
        onComplete={handleProfileComplete}
      />
    );
  }

  const weekDays = weekDates(viewDate);
  const monthDays = monthGridDates(viewDate);
  const visibleMonth = viewDate.getMonth();
  const displayName = profile.displayName || owner;
  const cats = categoriesFor(role);

  return (
    <>
      <div className="theme-picker">
        <span className="theme-picker-label">Theme</span>
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`theme-chip ${theme === t.id ? "active" : ""}`}
            onClick={() => setTheme(t.id)}
          >
            <span
              className="swatch"
              style={{ background: t.color }}
              aria-hidden
            />
            {t.name}
          </button>
        ))}
      </div>

      <div className="planner">
        <header className="planner-header">
          <h1 className="planner-h1">
            {prettyName(displayName)}&apos;s {view === "week" ? "Week" : "Month"}
          </h1>
          <div className="subtitle">
            {view === "week"
              ? `week of ${fmtMonthDay(weekDays[0])}  →  ${fmtMonthDay(weekDays[6])}`
              : fmtMonthYear(viewDate)}
          </div>

          {(profile.school || profile.grade || profile.role) && (
            <div className="profile-row">
              {profile.role && (
                <span className={`role-badge role-${profile.role}`}>
                  {profile.role === "teacher" ? "👩‍🏫 teacher" : "🎒 student"}
                </span>
              )}
              {profile.school && (
                <span className="profile-chip">🏫 {profile.school}</span>
              )}
              {profile.grade && (
                <span className="profile-chip">
                  {profile.role === "teacher" ? "" : "grade "}
                  {profile.grade}
                </span>
              )}
            </div>
          )}

          <div className="view-controls">
            <button
              type="button"
              className="nav-btn"
              onClick={goPrev}
              aria-label={view === "week" ? "Previous week" : "Previous month"}
            >
              ←
            </button>
            <button type="button" className="today-btn" onClick={goToday}>
              today
            </button>
            <button
              type="button"
              className="nav-btn"
              onClick={goNext}
              aria-label={view === "week" ? "Next week" : "Next month"}
            >
              →
            </button>
            <div className="view-toggle" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view === "week"}
                className={`view-toggle-btn ${view === "week" ? "active" : ""}`}
                onClick={() => setView("week")}
              >
                Week
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "month"}
                className={`view-toggle-btn ${view === "month" ? "active" : ""}`}
                onClick={() => setView("month")}
              >
                Month
              </button>
            </div>
          </div>

          <div className="user-row">
            <span className="db-badge">
              {loading
                ? "loading…"
                : `${events.length} event${events.length === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              className="switch-user-btn"
              onClick={switchUser}
            >
              not {prettyName(displayName)}? switch user
            </button>
          </div>
        </header>

        {view === "week" ? (
          <div className="week-grid">
            {weekDays.map((date) => {
              const dayEvents = eventsByDate.get(ymd(date)) ?? [];
              const isToday = isSameDay(date, today);
              return (
                <div
                  key={ymd(date)}
                  className={`day-column ${isToday ? "today" : ""}`}
                >
                  <div className="day-header">
                    <div className="day-name">
                      {DAYS_SHORT[date.getDay()]}
                    </div>
                    <div className="day-date">{fmtMonthDay(date)}</div>
                  </div>

                  <div className="events">
                    {dayEvents.length === 0 ? (
                      <div className="empty-msg" />
                    ) : (
                      dayEvents.map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          className={`event-pill cat-${ev.category || "none"}`}
                          onClick={() => openEdit(ev)}
                        >
                          {ev.category && (
                            <span
                              className="event-cat"
                              aria-hidden
                              title={ev.category}
                            >
                              {cats.find((c) => c.id === ev.category)?.emoji ??
                                "•"}
                            </span>
                          )}
                          {ev.time && (
                            <span className="event-time">{ev.time}</span>
                          )}
                          <span className="event-text">{ev.text}</span>
                          <span
                            className="delete-btn"
                            role="button"
                            aria-label="delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(ev.id);
                            }}
                          >
                            ✕
                          </span>
                        </button>
                      ))
                    )}
                  </div>

                  <button
                    type="button"
                    className="add-btn"
                    onClick={() => openAdd(date)}
                  >
                    + add
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="month-view">
            <div className="month-weekday-row">
              {DAYS_SHORT.map((d) => (
                <div key={d} className="month-weekday">
                  {d}
                </div>
              ))}
            </div>
            <div className="month-grid">
              {monthDays.map((date) => {
                const dayEvents = eventsByDate.get(ymd(date)) ?? [];
                const isToday = isSameDay(date, today);
                const inMonth = date.getMonth() === visibleMonth;
                return (
                  <button
                    key={ymd(date)}
                    type="button"
                    className={`month-cell ${isToday ? "today" : ""} ${inMonth ? "" : "outside"}`}
                    onClick={() => openAdd(date)}
                    aria-label={`Add event on ${fmtMonthDay(date)}`}
                  >
                    <div className="month-cell-date">{date.getDate()}</div>
                    <div className="month-cell-events">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <span
                          key={ev.id}
                          className={`month-event cat-${ev.category || "none"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(ev);
                          }}
                        >
                          {ev.category && (
                            <span className="event-cat" aria-hidden>
                              {cats.find((c) => c.id === ev.category)?.emoji ??
                                "•"}
                            </span>
                          )}
                          {ev.time ? `${ev.time} · ` : ""}
                          {ev.text}
                        </span>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="month-more">
                          +{dayEvents.length - 3} more
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="footer-note">
          <button
            type="button"
            className="clear-week-btn"
            onClick={handleClearAll}
            disabled={pending}
          >
            ✨ erase everything &amp; start over
          </button>
        </div>
      </div>

      {modal.open && (
        <EventModal
          dateLabel={(() => {
            const [y, m, d] = modal.date.split("-").map(Number);
            const dt = new Date(y, m - 1, d);
            return `${DAYS_LONG[dt.getDay()]}, ${fmtMonthDay(dt)}`;
          })()}
          editing={modal.editingId !== null}
          initialTime={modal.initialTime}
          initialText={modal.initialText}
          initialCategory={modal.initialCategory}
          categories={cats}
          onCancel={closeModal}
          onSave={handleSave}
        />
      )}
    </>
  );
}

// -------------------- onboarding --------------------

function Onboarding({
  skipName = false,
  initialName = "",
  onPickName,
  onComplete,
}: {
  skipName?: boolean;
  initialName?: string;
  onPickName: (n: string) => void;
  onComplete: (
    displayName: string,
    role: Role,
    school: string,
    grade: string,
  ) => Promise<void>;
}) {
  // step 0 = landing hero, 1 = name, 2 = role, 3 = school/grade
  const [step, setStep] = useState<number>(skipName ? 2 : 0);
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState<Role | "">("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");
  const [saving, setSaving] = useState(false);

  function startOnboarding() {
    setStep(1);
  }

  function submitName(e?: React.FormEvent) {
    e?.preventDefault();
    if (!isValidName(name)) return;
    onPickName(name);
    setStep(2);
  }

  function pickRole(r: Role) {
    setRole(r);
    setStep(3);
  }

  async function finish(e?: React.FormEvent) {
    e?.preventDefault();
    if (!role) return;
    setSaving(true);
    try {
      await onComplete(name || initialName, role, school, grade);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboard">
      <div className="onboard-card">
        {step === 0 && <LandingHero onStart={startOnboarding} />}

        {step === 1 && (
          <>
            <StepDots step={1} total={3} />
            <h1 className="onboard-h1">first — what&apos;s your name?</h1>
            <p className="subtitle">
              this is your planner. share the link with friends — they pick
              their own name and get their own planner.
            </p>
            <form onSubmit={submitName}>
              <input
                type="text"
                className="name-input"
                placeholder="your first name..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                autoFocus
              />
              <button
                type="submit"
                className="save-btn name-submit"
                disabled={!isValidName(name)}
              >
                continue →
              </button>
            </form>
            <p className="name-hint">
              letters, numbers, spaces, dashes &amp; underscores · max 30 chars
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <StepDots step={skipName ? 1 : 2} total={skipName ? 2 : 3} />
            <h1 className="onboard-h1">are you a student or a teacher?</h1>
            <p className="subtitle">
              we&apos;ll pick the right categories for you (homework vs lesson
              plans, that kind of thing). you can switch later.
            </p>
            <div className="role-grid">
              <button
                type="button"
                className={`role-card ${role === "student" ? "selected" : ""}`}
                onClick={() => pickRole("student")}
              >
                <div className="role-emoji">🎒</div>
                <div className="role-name">student</div>
                <div className="role-desc">
                  classes, homework, tests, projects
                </div>
              </button>
              <button
                type="button"
                className={`role-card ${role === "teacher" ? "selected" : ""}`}
                onClick={() => pickRole("teacher")}
              >
                <div className="role-emoji">👩‍🏫</div>
                <div className="role-name">teacher</div>
                <div className="role-desc">
                  lessons, grading, meetings, events
                </div>
              </button>
            </div>
            {!skipName && (
              <button
                type="button"
                className="link-btn"
                onClick={() => setStep(1)}
              >
                ← back
              </button>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <StepDots step={skipName ? 2 : 3} total={skipName ? 2 : 3} />
            <h1 className="onboard-h1">one more thing</h1>
            <p className="subtitle">
              what school &amp; {role === "teacher" ? "what do you teach" : "what grade"}? (optional — you can skip)
            </p>
            <form onSubmit={finish}>
              <label htmlFor="ob-school" className="onboard-label">
                school
              </label>
              <input
                id="ob-school"
                type="text"
                className="name-input"
                placeholder={
                  role === "teacher"
                    ? "Central High School"
                    : "your school's name"
                }
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                maxLength={60}
                autoFocus
              />
              <label htmlFor="ob-grade" className="onboard-label">
                {role === "teacher" ? "subject / role" : "grade"}
              </label>
              <input
                id="ob-grade"
                type="text"
                className="name-input"
                placeholder={
                  role === "teacher"
                    ? "English, Grade 10"
                    : "e.g. 9, 10, freshman..."
                }
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                maxLength={20}
              />
              <div className="onboard-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setStep(2)}
                >
                  ← back
                </button>
                <button
                  type="submit"
                  className="save-btn name-submit"
                  disabled={saving}
                >
                  {saving ? "saving…" : "open my planner →"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function LandingHero({ onStart }: { onStart: () => void }) {
  return (
    <>
      <div className="hero-badge">📅 for students &amp; teachers</div>
      <h1 className="hero-h1">My Week</h1>
      <p className="hero-tagline">
        a cute, calm school planner. pick a theme, drop in classes, homework
        &amp; tests. share the link with friends — they get their own planner.
      </p>
      <ul className="hero-features">
        <li>
          <span>🎨</span>
          <div>
            <b>18 themes</b> — kawaii, dark academia, cottagecore, whatever your
            vibe
          </div>
        </li>
        <li>
          <span>📚</span>
          <div>
            <b>school mode</b> — categories for homework, tests, projects,
            lesson plans
          </div>
        </li>
        <li>
          <span>🗓️</span>
          <div>
            <b>week + month views</b> — zoom in on this week, zoom out for the
            big picture
          </div>
        </li>
        <li>
          <span>👯</span>
          <div>
            <b>your own planner</b> — nobody else sees your stuff; share the
            link, everyone gets their own
          </div>
        </li>
      </ul>
      <button type="button" className="save-btn hero-cta" onClick={onStart}>
        get started →
      </button>
    </>
  );
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="step-dots" aria-label={`step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`step-dot ${i + 1 === step ? "active" : ""} ${i + 1 < step ? "done" : ""}`}
        />
      ))}
    </div>
  );
}

// -------------------- event modal --------------------

function EventModal({
  dateLabel,
  editing,
  initialTime,
  initialText,
  initialCategory,
  categories,
  onCancel,
  onSave,
}: {
  dateLabel: string;
  editing: boolean;
  initialTime: string;
  initialText: string;
  initialCategory: string;
  categories: readonly { id: string; name: string; emoji: string }[];
  onCancel: () => void;
  onSave: (time: string, text: string, category: string) => void;
}) {
  const [time, setTime] = useState(initialTime);
  const [text, setText] = useState(initialText);
  const [category, setCategory] = useState(initialCategory);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onSave(time, text, category);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [time, text, category, onCancel, onSave]);

  return (
    <div
      className="modal-overlay show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal">
        <h2>{editing ? "Edit note" : "Add a note"}</h2>
        <div className="modal-sub">for {dateLabel}</div>

        <label htmlFor="evTime">Time (optional)</label>
        <input
          id="evTime"
          type="text"
          maxLength={30}
          placeholder="3pm, after school..."
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />

        <label htmlFor="evText">What&apos;s happening?</label>
        <input
          id="evText"
          type="text"
          maxLength={100}
          placeholder="dance practice, dinner with fam..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />

        <label>Category</label>
        <div className="cat-row">
          <button
            type="button"
            className={`cat-chip cat-none ${category === "" ? "selected" : ""}`}
            onClick={() => setCategory("")}
          >
            none
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cat-chip cat-${c.id} ${category === c.id ? "selected" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              <span aria-hidden>{c.emoji}</span> {c.name}
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onCancel}>
            cancel
          </button>
          <button
            type="button"
            className="save-btn"
            onClick={() => onSave(time, text, category)}
          >
            save
          </button>
        </div>
      </div>
    </div>
  );
}
