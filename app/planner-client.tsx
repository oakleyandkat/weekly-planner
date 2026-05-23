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
] as const;

const THEME_KEY = "weeklyPlannerTheme_v2";
const OWNER_KEY = "weeklyPlannerOwner_v1";

function getWeekDates(): Date[] {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  sunday.setHours(0, 0, 0, 0);
  const out: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    out.push(d);
  }
  return out;
}

function fmtDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

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
  const [modal, setModal] = useState<{
    open: boolean;
    dayOfWeek: number;
    editingId: number | null;
    initialTime: string;
    initialText: string;
  }>({
    open: false,
    dayOfWeek: 0,
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

  const dates = getWeekDates();
  const todayIdx = new Date().getDay();
  const eventsByDay: PlannerEvent[][] = [[], [], [], [], [], [], []];
  for (const e of events) {
    if (e.dayOfWeek >= 0 && e.dayOfWeek < 7) eventsByDay[e.dayOfWeek].push(e);
  }

  function openAdd(dayOfWeek: number) {
    setModal({
      open: true,
      dayOfWeek,
      editingId: null,
      initialTime: "",
      initialText: "",
    });
  }

  function openEdit(ev: PlannerEvent) {
    setModal({
      open: true,
      dayOfWeek: ev.dayOfWeek,
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
    const { editingId, dayOfWeek } = modal;
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
      return addEvent(owner, dayOfWeek, time, text);
    });
  }

  function handleDelete(id: number) {
    if (!owner) return;
    startTransition(() => deleteEvent(owner, id));
  }

  function handleClearAll() {
    if (!owner) return;
    if (confirm("erase the whole week?")) {
      startTransition(() => clearAllEvents(owner));
    }
  }

  // Show the "what's your name?" gate until they pick one.
  if (!hydrated) return null;
  if (!owner) {
    return (
      <NameGate
        onChoose={(n) => chooseOwner(n)}
      />
    );
  }

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
          <h1 className="planner-h1">{prettyName(owner)}&apos;s Week</h1>
          <div className="subtitle">
            week of {fmtDate(dates[0])} &nbsp;→&nbsp; {fmtDate(dates[6])}
          </div>
          <div className="user-row">
            <span className="db-badge">
              {loading ? "loading…" : `${events.length} event${events.length === 1 ? "" : "s"}`}
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

        <div className="week-grid">
          {dates.map((date, i) => {
            const dayEvents = eventsByDay[i];
            return (
              <div
                key={i}
                className={`day-column ${i === todayIdx ? "today" : ""}`}
              >
                <div className="day-header">
                  <div className="day-name">{DAYS_SHORT[i]}</div>
                  <div className="day-date">{fmtDate(date)}</div>
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
                  onClick={() => openAdd(i)}
                >
                  + add
                </button>
              </div>
            );
          })}
        </div>

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
          dayName={DAYS_LONG[modal.dayOfWeek]}
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
  dayName,
  editing,
  initialTime,
  initialText,
  onCancel,
  onSave,
}: {
  dayName: string;
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
        <div className="modal-sub">for {dayName}</div>

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
