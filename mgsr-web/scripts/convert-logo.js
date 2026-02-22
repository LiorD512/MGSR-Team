#!/usr/bin/env node
/**
 * Converts Android vector drawable (for_app_logo.xml) to web SVG.
 * Single source of truth: app/src/main/res/drawable/for_app_logo.xml
 */

const fs = require('fs');
const path = require('path');

const ANDROID_LOGO = path.join(__dirname, '../../app/src/main/res/drawable/for_app_logo.xml');
const WEB_LOGO = path.join(__dirname, '../public/logo.svg');
const WEB_ICON = path.join(__dirname, '../src/app/icon.svg');

const xml = fs.readFileSync(ANDROID_LOGO, 'utf8');

// Convert Android vector to standard SVG
// vector with android attrs -> svg with standard attrs
// path android:pathData -> d, android:fillColor -> fill
let svg = xml
  .replace(
    /<vector[^>]*android:width="(\d+)dp"[^>]*android:height="(\d+)dp"[^>]*android:viewportWidth="(\d+)"[^>]*android:viewportHeight="(\d+)"[^>]*>/,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $3 $4" width="$3" height="$4">'
  )
  .replace(/<\/vector>/, '</svg>')
  .replace(
    /<path\s+android:pathData="([^"]+)"\s+android:fillColor="([^"]+)"\s*\/>/g,
    '<path fill="$2" d="$1"/>'
  );

// Ensure proper formatting
svg = svg.replace(/>\s+</g, '>\n  <').trim();

fs.writeFileSync(WEB_LOGO, svg);
fs.writeFileSync(WEB_ICON, svg);
console.log('Logo converted from for_app_logo.xml -> logo.svg, icon.svg');