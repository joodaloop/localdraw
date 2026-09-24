import { useEffect, useState } from "react";
import type { MemoryUsage } from "../shared/api";

const POLL_MS = 2000;
const MB = 1024 * 1024;
const mb = (bytes: number) => `${Math.round(bytes / MB)} MB`;

/** Colours the total: green when lean, red when heavy, grey in between. */
function memoryLevel(bytes: number) {
  if (bytes > 700 * MB) return "high";
  if (bytes < 500 * MB) return "low";
  return "normal";
}

/** The app's total memory across all its processes. Clicking it toggles a per-process breakdown. */
export function MemoryMeter() {
  const [usage, setUsage] = useState<MemoryUsage | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      // Skip while the window is hidden; the reading resumes when it's shown.
      if (document.visibilityState !== "visible") return;
      window.localdraw.getMemoryUsage().then((next) => {
        if (!cancelled) setUsage(next);
      }, console.error);
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  if (!usage) return null;
  return (
    <div className="memory-meter">
      <button
        type="button"
        data-level={memoryLevel(usage.totalBytes)}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {mb(usage.totalBytes)}
      </button>
      {isOpen && (
        <div className="memory-popover" role="dialog" aria-label="Memory by process">
          <table>
            <tbody>
              {usage.processes.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td>{mb(p.bytes)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{mb(usage.totalBytes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
