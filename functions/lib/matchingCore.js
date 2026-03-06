"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/shared/matching/index.ts
var index_exports = {};
__export(index_exports, {
  calculateMatchScore: () => calculateMatchScore,
  calculateNextOccurrences: () => calculateNextOccurrences,
  calculateOfferTimeWindow: () => calculateOfferTimeWindow,
  calculateOverlapPercentage: () => calculateOverlapPercentage,
  expandRecurringAvailability: () => expandRecurringAvailability,
  overlaps: () => overlaps,
  toDate: () => toDate
});
module.exports = __toCommonJS(index_exports);

// src/shared/matching/toDate.ts
function toDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") {
    return value.toDate();
  }
  const v = value;
  if (typeof v._seconds === "number") {
    return new Date(v._seconds * 1e3 + (v._nanoseconds ?? 0) / 1e6);
  }
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return null;
}

// src/shared/matching/recurrence.ts
function calculateNextOccurrences(startDate, startTime, endTime, recurrence, count = 10, requestFromTime = null, requestUntilTime = null) {
  const occurrences = [];
  const now = /* @__PURE__ */ new Date();
  const useRequestOverlap = requestFromTime != null && requestUntilTime != null;
  function occurrenceEnd(occurrenceStart) {
    const end = new Date(occurrenceStart);
    end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    if (end <= occurrenceStart) end.setDate(end.getDate() + 1);
    return end.getTime();
  }
  function overlapsRequest(occStart, occEndMs) {
    return occEndMs > requestFromTime && occStart.getTime() < requestUntilTime;
  }
  const startHours = startTime.getHours();
  const startMinutes = startTime.getMinutes();
  let currentDate = new Date(startDate);
  currentDate.setHours(startHours, startMinutes, 0, 0);
  const interval = recurrence.interval ?? 1;
  let iterations = 0;
  const maxIterations = 1e3;
  function getMondayOfWeek(date) {
    const monday = new Date(date);
    const day = date.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    monday.setDate(date.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }
  if (recurrence.pattern === "weekly" && recurrence.daysOfWeek?.length) {
    let checkDate = new Date(Math.max(now.getTime(), startDate.getTime()));
    checkDate.setHours(0, 0, 0, 0);
    if (useRequestOverlap && requestFromTime < checkDate.getTime()) {
      checkDate = new Date(requestFromTime);
      checkDate.setHours(0, 0, 0, 0);
      if (checkDate.getTime() < startDate.getTime()) checkDate = new Date(startDate);
    }
    const startWeekStart = getMondayOfWeek(startDate);
    while (occurrences.length < count && iterations < maxIterations) {
      iterations++;
      for (const dayOfWeek of recurrence.daysOfWeek) {
        const weekStart = getMondayOfWeek(checkDate);
        const targetDate = new Date(weekStart);
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        targetDate.setDate(weekStart.getDate() + daysFromMonday);
        targetDate.setHours(startHours, startMinutes, 0, 0);
        if (targetDate < startDate) continue;
        const weeksDiff = Math.floor(
          (weekStart.getTime() - startWeekStart.getTime()) / (1e3 * 60 * 60 * 24 * 7)
        );
        if (weeksDiff < 0 || weeksDiff % interval !== 0) continue;
        if (recurrence.endDate) {
          const endDate = new Date(recurrence.endDate);
          endDate.setHours(23, 59, 59, 999);
          if (targetDate > endDate) continue;
        }
        if (recurrence.occurrences != null && occurrences.length >= recurrence.occurrences) break;
        const includeByTime = useRequestOverlap ? overlapsRequest(targetDate, occurrenceEnd(targetDate)) : targetDate >= now;
        if (includeByTime && !occurrences.some((occ) => occ.getTime() === targetDate.getTime())) {
          occurrences.push(new Date(targetDate));
          if (occurrences.length >= count) break;
        }
      }
      checkDate.setDate(checkDate.getDate() + 7);
    }
  } else {
    while (occurrences.length < count && iterations < maxIterations) {
      iterations++;
      let matches = false;
      switch (recurrence.pattern) {
        case "daily": {
          const daysDiff = Math.floor(
            (currentDate.getTime() - startDate.getTime()) / (1e3 * 60 * 60 * 24)
          );
          matches = daysDiff >= 0 && daysDiff % interval === 0;
          break;
        }
        case "weekly": {
          const weeksDiff = Math.floor(
            (currentDate.getTime() - startDate.getTime()) / (1e3 * 60 * 60 * 24 * 7)
          );
          matches = weeksDiff >= 0 && weeksDiff % interval === 0;
          break;
        }
        case "monthly":
          if (currentDate.getDate() === startDate.getDate()) {
            const monthsDiff = (currentDate.getFullYear() - startDate.getFullYear()) * 12 + (currentDate.getMonth() - startDate.getMonth());
            matches = monthsDiff >= 0 && monthsDiff % interval === 0;
          }
          break;
      }
      if (matches && recurrence.endDate) {
        const endDate = new Date(recurrence.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (currentDate > endDate) break;
      }
      if (matches && recurrence.occurrences != null && occurrences.length >= recurrence.occurrences)
        break;
      const occEndMs = occurrenceEnd(currentDate);
      const includeByTime = useRequestOverlap ? overlapsRequest(currentDate, occEndMs) : currentDate >= now;
      if (matches && includeByTime) occurrences.push(new Date(currentDate));
      currentDate = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(startHours, startMinutes, 0, 0);
    }
  }
  return occurrences.slice(0, count);
}

// src/shared/matching/expand.ts
var MAX_OCCURRENCES = 100;
function expandRecurringAvailability(availability, requestFrom, requestUntil) {
  const avFrom = toDate(availability.from);
  const avUntil = toDate(availability.until);
  if (!avFrom || !avUntil) return [];
  if (!availability.recurrence) {
    return [
      {
        availabilityId: availability.id,
        userId: availability.userId,
        spotId: availability.spotId,
        from: avFrom,
        until: avUntil,
        autoOffer: availability.autoOffer !== false,
        username: availability.username,
        phone: availability.phone
      }
    ];
  }
  const startDate = new Date(avFrom);
  startDate.setHours(0, 0, 0, 0);
  const startTime = avFrom;
  const endTime = avUntil;
  const reqFromDate = toDate(requestFrom) ?? (requestFrom && typeof requestFrom.toDate === "function" ? requestFrom.toDate() : new Date(requestFrom));
  const reqUntilDate = toDate(requestUntil) ?? (requestUntil && typeof requestUntil.toDate === "function" ? requestUntil.toDate() : new Date(requestUntil));
  const reqFromTime = reqFromDate.getTime();
  const reqUntilTime = reqUntilDate.getTime();
  const occurrences = calculateNextOccurrences(
    startDate,
    startTime,
    endTime,
    availability.recurrence,
    MAX_OCCURRENCES,
    reqFromTime,
    reqUntilTime
  );
  const windows = [];
  for (const occurrenceStart of occurrences) {
    const occurrenceEnd = new Date(occurrenceStart);
    occurrenceEnd.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    if (occurrenceEnd <= occurrenceStart) occurrenceEnd.setDate(occurrenceEnd.getDate() + 1);
    const occStartTime = occurrenceStart.getTime();
    const occEndTime = occurrenceEnd.getTime();
    if (occEndTime > reqFromTime && occStartTime < reqUntilTime) {
      windows.push({
        availabilityId: availability.id,
        userId: availability.userId,
        spotId: availability.spotId,
        from: occurrenceStart,
        until: occurrenceEnd,
        autoOffer: availability.autoOffer !== false,
        username: availability.username,
        phone: availability.phone,
        occurrenceDate: occurrenceStart
      });
    }
    if (occurrenceStart.getTime() > reqUntilTime) break;
  }
  return windows;
}

// src/shared/matching/overlap.ts
function toMs(v) {
  return v instanceof Date ? v.getTime() : v.toDate().getTime();
}
function overlaps(requestFrom, requestUntil, windowFrom, windowUntil) {
  const reqFrom = toMs(requestFrom);
  const reqUntil = toMs(requestUntil);
  const winFrom = toMs(windowFrom);
  const winUntil = toMs(windowUntil);
  return reqFrom < winUntil && reqUntil > winFrom;
}
function calculateOverlapPercentage(requestFrom, requestUntil, windowFrom, windowUntil) {
  const reqFrom = toMs(requestFrom);
  const reqUntil = toMs(requestUntil);
  const winFrom = toMs(windowFrom);
  const winUntil = toMs(windowUntil);
  const requestDuration = reqUntil - reqFrom;
  if (requestDuration <= 0) return 0;
  const overlapStart = Math.max(reqFrom, winFrom);
  const overlapEnd = Math.min(reqUntil, winUntil);
  const overlapDuration = Math.max(0, overlapEnd - overlapStart);
  return overlapDuration / requestDuration;
}

// src/shared/matching/scoring.ts
function toMs2(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v.toDate === "function")
    return v.toDate().getTime();
  if (typeof v.getTime === "function")
    return v.getTime();
  return new Date(v).getTime();
}
function calculateMatchScore(requestFrom, requestUntil, window) {
  let score = 0;
  const reqFrom = toMs2(requestFrom);
  const reqUntil = toMs2(requestUntil);
  const winFrom = toMs2(window.from);
  const winUntil = toMs2(window.until);
  const startDiff = Math.abs(reqFrom - winFrom);
  if (startDiff === 0) score += 1e3;
  else if (startDiff <= 15 * 60 * 1e3)
    score += 500 - startDiff / (15 * 60 * 1e3) * 500;
  const endDiff = Math.abs(reqUntil - winUntil);
  if (endDiff === 0) score += 800;
  else if (endDiff <= 15 * 60 * 1e3) score += 400 - endDiff / (15 * 60 * 1e3) * 400;
  score += calculateOverlapPercentage(requestFrom, requestUntil, window.from, window.until) * 300;
  if (overlaps(requestFrom, requestUntil, window.from, window.until)) score += 100;
  return score;
}

// src/shared/matching/offerWindow.ts
function toMs3(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v.toDate === "function")
    return v.toDate().getTime();
  return v.getTime();
}
function calculateOfferTimeWindow(requestFrom, requestUntil, windowFrom, windowUntil) {
  const reqFrom = toMs3(requestFrom);
  const reqUntil = toMs3(requestUntil);
  const winFrom = toMs3(windowFrom);
  const winUntil = toMs3(windowUntil);
  return {
    from: new Date(Math.max(reqFrom, winFrom)),
    until: new Date(Math.min(reqUntil, winUntil))
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  calculateMatchScore,
  calculateNextOccurrences,
  calculateOfferTimeWindow,
  calculateOverlapPercentage,
  expandRecurringAvailability,
  overlaps,
  toDate
});
