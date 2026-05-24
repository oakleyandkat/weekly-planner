"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  addEvent,
  updateEvent,
  deleteEvent,
  clearAllEvents,
  getEventsForOwner,
} from "./actions";

type PlannerEvent = {
  id: number;
  eventDate: string; // YYYY-MM-DD
  dayOfWeek: number;
  time: string;
  text: string;
};

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
  const [hydrated, setHydrated] = useState(false);
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
  }>({
    open: false,
    date: ymd(new Date()),
    editingId: null,
    initialTime: "",
    initialText: "",
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
    setEvents([]);
    try {
      localStorage.removeItem(OWNER_KEY);
    } catch {}
  }

  // Group events by date (YYYY-MM-DD) for quick lookup
  const eventsByDate = new Map<string, PlannerEvent[]>();
  for (const e of events) {
    const arr = eventsByDate.get(e.eventDate);
    if (arr) arr.push(e);
    else eventsByDate.set(e.eventDate, [e]);
  }

  const today = startOfDay(new Date());

  function openAdd(date: Date) {
    setModal({
      open: true,
      date: ymd(date),
      editingId: null,
      initialTime: "",
      initialText: "",
    });
  }

  function openEdit(ev: PlannerEvent) {
    setModal({
      open: true,
      date: ev.eventDate,
      editingId: ev.id,
      initialTime: ev.time,
      initialText: ev.text,
    });
  }

  function closeModal() {
    setModal((m) => ({ ...m, open: false }));
  }

  function handleSave(time: string, text: string) {
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
        return updateEvent(owner, editingId, time, text);
      }
      return addEvent(owner, date, time, text);
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

  // Show the "what's your name?" gate until they pick one.
  if (!hydrated) return null;
  if (!owner) {
    return <NameGate onChoose={(n) => chooseOwner(n)} />;
  }

  const weekDays = weekDates(viewDate);
  const monthDays = monthGridDates(viewDate);
  const visibleMonth = viewDate.getMonth();

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
            {prettyName(owner)}&apos;s {view === "week" ? "Week" : "Month"}
          </h1>
          <div className="subtitle">
            {view === "week"
              ? `week of ${fmtMonthDay(weekDays[0])}  →  ${fmtMonthDay(weekDays[6])}`
              : fmtMonthYear(viewDate)}
          </div>

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
              not {prettyName(owner)}? switch user
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
                          className="event-pill"
                          onClick={() => openEdit(ev)}
                        >
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
                          className="month-event"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(ev);
                          }}
                        >
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
          onCancel={closeModal}
          onSave={handleSave}
        />
      )}
    </>
  );
}

function NameGate({ onChoose }: { onChoose: (name: string) => void }) {
  const [name, setName] = useState("");
  const valid = isValidName(name);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!valid) return;
    onChoose(name);
  }

  return (
    <div className="name-gate">
      <div className="name-gate-card">
        <h1 className="planner-h1">what&apos;s your name?</h1>
        <p className="subtitle">
          this is your planner. give your friends the link — they pick their
          own name and have their own planner. nobody&apos;s data crosses over.
        </p>
        <form onSubmit={submit}>
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
            disabled={!valid}
          >
            open my planner →
          </button>
        </form>
        <p className="name-hint">
          letters, numbers, spaces, dashes &amp; underscores · max 30 chars
        </p>
      </div>
    </div>
  );
}

function EventModal({
  dateLabel,
  editing,
  initialTime,
  initialText,
  onCancel,
  onSave,
}: {
  dateLabel: string;
  editing: boolean;
  initialTime: string;
  initialText: string;
  onCancel: () => void;
  onSave: (time: string, text: string) => void;
}) {
  const [time, setTime] = useState(initialTime);
  const [text, setText] = useState(initialText);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onSave(time, text);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [time, text, onCancel, onSave]);

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

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onCancel}>
            cancel
          </button>
          <button
            type="button"
            className="save-btn"
            onClick={() => onSave(time, text)}
          >
            save
          </button>
        </div>
      </div>
    </div>
  );
}
