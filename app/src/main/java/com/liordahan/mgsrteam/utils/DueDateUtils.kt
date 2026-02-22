package com.liordahan.mgsrteam.utils

import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

/**
 * Converts a UTC-midnight timestamp (as returned by Material3 DatePicker's selectedDateMillis)
 * to local-midnight. The DatePicker returns the selected date at 00:00 UTC, which in timezones
 * behind UTC (e.g. US) becomes the previous calendar day. This normalizes to the user's
 * selected date at midnight in their local timezone.
 */
fun datePickerMillisToLocalMidnight(utcMidnightMillis: Long): Long {
    val utcDate = Instant.ofEpochMilli(utcMidnightMillis).atZone(ZoneOffset.UTC).toLocalDate()
    return utcDate.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
}

/**
 * Converts local-midnight timestamp to UTC-midnight for Material3 DatePicker's initialSelectedDateMillis.
 * Use when passing an existing due date to the DatePicker so it displays the correct date.
 */
fun localMidnightToDatePickerMillis(localMidnightMillis: Long): Long {
    val localDate = Instant.ofEpochMilli(localMidnightMillis).atZone(ZoneId.systemDefault()).toLocalDate()
    return localDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
}

/**
 * Returns the number of calendar days between [fromMillis] and [epochMillis].
 * Positive when epochMillis is after fromMillis (e.g. due date is in the future).
 * Uses the device's default timezone for correct day boundaries.
 *
 * This fixes the bug where "tomorrow" showed as "today" when using raw millisecond
 * division: (epochMillis - now) / dayMs truncates when the due date is midnight
 * and current time is afternoon (e.g. 9 hours / 24 = 0).
 */
fun daysBetweenCalendarDays(epochMillis: Long, fromMillis: Long): Int {
    val zone = ZoneId.systemDefault()
    val dueDate = Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate()
    val fromDate = Instant.ofEpochMilli(fromMillis).atZone(zone).toLocalDate()
    return ChronoUnit.DAYS.between(fromDate, dueDate).toInt()
}
