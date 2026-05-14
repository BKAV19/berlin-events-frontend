import React, { useState, useEffect, useMemo } from "react";
import { MapPin, Clock, Navigation, Loader2, AlertCircle, X, ExternalLink, Share2, SlidersHorizontal, Footprints, Bike, Train, Users, Plus, Check, AlertTriangle, UserPlus } from "lucide-react";

const API_BASE_URL = "https://berlin-events-backend-production.up.railway.app";

/* ============================================================
   UTILITIES
============================================================ */
const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

function estimateTransit(distanceKm, currentHour, fromLat, toLat) {
  let mode, minutes;
  if (distanceKm < 1.2) { mode = "walk"; minutes = distanceKm * 12; }
  else if (distanceKm < 3) { mode = "bike"; minutes = distanceKm * 4 + 3; }
  else {
    mode = "transit";
    minutes = distanceKm * 2.5 + 10;
    if (Math.abs(fromLat - toLat) > 0.04) minutes *= 1.1;
    if (currentHour >= 1 && currentHour < 5) minutes *= 1.4;
  }
  return { mode, minutes: Math.round(minutes) };
}

const ModeIcon = ({ mode, size = 11 }) => {
  if (mode === "walk") return <Footprints size={size} />;
  if (mode === "bike") return <Bike size={size} />;
  return <Train size={size} />;
};

const formatHour = (h) => {
  const d = h % 24;
  const next = h >= 24 ? " (+1)" : "";
  return `${String(Math.floor(d)).padStart(2, "0")}:00${next}`;
};

const TIME_WINDOWS = [
  { id: "all", label: "All Day", test: () => true },
  { id: "day", label: "Daytime", test: (e) => e.start < 18 },
  { id: "evening", label: "Evening", test: (e) => e.start >= 18 && e.start < 23 },
  { id: "late", label: "Late Night", test: (e) => e.start >= 23 || e.end > 24 },
];

const getDateStrip = () => {
  const out = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      offset: i,
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" }),
      day: d.getDate(),
      month: d.toLocaleDateString("en-GB", { month: "short" }),
      isoDate: d.toISOString().split("T")[0],
    });
  }
  return out;
};

const ALL_CATEGORIES = ["Club", "Live Music", "Food", "Cinema", "Art", "Market", "Spoken Word", "Comedy", "Cabaret", "Wellness", "Social", "Other"];

/* ============================================================
   GOING BUTTON
============================================================ */
function GoingButton({ event, isGoing, count, onToggle, compact = false }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(event.id); }}
      className={`flex items-center gap-1.5 px-2.5 py-1 border-2 transition ${
        isGoing
          ? "bg-amber-400 border-stone-900 text-stone-900"
          : "bg-white border-stone-900 text-stone-900 hover:bg-stone-100"
      } ${compact ? "text-[10px]" : "text-[11px]"}`}
    >
      {isGoing ? <Check size={compact ? 10 : 12} /> : <UserPlus size={compact ? 10 : 12} />}
      <span className="font-bold tabular-nums">{count}</span>
    </button>
  );
}

/* ============================================================
   EVENT DETAIL VIEW
============================================================ */
function EventDetail({ event, onClose, isGoing, count, onToggleGoing }) {
  if (!event) return null;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}&travelmode=transit`;
  const share = () => {
    if (navigator.share) navigator.share({ title: event.title, text: `${event.title} at ${event.venue}`, url: event.url }).catch(() => {});
    else navigator.clipboard?.writeText(`${event.title} @ ${event.venue} — ${event.url}`);
  };
  const modeLabel = event.mode === "walk" ? "On foot" : event.mode === "bike" ? "By bike" : "By transit";

  return (
    <div className="fixed inset-0 z-50 bg-stone-100 overflow-y-auto" style={{ animation: "slideUp 0.25s ease-out" }}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div className="grain min-h-screen pb-32">
        <div className="sticky top-0 z-10 bg-stone-100/95 backdrop-blur border-b border-stone-300 px-5 py-3 flex items-center justify-between">
          <button onClick={onClose} className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase">
            <X size={14} /> Close
          </button>
          <button onClick={share} className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase">
            Share <Share2 size={14} />
          </button>
        </div>

        <div className="px-5 pt-8 pb-6 border-b-2 border-stone-900">
          <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-2 flex items-center gap-2">
            {event.category}
            {event.isFree && <span className="bg-amber-400 text-stone-900 px-1.5 py-0.5">FREE</span>}
            {event.source && <span className="bg-stone-900 text-stone-100 px-1.5 py-0.5">{event.source.toUpperCase()}</span>}
          </div>
          <h1 className="display text-5xl font-black leading-[0.9] tracking-tight mb-4">{event.title}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] tracking-wider mb-4">
            <span>{event.venue}</span><span>·</span>
            <span>{event.area}</span><span>·</span>
            <span className="font-bold">{event.price}</span>
          </div>
          <div className="flex items-center gap-3">
            <GoingButton event={event} isGoing={isGoing} count={count} onToggle={onToggleGoing} />
            <span className="text-[10px] tracking-[0.2em] uppercase opacity-60">
              {count === 1 ? "person going" : "people going"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b-2 border-stone-900">
          <div className="p-5 border-r-2 border-stone-900">
            <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-1">When</div>
            <div className="display text-2xl">{formatHour(event.start)}</div>
            <div className="text-[10px] tracking-wider opacity-60">until {formatHour(event.end)}</div>
          </div>
          <div className="p-5">
            <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-1">Getting There</div>
            <div className="display text-2xl flex items-center gap-2">
              <ModeIcon mode={event.mode} size={20} /> {event.minutes} min
            </div>
            <div className="text-[10px] tracking-wider opacity-60">{modeLabel} · {event.distance.toFixed(1)} km</div>
          </div>
        </div>

        {event.description && (
          <div className="px-5 py-6 border-b border-stone-300">
            <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-3">About</div>
            <p className="text-base leading-relaxed" style={{ fontFamily: "Fraunces, serif" }}>{event.description}</p>
          </div>
        )}

        {event.lineup && event.lineup.length > 0 && (
          <div className="px-5 py-6 border-b border-stone-300">
            <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-3">Lineup</div>
            <ul>
              {event.lineup.map((act, i) => (
                <li key={i} className="display text-xl border-b border-stone-300 py-2 flex items-baseline gap-3">
                  <span className="text-[10px] opacity-40 tracking-wider">{String(i + 1).padStart(2, "0")}</span>
                  {act}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="px-5 py-6 border-b border-stone-300">
          <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-2">Address</div>
          <div className="flex items-start gap-2 text-sm">
            <MapPin size={14} className="mt-1 flex-shrink-0" />
            <span>{event.address}</span>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-stone-900 text-stone-100 grid grid-cols-2 border-t-2 border-stone-900">
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer"
             className="p-5 text-center text-[11px] tracking-[0.25em] uppercase font-bold border-r border-stone-700 flex items-center justify-center gap-2">
            <Navigation size={14} /> Directions
          </a>
          <a href={event.url} target="_blank" rel="noopener noreferrer"
             className="p-5 text-center text-[11px] tracking-[0.25em] uppercase font-bold bg-amber-400 text-stone-900 flex items-center justify-center gap-2">
            Tickets <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MAIN APP
============================================================ */
export default function WhatsHappeningBerlin() {
  const [coords, setCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState("idle");
  const [dayOffset, setDayOffset] = useState(0);
  const [timeWin, setTimeWin] = useState("all");
  const [maxMinutes, setMaxMinutes] = useState(45);
  const [interests, setInterests] = useState(new Set(ALL_CATEGORIES));
  const [priceFilter, setPriceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("transit");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(null);
  const [currentHour] = useState(new Date().getHours());

  const [apiEvents, setApiEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [myGoing, setMyGoing] = useState({});

  const dateStrip = useMemo(() => getDateStrip(), []);

  const requestLocation = () => {
    if (!navigator.geolocation) { setGeoStatus("error"); setCoords({ lat: 52.52, lng: 13.405 }); return; }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGeoStatus("ok"); },
      () => { setGeoStatus("error"); setCoords({ lat: 52.52, lng: 13.405 }); },
      { timeout: 8000 }
    );
  };
  useEffect(() => { requestLocation(); }, []);

  // Fetch events from API whenever coords or date changes
  useEffect(() => {
    if (!coords) return;
    const selectedDate = dateStrip[dayOffset];
    if (!selectedDate) return;

    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const endDate = new Date(selectedDate.isoDate);
        endDate.setDate(endDate.getDate() + 1);
        const url = `${API_BASE_URL}/events?lat=${coords.lat}&lng=${coords.lng}&from=${selectedDate.isoDate}&to=${endDate.toISOString().split("T")[0]}&limit=200`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = await response.json();
        
        // Transform API events to frontend format
        const transformed = data.events.map(e => {
          const startDate = new Date(e.startTime);
          const startHour = startDate.getHours() + (startDate.getDate() !== new Date(selectedDate.isoDate).getDate() ? 24 : 0);
          const endDate = e.endTime ? new Date(e.endTime) : null;
          const endHour = endDate ? endDate.getHours() + (endDate.getDate() !== startDate.getDate() ? 24 : 0) : startHour + 3;
          
          // Use venue coords if available, fallback to Berlin center
          const lat = e.venue?.lat || 52.52;
          const lng = e.venue?.lng || 13.405;
          const distance = haversine(coords.lat, coords.lng, lat, lng);
          const { mode, minutes } = estimateTransit(distance, currentHour, coords.lat, lat);

          return {
            id: e.id,
            title: e.title,
            venue: e.venue?.name || "Unknown venue",
            venueId: e.venue?.name?.toLowerCase().replace(/\s+/g, "-") || "unknown",
            area: e.venue?.area || "Berlin",
            lat,
            lng,
            daysFromToday: dayOffset,
            category: e.category || "Other",
            price: e.isFree ? "Free" : e.priceAmount ? `€${e.priceAmount}` : "TBA",
            isFree: e.isFree,
            start: startHour,
            end: endHour,
            url: e.externalUrl || "#",
            description: e.description,
            lineup: e.lineup || [],
            totalAttendance: e.attendance || 0,
            address: e.venue?.address || `${e.venue?.area || "Berlin"}`,
            source: e.source || "api",
            distance,
            mode,
            minutes,
          };
        });
        setApiEvents(transformed);
      } catch (err) {
        console.error("Failed to fetch events:", err);
        setError("Couldn't load events. Make sure the backend is running.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [coords, dayOffset, currentHour, dateStrip]);

  const toggleInterest = (cat) => {
    setInterests(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const toggleGoing = async (eventId) => {
    const wasGoing = myGoing[eventId] === true;
    const userId = "user-" + (localStorage.getItem("userId") || Math.random().toString(36).slice(2));
    if (!localStorage.getItem("userId")) localStorage.setItem("userId", userId);

    // Optimistic update
    setMyGoing(prev => ({ ...prev, [eventId]: !wasGoing }));
    setApiEvents(prev => prev.map(e => e.id === eventId ? { ...e, totalAttendance: e.totalAttendance + (wasGoing ? -1 : 1) } : e));

    try {
      const response = await fetch(`${API_BASE_URL}/events/${eventId}/attend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, going: !wasGoing }),
      });
      if (!response.ok) throw new Error("Failed to update attendance");
      const data = await response.json();
      // Update with server count
      setApiEvents(prev => prev.map(e => e.id === eventId ? { ...e, totalAttendance: data.count } : e));
    } catch (err) {
      console.error("Failed to update attendance:", err);
      // Revert on error
      setMyGoing(prev => ({ ...prev, [eventId]: wasGoing }));
      setApiEvents(prev => prev.map(e => e.id === eventId ? { ...e, totalAttendance: e.totalAttendance + (wasGoing ? 1 : -1) } : e));
    }
  };

  const events = useMemo(() => {
    if (!coords) return [];
    const win = TIME_WINDOWS.find((w) => w.id === timeWin);
    return apiEvents
      .filter((e) => e.minutes <= maxMinutes)
      .filter((e) => win.test(e))
      .filter((e) => interests.has(e.category))
      .filter((e) => priceFilter === "all" || (priceFilter === "free" ? e.isFree : !e.isFree))
      .sort((a, b) => {
        if (sortBy === "popularity") return b.totalAttendance - a.totalAttendance;
        if (sortBy === "distance") return a.distance - b.distance;
        return a.minutes - b.minutes;
      });
  }, [coords, apiEvents, timeWin, maxMinutes, interests, priceFilter, sortBy]);

  const activeFilterCount = (interests.size < ALL_CATEGORIES.length ? 1 : 0) + (priceFilter !== "all" ? 1 : 0) + (timeWin !== "all" ? 1 : 0);

  const selectedWithLive = useMemo(() => {
    if (!selected) return null;
    const live = events.find(e => e.id === selected.id);
    return live || selected;
  }, [selected, events]);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900" style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;800&family=Fraunces:opsz,wght@9..144,300;9..144,600;9..144,900&display=swap');
        .display { font-family: 'Fraunces', serif; font-variation-settings: "opsz" 144; }
        .grain { background-image: radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px); background-size: 4px 4px; }
        select { background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%231c1917' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 30px; }
      `}</style>

      <div className="grain min-h-screen">
        <header className="border-b-2 border-stone-900 px-5 pt-7 pb-6">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[10px] tracking-[0.3em] uppercase opacity-60">v0.3 · connected</span>
            <span className="text-[10px] tracking-[0.3em] uppercase opacity-60">{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
          </div>
          <h1 className="display font-black leading-[0.88] tracking-tight" style={{ fontSize: "clamp(2.5rem, 11vw, 4rem)" }}>
            What's<br />happening,<br /><span className="italic font-light">Berlin?</span>
          </h1>
          <div className="mt-4 text-[10px] tracking-[0.25em] uppercase opacity-60">
            {loading ? "Loading…" : `${apiEvents.length} events · from Resident Advisor`}
          </div>
        </header>

        <div className="px-5 py-4 border-b border-stone-300 flex items-center gap-3 bg-stone-900 text-stone-100">
          {geoStatus === "loading" && <Loader2 size={14} className="animate-spin" />}
          {geoStatus === "ok" && <Navigation size={14} />}
          {geoStatus === "error" && <AlertCircle size={14} className="text-amber-400" />}
          <div className="flex-1 text-[11px] tracking-wider">
            {geoStatus === "loading" && "LOCATING…"}
            {geoStatus === "ok" && coords && `${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E`}
            {geoStatus === "error" && `FALLBACK: BERLIN MITTE`}
          </div>
          <button onClick={requestLocation} className="text-[10px] tracking-[0.2em] underline underline-offset-2">REFRESH</button>
        </div>

        {error && (
          <div className="px-5 py-4 bg-amber-100 border-b-2 border-amber-600 flex items-start gap-3">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">{error}</div>
          </div>
        )}

        <div className="border-b border-stone-300 py-3 bg-stone-50">
          <div className="flex gap-2 overflow-x-auto px-3 pb-1">
            {dateStrip.map(d => (
              <button key={d.offset} onClick={() => setDayOffset(d.offset)}
                className={`flex-shrink-0 px-3 py-2 border-2 min-w-[68px] transition ${
                  dayOffset === d.offset ? "bg-amber-400 border-stone-900" : "bg-white border-stone-300 hover:border-stone-900"
                }`}>
                <div className="text-[9px] tracking-[0.2em] uppercase opacity-70">{d.label}</div>
                <div className="display text-xl font-bold leading-none mt-1">{d.day}</div>
                <div className="text-[9px] tracking-wider opacity-70 mt-0.5">{d.month}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-3 border-b border-stone-300 flex items-center justify-between bg-white gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-bold">
            <SlidersHorizontal size={13} />
            Filters {activeFilterCount > 0 && <span className="bg-stone-900 text-stone-100 px-1.5 py-0.5 text-[9px]">{activeFilterCount}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="border-b border-stone-300 bg-stone-50 px-5 py-5 space-y-5">
            <div>
              <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-2">Time of Day</div>
              <div className="flex gap-2 flex-wrap">
                {TIME_WINDOWS.map(w => (
                  <button key={w.id} onClick={() => setTimeWin(w.id)}
                    className={`text-[10px] tracking-[0.2em] uppercase px-3 py-2 border-2 transition ${
                      timeWin === w.id ? "bg-stone-900 text-stone-100 border-stone-900" : "bg-white border-stone-400 hover:border-stone-900"
                    }`}>{w.label}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-2">Price</div>
              <div className="grid grid-cols-3 border-2 border-stone-900">
                {[{id:"all",label:"All"},{id:"free",label:"Free"},{id:"paid",label:"Paid"}].map((p, i) => (
                  <button key={p.id} onClick={() => setPriceFilter(p.id)}
                    className={`text-[10px] tracking-[0.2em] uppercase py-2.5 transition ${
                      priceFilter === p.id ? "bg-stone-900 text-stone-100" : "bg-white hover:bg-stone-200"
                    } ${i < 2 ? "border-r-2 border-stone-900" : ""}`}>{p.label}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-[9px] tracking-[0.3em] uppercase opacity-60">Your Interests</div>
                <button onClick={() => setInterests(new Set(ALL_CATEGORIES))}
                  className="text-[9px] tracking-[0.2em] uppercase underline opacity-70">Select all</button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {ALL_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => toggleInterest(cat)}
                    className={`text-[10px] tracking-[0.2em] uppercase px-3 py-2 border-2 transition ${
                      interests.has(cat) ? "bg-stone-900 text-stone-100 border-stone-900" : "bg-white border-stone-300 text-stone-400"
                    }`}>{cat}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[9px] tracking-[0.3em] uppercase mb-2">
                <span className="opacity-60">Max travel time</span>
                <span className="font-bold">{maxMinutes} min</span>
              </div>
              <input type="range" min="10" max="90" step="5" value={maxMinutes}
                onChange={(e) => setMaxMinutes(Number(e.target.value))}
                className="w-full accent-stone-900" />
            </div>

            <div>
              <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-2">Sort by</div>
              <div className="grid grid-cols-3 border-2 border-stone-900">
                <button onClick={() => setSortBy("transit")}
                  className={`text-[10px] tracking-[0.2em] uppercase py-2.5 border-r-2 border-stone-900 transition ${
                    sortBy === "transit" ? "bg-stone-900 text-stone-100" : "bg-white"
                  }`}>Travel</button>
                <button onClick={() => setSortBy("distance")}
                  className={`text-[10px] tracking-[0.2em] uppercase py-2.5 border-r-2 border-stone-900 transition ${
                    sortBy === "distance" ? "bg-stone-900 text-stone-100" : "bg-white"
                  }`}>Distance</button>
                <button onClick={() => setSortBy("popularity")}
                  className={`text-[10px] tracking-[0.2em] uppercase py-2.5 transition ${
                    sortBy === "popularity" ? "bg-stone-900 text-stone-100" : "bg-white"
                  }`}>Popular</button>
              </div>
            </div>
          </div>
        )}

        <div className="px-5 py-6">
          <div className="text-[10px] tracking-[0.3em] uppercase mb-5 flex justify-between">
            <span>{loading ? "Loading…" : `${events.length} of ${apiEvents.length}`} · {dateStrip[dayOffset]?.label}</span>
            <span>by {sortBy === "popularity" ? "popularity" : sortBy === "distance" ? "distance" : "travel time"}</span>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin opacity-40" />
            </div>
          )}

          {!loading && events.length === 0 && (
            <div className="border-2 border-dashed border-stone-400 p-10 text-center">
              <p className="display italic text-2xl mb-2">Nothing in range.</p>
              <p className="text-xs">Increase travel time, loosen a filter, or pick another day.</p>
            </div>
          )}

          <div className="space-y-3">
            {events.map((e, i) => {
              const isGoing = myGoing[e.id] === true;
              const count = e.totalAttendance;
              return (
                <button key={e.id} onClick={() => setSelected(e)}
                  className="block w-full text-left bg-white border-2 border-stone-900 p-4 hover:bg-stone-900 hover:text-stone-100 transition-colors group active:scale-[0.99]"
                  style={{ transform: i % 3 === 1 ? "translateX(8px)" : i % 3 === 2 ? "translateX(-4px)" : "none" }}>
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-1 flex items-center gap-1.5 flex-wrap">
                        <span>{e.category}</span>
                        {e.isFree && <span className="bg-amber-400 text-stone-900 px-1.5 py-0.5 group-hover:bg-amber-400">FREE</span>}
                        {e.source && <span className="bg-stone-900 text-stone-100 px-1.5 py-0.5 group-hover:bg-amber-400 group-hover:text-stone-900">{e.source.toUpperCase()}</span>}
                      </div>
                      <h2 className="display text-2xl font-bold leading-tight">{e.title}</h2>
                    </div>
                    <div className="text-right text-[10px] tracking-wider flex-shrink-0">
                      <div className="display text-xl font-bold flex items-center gap-1.5 justify-end">
                        <ModeIcon mode={e.mode} size={13} />
                        {e.minutes}<span className="text-[10px] font-normal opacity-60">min</span>
                      </div>
                      <div className="opacity-60 mt-0.5">{e.price}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] tracking-wider opacity-80 pt-2 border-t border-stone-300 group-hover:border-stone-700">
                    <span className="flex items-center gap-1 truncate"><MapPin size={11} />{e.venue}</span>
                    <span className="flex items-center gap-1 ml-auto flex-shrink-0"><Clock size={11} />{formatHour(e.start)}</span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <Users size={11} />{count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="border-t-2 border-stone-900 px-5 py-6 text-[9px] tracking-[0.3em] uppercase opacity-60 space-y-1">
          <div>What's Happening, Berlin? · Connected to API</div>
          <div>Events scraped from Resident Advisor</div>
        </footer>
      </div>

      <EventDetail
        event={selectedWithLive}
        onClose={() => setSelected(null)}
        isGoing={selectedWithLive ? myGoing[selectedWithLive.id] === true : false}
        count={selectedWithLive ? selectedWithLive.totalAttendance : 0}
        onToggleGoing={toggleGoing}
      />
    </div>
  );
}
