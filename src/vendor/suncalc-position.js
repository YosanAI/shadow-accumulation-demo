/*! @license
 * SunCalc 1.9.0 — solar-position subset, reformatted with descriptive names.
 * Copyright (c) 2011-2015, Vladimir Agafonkin. BSD-2-Clause.
 * Original: https://github.com/mourner/suncalc/blob/v1.9.0/suncalc.js
 * Full license: THIRD_PARTY_NOTICES.md. No moon or rise/set API is included.
 * IMPORTANT: this pinned version returns radians, azimuth measured south→west.
 * Do not swap in SunCalc 2.x without updating the conversion in core/solar.js.
 *
 * Copyright (c) 2011-2015, Vladimir Agafonkin. All rights reserved.
 * 
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
const radians = Math.PI / 180;
const obliquity = radians * 23.4397;
export function getPosition(date, latitude, longitude) {
  const days = date.valueOf() / 86400000 - 0.5 + 2440588 - 2451545;
  const meanAnomaly = radians * (357.5291 + 0.98560028 * days);
  const equationOfCenter = radians * (1.9148 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly) + 0.0003 * Math.sin(3 * meanAnomaly));
  const eclipticLongitude = meanAnomaly + equationOfCenter + radians * 102.9372 + Math.PI;
  const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(obliquity));
  const rightAscension = Math.atan2(Math.sin(eclipticLongitude) * Math.cos(obliquity), Math.cos(eclipticLongitude));
  const hourAngle = radians * (280.16 + 360.9856235 * days + longitude) - rightAscension;
  const latitudeRadians = latitude * radians;
  return {
    azimuth: Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitudeRadians) - Math.tan(declination) * Math.cos(latitudeRadians)),
    altitude: Math.asin(Math.sin(latitudeRadians) * Math.sin(declination) + Math.cos(latitudeRadians) * Math.cos(declination) * Math.cos(hourAngle))
  };
}
