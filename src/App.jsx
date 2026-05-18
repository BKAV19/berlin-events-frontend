import React, { useState, useEffect, useMemo } from "react";
import { MapPin, Clock, Navigation, Loader2, AlertCircle, X, ExternalLink, Share2, SlidersHorizontal, Footprints, Bike, Train, Users, Plus, Check, AlertTriangle, UserPlus } from "lucide-react";

const API_BASE_URL = "https://berlin-events-backend-production.up.railway.app";

/* ============================================================
   BERLIN POSTAL CODE → DISTRICT MAP
============================================================ */
function getDistrict(venue) {
  if (venue.area && venue.area !== "Berlin" && venue.area.trim().length > 0) {
    return venue.area;
  }
  if (!venue.address) return "Other";
  const match = venue.address.match(/\b(1[0-4]\d{3})\b/);
  if (!match) return "Other";
  const postal = parseInt(match[1]);
  if (postal >= 10115 && postal <= 10179) return "Mitte";
  if (postal >= 10243 && postal <= 10249) return "Friedrichshain";
  if (postal >= 10315 && postal <= 10369) return "Lichtenberg";
  if (postal >= 10405 && postal <= 10439) return "Prenzlauer Berg";
  if (postal >= 10551 && postal <= 10589) return "Moabit";
  if (postal >= 10623 && postal <= 10719) return "Charlottenburg";
  if (postal >= 10777 && postal <= 10829) return "Schöneberg";
  if (postal >= 10961 && postal <= 10999) return "Kreuzberg";
  if (postal >= 12043 && postal <= 12099) return "Neukölln";
  if (postal >= 12099 && postal <= 12109) return "Tempelhof";
  if (postal >= 12157 && postal <= 12169) return "Steglitz";
  if (postal >= 12435 && postal <= 12489) return "Treptow";
  if (postal >= 13347 && postal <= 13359) return "Wedding";
  if (postal >= 13509 && postal <= 13599) return "Reinickendorf";
  return "Other";
}

/* ============================================================
   INDOOR / OUTDOOR HEURISTIC
============================================================ */
const OUTDOOR_KEYWORDS = /open.?air|garden|park|rooftop|tempelhof|mauerpark|volkspark|beach|strand|biergarten|street.food|courtyard|terrace|außen|draußen/i;

function isOutdoor(event) {
  const text = `${event.title} ${event.venue} ${event.address || ""}`;
  return OUTDOOR_KEYWORDS.test(text);
}

/* ============================================================
   PRICE BUCKETS
============================================================ */
const PRICE_BUCKETS = [
  { id: "all", label: "All", test: () => true },
  { id: "free", label: "Free", test: e => e.isFree },
  { id: "cheap", label: "Under €15", test: e => !e.isFree && e.priceAmount && e.priceAmount < 15 },
  { id: "mid", label: "€15–30", test: e => e.priceAmount && e.priceAmount >= 15 && e.priceAmount < 30 },
  { id: "high", label: "€30+", test: e => e.priceAmount && e.priceAmount >= 30 },
];

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

const ALL_CATEGORIES = ["Club", "Live Music", "Food", "Cinema", "Art", "Market", "Spoken Word", "Comedy", "Cabaret", "Wellness", "Social", "Theater", "Sports", "Family", "Other"];

const SOURCE_LABELS = {
  ra: "Resident Advisor",
  ticketmaster: "Ticketmaster",
  eventbrite: "Eventbrite",
  berlinOpenData: "Berlin Open Data",
  user: "User Added",
};

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
          <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-2 flex items-center gap-2 flex-wrap">
            {event.category}
            {event.isFree && <span className="bg-amber-400 text-stone-900 px-1.5 py-0.5">FREE</span>}
            {event.outdoor && <span className="bg-green-100 text-green-800 px-1.5 py-0.5">OUTDOOR</span>}
            {event.source && <span className="bg-stone-900 text-stone-100 px-1.5 py-0.5">{SOURCE_LABELS[event.source] || event.source.toUpperCase()}</span>}
          </div>
          <h1 className="display text-5xl font-black leading-[0.9] tracking-tight mb-4">{event.title}</h1>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] tracking-wider mb-4">
            <span>{event.venue}</span><span>·</span>
            <span>{event.district}</span><span>·</span>
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
   FILTER CHIPS
============================================================ */
function FilterChips({ options, selected, onChange, multiSelect = true }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => {
        const isOn = multiSelect ? selected.has(opt.id) : selected === opt.id;
        return (
          <button key={opt.id}
            onClick={() => {
              if (multiSelect) {
                const next = new Set(selected);
                if (next.has(opt.id)) next.delete(opt.id);
                else next.add(opt.id);
                onChange(next);
              } else {
                onChange(opt.id);
              }
            }}
            className={`text-[10px] tracking-[0.2em] uppercase px-3 py-2 border-2 transition ${
              isOn ? "bg-stone-900 text-stone-100 border-stone-900" : "bg-white border-stone-300 hover:border-stone-900"
            }`}>
            {opt.label}{opt.count !== undefined ? ` · ${opt.count}` : ""}
          </button>
        );
      })}
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
  const [priceBucket, setPriceBucket] = useState("all");
  const [districts, setDistricts] = useState(new Set());
  const [sources, setSources] = useState(new Set());
  const [environment, setEnvironment] = useState("all"); // 'all' | 'indoor' | 'outdoor'
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
        const url = `${API_BASE_URL}/events?lat=${coords.lat}&lng=${coords.lng}&from=${selectedDate.isoDate}&to=${endDate.toISOString().split("T")[0]}&limit=500`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        const data = await response.json();

        const transformed = data.events.map(e => {
          const startDate = new Date(e.startTime);
          const startHour = startDate.getHours() + (startDate.getDate() !== new Date(selectedDate.isoDate).getDate() ? 24 : 0);
          const endDate = e.endTime ? new Date(e.endTime) : null;
          const endHour = endDate ? endDate.getHours() + (endDate.getDate() !== startDate.getDate() ? 24 : 0) : startHour + 3;

          const lat = e.venue?.lat || 52.52;
          const lng = e.venue?.lng || 13.405;
          const distance = haversine(coords.lat, coords.lng, lat, lng);
          const { mode, minutes } = estimateTransit(distance, currentHour, coords.lat, lat);

          const district = getDistrict(e.venue || {});
          const transformedEvent = {
            id: e.id,
            title: e.title,
            venue: e.venue?.name || "Unknown venue",
            district,
            area: e.venue?.area || "Berlin",
            lat,
            lng,
            daysFromToday: dayOffset,
            category: e.category || "Other",
            price: e.isFree ? "Free" : e.priceAmount ? `€${e.priceAmount}` : "TBA",
            isFree: e.isFree,
            priceAmount: e.priceAmount,
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
          transformedEvent.outdoor = isOutdoor(transformedEvent);
          return transformedEvent;
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
      setApiEvents(prev => prev.map(e => e.id === eventId ? { ...e, totalAttendance: data.count } : e));
    } catch (err) {
      setMyGoing(prev => ({ ...prev, [eventId]: wasGoing }));
      setApiEvents(prev => prev.map(e => e.id === eventId ? { ...e, totalAttendance: e.totalAttendance + (wasGoing ? 1 : -1) } : e));
    }
  };

  // Available districts/sources from current events (with counts)
  const availableDistricts = useMemo(() => {
    const counts = {};
    apiEvents.forEach(e => { counts[e.district] = (counts[e.district] || 0) + 1; });
    return Object.entries(counts)
      .map(([id, count]) => ({ id, label: id, count }))
      .sort((a, b) => b.count - a.count);
  }, [apiEvents]);

  const availableSources = useMemo(() => {
    const counts = {};
    apiEvents.forEach(e => { counts[e.source] = (counts[e.source] || 0) + 1; });
    return Object.entries(counts)
      .map(([id, count]) => ({ id, label: SOURCE_LABELS[id] || id, count }))
      .sort((a, b) => b.count - a.count);
  }, [apiEvents]);

  const events = useMemo(() => {
    if (!coords) return [];
    const win = TIME_WINDOWS.find((w) => w.id === timeWin);
    const priceTest = PRICE_BUCKETS.find(b => b.id === priceBucket)?.test || (() => true);
    return apiEvents
      .filter((e) => e.minutes <= maxMinutes)
      .filter((e) => win.test(e))
      .filter((e) => interests.has(e.category))
      .filter((e) => priceTest(e))
      .filter((e) => districts.size === 0 || districts.has(e.district))
      .filter((e) => sources.size === 0 || sources.has(e.source))
      .filter((e) => environment === "all" || (environment === "outdoor" ? e.outdoor : !e.outdoor))
      .sort((a, b) => {
        if (sortBy === "popularity") return b.totalAttendance - a.totalAttendance;
        if (sortBy === "distance") return a.distance - b.distance;
        return a.minutes - b.minutes;
      });
  }, [coords, apiEvents, timeWin, maxMinutes, interests, priceBucket, districts, sources, environment, sortBy]);

  const activeFilterCount =
    (interests.size < ALL_CATEGORIES.length ? 1 : 0) +
    (priceBucket !== "all" ? 1 : 0) +
    (timeWin !== "all" ? 1 : 0) +
    (districts.size > 0 ? 1 : 0) +
    (sources.size > 0 ? 1 : 0) +
    (environment !== "all" ? 1 : 0);

  const clearAllFilters = () => {
    setInterests(new Set(ALL_CATEGORIES));
    setPriceBucket("all");
    setTimeWin("all");
    setDistricts(new Set());
    setSources(new Set());
    setEnvironment("all");
    setMaxMinutes(90);
  };

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
      `}</style>

      <div className="grain min-h-screen">
        <header className="border-b-2 border-stone-900 px-5 pt-7 pb-6">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[10px] tracking-[0.3em] uppercase opacity-60">v0.4 · filtered</span>
            <span className="text-[10px] tracking-[0.3em] uppercase opacity-60">{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
          </div>
          <h1 className="display font-black leading-[0.88] tracking-tight" style={{ fontSize: "clamp(2.5rem, 11vw, 4rem)" }}>
            What's<br />happening,<br /><span className="italic font-light">Berlin?</span>
          </h1>
          <div className="mt-4 text-[10px] tracking-[0.25em] uppercase opacity-60">
            {loading ? "Loading…" : `${apiEvents.length} events`}
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
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} className="text-[10px] tracking-[0.25em] uppercase underline opacity-70">
              Clear all
            </button>
          )}
        </div>

        {showFilters && (
          <div className="border-b border-stone-300 bg-stone-50 px-5 py-5 space-y-5">

            <div>
              <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-2">Time of Day</div>
              <FilterChips
                options={TIME_WINDOWS.map(w => ({ id: w.id, label: w.label }))}
                selected={timeWin}
                onChange={setTimeWin}
                multiSelect={false}
              />
            </div>

            <div>
              <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-2">Price</div>
              <FilterChips
                options={PRICE_BUCKETS.map(p => ({ id: p.id, label: p.label }))}
                selected={priceBucket}
                onChange={setPriceBucket}
                multiSelect={false}
              />
            </div>

            <div>
              <div className="text-[9px] tracking-[0.3em] uppercase opacity-60 mb-2">Environment</div>
              <FilterChips
                options={[
                  { id: "all", label: "All" },
                  { id: "indoor", label: "Indoor" },
                  { id: "outdoor", label: "Outdoor" },
                ]}
                selected={environment}
                onChange={setEnvironment}
                multiSelect={false}
              />
            </div>

            {availableDistricts.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[9px] tracking-[0.3em] uppercase opacity-60">District</div>
                  {districts.size > 0 && (
                    <button onClick={() => setDistricts(new Set())}
                      className="text-[9px] tracking-[0.2em] uppercase underline opacity-70">Clear</button>
                  )}
                </div>
                <FilterChips
                  options={availableDistricts}
                  selected={districts}
                  onChange={setDistricts}
                />
              </div>
            )}

            {availableSources.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[9px] tracking-[0.3em] uppercase opacity-60">Source</div>
                  {sources.size > 0 && (
                    <button onClick={() => setSources(new Set())}
                      className="text-[9px] tracking-[0.2em] uppercase underline opacity-70">Clear</button>
                  )}
                </div>
                <FilterChips
                  options={availableSources}
                  selected={sources}
                  onChange={setSources}
                />
              </div>
            )}

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
              <input type="range" min="10" max="120" step="5" value={maxMinutes}
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
              <p className="text-xs">Loosen a filter, increase travel time, or pick another day.</p>
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
                        {e.outdoor && <span className="bg-green-100 text-green-800 px-1.5 py-0.5 group-hover:bg-green-100">OUTDOOR</span>}
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
                    <span className="flex items-center gap-1 opacity-70 flex-shrink-0">·</span>
                    <span className="flex-shrink-0 opacity-70">{e.district}</span>
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
          <div>Events from RA, Ticketmaster, Eventbrite</div>
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
