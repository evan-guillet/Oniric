/**
 * Sunrise and sunset at a place on a day, for the call sheet [FDS-02], computed here rather than asked of a service:
 * the formula of the NOAA solar calculator, good to the minute away from the poles.
 */

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** « 48.8566, 2.3522 » or « 48,8566 ; 2,3522 » as latitude and longitude; null when it reads neither. */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const nums = text.replace(/(\d),(\d)/g, "$1.$2").match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length !== 2) return null;
  const [lat, lon] = nums.map(Number);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Where the sun stands in the year: its declination, and how far the sundial runs ahead of the clock, in minutes. */
function solar(date: string, utcMinutes = 720): { decl: number; eqTime: number } {
  const [y, m, d] = date.split("-").map(Number);
  const jd = (Date.UTC(y, m - 1, d) + utcMinutes * 60000) / 86400000 + 2440587.5;
  const tc = (jd - 2451545) / 36525;
  const l0 = (280.46646 + tc * (36000.76983 + tc * 0.0003032)) % 360;
  const ma = 357.52911 + tc * (35999.05029 - 0.0001537 * tc);
  const e = 0.016708634 - tc * (0.000042037 + 0.0000001267 * tc);
  const c = Math.sin(rad(ma)) * (1.914602 - tc * (0.004817 + 0.000014 * tc)) + Math.sin(rad(2 * ma)) * (0.019993 - 0.000101 * tc) + Math.sin(rad(3 * ma)) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * tc;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - tc * (46.815 + tc * (0.00059 - tc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const yy = Math.tan(rad(eps / 2)) ** 2;
  const eqTime =
    4 *
    deg(
      yy * Math.sin(2 * rad(l0)) -
        2 * e * Math.sin(rad(ma)) +
        4 * e * yy * Math.sin(rad(ma)) * Math.cos(2 * rad(l0)) -
        0.5 * yy * yy * Math.sin(4 * rad(l0)) -
        1.25 * e * e * Math.sin(2 * rad(ma)),
    );
  return { decl, eqTime };
}

/** When the sun crosses a height above the horizon, in UTC minutes after midnight of `date`; null when it never does. */
function crossing(date: string, lat: number, lon: number, height: number): { rise: number; set: number } | null {
  const { decl, eqTime } = solar(date);
  const cosH = Math.cos(rad(90 - height)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) - Math.tan(rad(lat)) * Math.tan(rad(decl));
  if (cosH < -1 || cosH > 1) return null;
  const ha = deg(Math.acos(cosH));
  const noon = 720 - 4 * lon - eqTime;
  return { rise: noon - ha * 4, set: noon + ha * 4 };
}

/**
 * The times of sunrise and sunset in UTC minutes after midnight of `date` (yyyy-mm-dd); null for polar day or night.
 */
export function sunTimesUtc(date: string, lat: number, lon: number): { rise: number; set: number } | null {
  return crossing(date, lat, lon, -0.833);
}

/** The golden hours: from sunrise until the sun is 6° up, and from 6° up until sunset [REP-07]. */
export function goldenHours(date: string, lat: number, lon: number): { morningEnd: number; eveningStart: number } | null {
  const high = crossing(date, lat, lon, 6);
  return high ? { morningEnd: high.rise, eveningStart: high.set } : null;
}

/** Where the sun is seen from a place at a moment: its bearing from the north, clockwise, and its height, in degrees [REP-04]. */
export function sunPosition(date: string, utcMinutes: number, lat: number, lon: number): { azimuth: number; elevation: number } {
  const { decl, eqTime } = solar(date, utcMinutes);
  const solarMinutes = utcMinutes + eqTime + 4 * lon;
  const ha = rad(solarMinutes / 4 - 180);
  const la = rad(lat);
  const de = rad(decl);
  const elevation = deg(Math.asin(Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(ha)));
  const azimuth = (deg(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(de) * Math.cos(la))) + 180 + 360) % 360;
  return { azimuth, elevation };
}

/** The UTC minutes of a local hour of that day on this computer. */
export function utcMinutesOf(date: string, hours: number, minutes = 0): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(y, m - 1, d, hours, minutes).getTime() - Date.UTC(y, m - 1, d)) / 60000;
}

/** « 07:42 » in the time zone of this computer on that day. */
export function localTime(date: string, utcMinutes: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d) + Math.round(utcMinutes) * 60000);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export function sunTimes(date: string, coordinates: string): { rise: string; set: string } | null {
  const at = parseCoordinates(coordinates);
  if (!at) return null;
  const s = sunTimesUtc(date, at.lat, at.lon);
  return s ? { rise: localTime(date, s.rise), set: localTime(date, s.set) } : null;
}
