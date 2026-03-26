#!/usr/bin/env node
/**
 * Converts Android vector drawables to web SVG.
 * for_app_logo.xml -> logo.svg, icon.svg
 * logo_black.xml -> logo_black.svg (for mandate PDF, matches app)
 */

const fs = require('fs');
const path = require('path');

function convertVector(xmlPath, outPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
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
  svg = svg.replace(/>\s+</g, '>\n  <').trim();
  fs.writeFileSync(outPath, svg);
}

const forAppLogo = path.join(__dirname, '../../app/src/main/res/drawable/for_app_logo.xml');
const logoBlack = path.join(__dirname, '../../app/src/main/res/drawable/logo_black.xml');

if (!fs.existsSync(forAppLogo)) {
  console.log('Skipping logo conversion (Android source not available in this environment)');
  process.exit(0);
}

convertVector(forAppLogo, path.join(__dirname, '../public/logo.svg'));
convertVector(forAppLogo, path.join(__dirname, '../src/app/icon.svg'));
if (fs.existsSync(logoBlack)) {
  convertVector(logoBlack, path.join(__dirname, '../public/logo_black.svg'));
  console.log('Logo converted from for_app_logo.xml -> logo.svg, icon.svg; logo_black.xml -> logo_black.svg');
} else {
  console.log('Logo converted from for_app_logo.xml -> logo.svg, icon.svg');
}