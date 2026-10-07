#!/usr/bin/env node
/**
 * Converts Android vector drawables to web SVG.
 * for_app_logo.xml -> logo.svg, icon.svg
 * logo_black.xml -> logo_black.svg (for mandate PDF, matches app)
 *
 * Handles two kinds of paths:
 *  1. Solid fill:   <path android:pathData="..." android:fillColor="#rgb"/>
 *  2. Gradient fill: <path android:pathData="...">
 *                      <aapt:attr name="android:fillColor">
 *                        <gradient android:startX/startY/endX/endY android:type="linear">
 *                          <item android:offset="0" android:color="#AARRGGBB"/> ...
 *                        </gradient>
 *                      </aapt:attr>
 *                    </path>
 * The previous version silently dropped case (2), leaving raw android:*
 * markup in the output so browsers rendered nothing for that path (the
 * monogram) -> blank/black favicon. We now emit a proper <linearGradient>.
 */

const fs = require('fs');
const path = require('path');

// Convert Android #AARRGGBB (or #RRGGBB) to CSS. SVG uses stop-opacity for alpha.
function androidColorToSvg(color) {
  const hex = color.replace('#', '');
  if (hex.length === 8) {
    const a = parseInt(hex.slice(0, 2), 16) / 255;
    const rgb = '#' + hex.slice(2);
    return { color: rgb, opacity: a };
  }
  return { color: '#' + hex, opacity: 1 };
}

function convertVector(xmlPath, outPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  let gradientSeq = 0;
  const gradientDefs = [];

  // 1) Open/close vector -> svg.
  let svg = xml
    .replace(
      /<vector[^>]*android:width="(\d+)dp"[^>]*android:height="(\d+)dp"[^>]*android:viewportWidth="(\d+)"[^>]*android:viewportHeight="(\d+)"[^>]*>/,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $3 $4" width="$3" height="$4">'
    )
    .replace(/<\/vector>/, '</svg>');

  // 2) Gradient paths: <path android:pathData="..."> ... <gradient...>...</path>
  svg = svg.replace(
    /<path\s+android:pathData="([^"]+)"\s*>\s*<aapt:attr[^>]*>\s*<gradient([^>]*)>([\s\S]*?)<\/gradient>\s*<\/aapt:attr>\s*<\/path>/g,
    (_m, pathData, gradAttrs, stopsXml) => {
      const id = `grad${gradientSeq++}`;
      const num = (name) => {
        const m = gradAttrs.match(new RegExp(`android:${name}="([^"]+)"`));
        return m ? m[1] : '0';
      };
      const x1 = num('startX');
      const y1 = num('startY');
      const x2 = num('endX');
      const y2 = num('endY');

      const stops = [];
      const stopRe = /<item\s+android:offset="([^"]+)"\s+android:color="([^"]+)"\s*\/>/g;
      let s;
      while ((s = stopRe.exec(stopsXml)) !== null) {
        const { color, opacity } = androidColorToSvg(s[2]);
        const op = opacity < 1 ? ` stop-opacity="${opacity}"` : '';
        stops.push(`      <stop offset="${s[1]}" stop-color="${color}"${op}/>`);
      }

      gradientDefs.push(
        `    <linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">\n${stops.join('\n')}\n    </linearGradient>`
      );
      return `<path d="${pathData}" fill="url(#${id})"/>`;
    }
  );

  // 3) Solid-fill paths.
  svg = svg.replace(
    /<path\s+android:pathData="([^"]+)"\s+android:fillColor="([^"]+)"\s*\/>/g,
    (_m, pathData, color) => {
      const { color: c, opacity } = androidColorToSvg(color);
      const op = opacity < 1 ? ` fill-opacity="${opacity}"` : '';
      return `<path fill="${c}" d="${pathData}"${op}/>`;
    }
  );

  // 4) Inject gradient <defs> before </svg> if any were produced.
  if (gradientDefs.length) {
    svg = svg.replace(/<\/svg>/, `  <defs>\n${gradientDefs.join('\n')}\n  </defs>\n</svg>`);
  }

  // 5) Tidy whitespace.
  svg = svg.replace(/>\s+</g, '>\n  <').trim();

  // Fail loudly if any Android markup survived — never ship a broken icon again.
  if (/android:|aapt:/.test(svg)) {
    throw new Error(
      `convert-logo: unconverted Android markup remained in ${path.basename(outPath)}. ` +
        `The source vector uses a construct this script does not handle.`
    );
  }

  fs.writeFileSync(outPath, svg + '\n');
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
