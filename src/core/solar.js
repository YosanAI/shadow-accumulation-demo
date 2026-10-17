import { getPosition } from '#lab/vendor/suncalc-position.js';
import { nextFrame, throwIfAborted } from '#lab/core/math.js';
export const DAY_MS = 86400000;

/** Right-handed scene coordinates: +X east, +Y up, -Z north. */
export function sunAt(timestamp, latitude, longitude) {
  const { altitude, azimuth } = getPosition(new Date(timestamp), latitude, longitude);
  const horizontal = Math.cos(altitude);
  return {
    direction: [-Math.sin(azimuth) * horizontal, Math.sin(altitude), Math.cos(azimuth) * horizontal],
    altitude,
    azimuthNorth: (azimuth + Math.PI + Math.PI * 2) % (Math.PI * 2)
  };
}

/** UI dates are inclusive UTC calendar dates, NOT the computer's local dates. */
export function validateSolarConfig(config) {
  const { latitude, longitude, startDate, endDate, intervalMinutes, dni } = config;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('Latitude must be between −90 and 90.');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Longitude must be between −180 and 180.');
  for (const date of [startDate, endDate]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Choose valid start and end dates.');
  }
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const endExclusive = Date.parse(`${endDate}T00:00:00Z`) + DAY_MS;
  const days = (endExclusive - start) / DAY_MS;
  if (days < 1 || days > 366) throw new Error('Choose an inclusive range between 1 and 366 days.');
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 120) throw new Error('The interval must be a whole number between 1 and 120 minutes.');
  if (!Number.isFinite(dni) || dni <= 0 || dni > 1500) throw new Error('DNI must be greater than 0 and no more than 1500 W/m².');
  return { start, endExclusive, days, totalIntervals: Math.ceil((endExclusive - start) / (intervalMinutes * 60000)) };
}

/**
 * Midpoint quadrature. The final interval gets its actual (possibly short) weight.
 * No representative days, annual extrapolation, direction quantization or hidden
 * temporal downsampling. Only samples whose sun center is below the horizon go.
 * Yield while preparing an annual run so cancellation and the UI remain usable.
 */
export async function buildSunSamples(config, { signal, onProgress = () => {} } = {}) {
  const { start, endExclusive, days, totalIntervals } = validateSolarConfig(config);
  const directionAndEnergy = new Float32Array(totalIntervals * 4);
  const durations = new Float32Array(totalIntervals);
  const timestamps = new Float64Array(totalIntervals);
  const step = config.intervalMinutes * 60000;
  let count = 0, daylightHours = 0;
  for (let i = 0, timestamp = start; timestamp < endExclusive; i++, timestamp += step) {
    const durationMs = Math.min(step, endExclusive - timestamp);
    const midpoint = timestamp + durationMs / 2;
    const sun = sunAt(midpoint, config.latitude, config.longitude);
    if (sun.altitude > 0) {
      const durationHours = durationMs / 3600000;
      directionAndEnergy.set([...sun.direction, config.dni * durationHours / 1000], count * 4);
      durations[count] = durationHours;
      timestamps[count] = midpoint;
      daylightHours += durationHours;
      count++;
    }
    if ((i & 4095) === 0) {
      throwIfAborted(signal);
      onProgress(i / totalIntervals);
      await nextFrame();
    }
  }
  throwIfAborted(signal);
  onProgress(1);
  return { directionAndEnergy: directionAndEnergy.subarray(0, count * 4), durations: durations.subarray(0, count), timestamps: timestamps.subarray(0, count), count, totalIntervals, daylightHours, days };
}
