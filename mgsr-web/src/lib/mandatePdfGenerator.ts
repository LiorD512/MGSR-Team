/**
 * Generates Football Agent Mandate PDF - matches Android MandatePdfGenerator structure.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const LINE_HEIGHT = 14;
const TITLE_SIZE = 16;
const HEADING_SIZE = 12;
const BODY_SIZE = 10;
const AGENCY_NAME = 'MGSR Group';
const LOGO_WIDTH_PT = 120;
const LOGO_HEIGHT_PT = 42;

export interface PassportDetails {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  passportNumber?: string;
  nationality?: string;
}

export interface MandateData {
  passportDetails: PassportDetails;
  effectiveDate: Date;
  expiryDate: Date;
  validLeagues: string[];
  agentName: string;
  fifaLicenseId: string;
}

function formatDobToDdMmYyyy(dob: string | undefined): string {
  if (!dob?.trim()) return '-';
  const m = dob.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const m2 = dob.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (m2) {
    const [, d, mo, y] = m2;
    const year = (y?.length ?? 0) === 2 ? (parseInt(y!, 10) >= 50 ? '19' : '20') + y : y;
    return `${d!.padStart(2, '0')}/${mo!.padStart(2, '0')}/${year}`;
  }
  return dob;
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function loadLogoPng(): Promise<Uint8Array | null> {
  try {
    // Use logo_black.svg (matches Android mandate - horizontal layout, black text)
    const logoPath = path.join(process.cwd(), 'public', 'logo_black.svg');
    if (!fs.existsSync(logoPath)) return null;
    const svgBuffer = fs.readFileSync(logoPath);
    const pngBuffer = await sharp(svgBuffer)
      .resize(LOGO_WIDTH_PT * 2, LOGO_HEIGHT_PT * 2)
      .png()
      .toBuffer();
    return new Uint8Array(pngBuffer);
  } catch {
    return null;
  }
}

export async function generateMandatePdf(data: MandateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageNum = 1;

  const logoPng = await loadLogoPng();
  if (logoPng) {
    try {
      const logoImage = await doc.embedPng(logoPng);
      page.drawImage(logoImage, {
        x: MARGIN,
        y: y - LOGO_HEIGHT_PT,
        width: LOGO_WIDTH_PT,
        height: LOGO_HEIGHT_PT,
      });
      y -= LOGO_HEIGHT_PT + 12;
    } catch {
      // Skip logo if embed fails
    }
  }

  const drawText = (text: string, size: number, bold: boolean, centered = false) => {
    const f = bold ? fontBold : font;
    const lines = wrapText(text, f, size, PAGE_WIDTH - 2 * MARGIN);
    for (const line of lines) {
      if (y < MARGIN + 30) {
        page.drawText(`-- ${pageNum} --`, {
          x: PAGE_WIDTH / 2 - 25,
          y: 20,
          size: 9,
          font,
          color: black,
        });
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        pageNum++;
        y = PAGE_HEIGHT - MARGIN;
      }
      const x = centered ? (PAGE_WIDTH - f.widthOfTextAtSize(line, size)) / 2 : MARGIN;
      page.drawText(line, { x, y, size, font: f, color: black });
      y -= LINE_HEIGHT;
    }
  };

  drawText('Agent Service Authorization', TITLE_SIZE, true, true);
  y -= 4;
  drawText('FOOTBALL AGENT MANDATE', HEADING_SIZE, true, true);
  y -= 8;

  const effectiveStr = formatDate(data.effectiveDate);
  drawText(
    `This Football Agent Mandate (the "Mandate") is made on ${effectiveStr} (the "Effective Date") by and between:`,
    BODY_SIZE,
    false
  );
  y -= 8;

  const playerName = [data.passportDetails.firstName, data.passportDetails.lastName]
    .filter(Boolean)
    .join(' ') || '-';
  const dob = formatDobToDdMmYyyy(data.passportDetails.dateOfBirth);
  const nationality = data.passportDetails.nationality || '-';
  const passportNo = data.passportDetails.passportNumber || '-';

  drawText(
    `${playerName}, born: ${dob} nationality: ${nationality}, identification document: passport No.: ${passportNo}.`,
    BODY_SIZE,
    false
  );
  y -= 4;
  drawText(
    `${data.agentName}, FIFA Licensed Football Agent License ID: ${data.fifaLicenseId}, acting through ${AGENCY_NAME}.`,
    BODY_SIZE,
    false
  );
  y -= 4;
  drawText('The Player and the Football Agent are the "Parties" and each a "Party."', BODY_SIZE, false);
  y -= 4;
  if (data.validLeagues.length > 0) {
    drawText('Valid Leagues for this mandate:', HEADING_SIZE, true);
    y -= 4;
    for (const league of data.validLeagues) {
      drawText(`- ${league}`, BODY_SIZE, false);
    }
  }
  y -= 12;

  const sections = [
    ['APPOINTMENT AND SERVICES', '1. The Player appoints the Football Agent, acting through his Agency, on a valid leagues mentions in the mandate and exclusive basis to provide football agent services, including identifying and presenting opportunities to conclude an employment contract and/or facilitating and negotiating the conclusion of an employment contract or other football-related transaction, as well as related activities such as scouting opportunities, trials, introductions, club communications, meetings, negotiation support (employment, extension, variation, termination or settlement), and regulatory or administrative assistance connected to registration and documentation.'],
    ['', '2. The Football Agent has no authority to sign any employment, transfer, or loan agreement on behalf of the Player. The Player shall personally approve and sign all such agreements.'],
    ['EXCLUSIVITY', '3. The Mandate is exclusive. During the Term, the Player shall not appoint, consult, or use any third party, whether licensed or unlicensed, to perform football agent services or to negotiate or facilitate a transaction on the Player\'s behalf, In the valid leagues.'],
    ['', '4. The Player may negotiate directly with a club on his own behalf, provided no third party performs football agent services.'],
    ['TERM', `5. The Mandate starts on ${effectiveStr} and ends on ${formatDate(data.expiryDate)} (the "Term").`],
    ['SERVICE FEE', '6. In consideration of the exclusive Mandate, If the club does not pay any commission, the player will pay the agent 5% of his salary on monthly basis (exclude bonuses and other non-base salary).'],
    ['', 'In case the club will pay the commission \u2013 the commission will be paid the agent (if there more than 1 agents involved from other agencies, the commission will be paid equally 50-50%.'],
    ['', '7. The service fee accrues monthly, pro rata to remuneration received. The Football Agent shall issue monthly invoices, each payable within fourteen (14) days of receipt.'],
    ['', '8. Payment shall be made to the Agency\'s designated account and is exclusive of VAT, if applicable.'],
    ['', '9. The Player might need to permit dual representation being allowed by the applicable regulatory framework, without prejudice to any transaction-specific disclosures and consents required at the relevant time.'],
    ['', '10. The parties agree that the service fee will be paid in direct connection with the football agent\'s actual involvement in the final negotiations or signing.'],
    ['', '11. If an employment contract concluded during the Term continues beyond the Term, the Football Agent remains entitled to the service fee for as long as that employment contract remains in force, until the Player, acting in good faith and without the Football Agent\'s involvement, signs a new employment contract with materially different financial terms or duration.'],
    ['CUMULATIVE PENALTY', '12. If the Player breaches this Mandate, including by violating exclusivity, using a third party to perform football agent services, or revoking or terminating the Mandate at an inopportune time, the Player shall pay a contractual penalty equal to 20% (in USD or EURO depends how the player get paid) of the player monthly salary. The penalty is cumulative and payable in addition to the service fee.'],
    ['RIGHTS AND OBLIGATIONS', '13. The Football Agent shall act independently, diligently, and in the Player\'s best interests, perform the football agent services in compliance with this Mandate and applicable regulations, keep the Player promptly informed of any material developments, be reasonably available for consultation, and enter into dual representation only where expressly permitted and after all required prior written disclosures and consents have been obtained.'],
    ['', '14. The Player represents and undertakes that he has full legal capacity to enter into this Mandate, will promptly inform the Football Agent of any approach or inquiry relating to a potential transaction, will provide all information reasonably required for the performance of the services, will pay the service fee and any other amounts due, and will comply with all applicable football regulations.'],
    ['', '15. The Parties shall cooperate in good faith and execute any disclosures, declarations, or consents required by the FIFA Football Agent Regulations or by any competent football authority in connection with the performance of this Mandate.'],
    ['TERMINATION', '16. Either Party may terminate this Mandate for just cause by written notice to the other Party.'],
    ['', '17. Just cause exists where, in accordance with good faith, a Party cannot reasonably be expected to continue the contractual relationship, including where the other Party commits a material breach and fails to remedy it within fourteen (14) days of receipt of written notice specifying the breach, if such breach is capable of remedy.'],
    ['', '18. Termination shall not affect rights or obligations accrued prior to termination, nor provisions intended to survive termination, including service fees already earned, survival of remuneration rights, exclusivity consequences, confidentiality, and dispute resolution.'],
    ['GOVERNING LAW AND ARBITRATION', '19. This Mandate is governed by Swiss law.'],
    ['', '20. Any dispute arising out of or in connection with this Mandate shall be submitted exclusively to the Court of Arbitration for Sport (CAS), Lausanne, before a sole arbitrator, in English, under an expedited procedure with CAS deadlines reduced by half to the extent permitted. CAS shall notify the operative part of the award prior to the reasons.'],
    ['', '21. The Football Agent and the Agency each have standing to sue and enforce this arbitration agreement and any award.'],
    ['INDEPENDENT LEGAL ADVICE', '22. The Player confirms that the Football Agent informed him in writing that he should consider obtaining independent legal advice and that the Player has either obtained such advice or knowingly waived it, as confirmed in the attached annex.'],
    ['SIGNATURES', 'A copy of the Agreement has been provided to the Player.'],
  ];

  for (const [heading, body] of sections) {
    if (heading) drawText(heading, HEADING_SIZE, true);
    if (body) drawText(body, BODY_SIZE, false);
    y -= heading && body ? 4 : 8;
  }

  // Fillable signature fields - player and agent sign in the PDF
  const form = doc.getForm();
  const sigFieldH = 18;
  const sigFieldW = 180;
  const printFieldW = 350;
  const dateFieldW = 90;

  const playerLabel = 'Signed by the Player: ';
  const dateLabel = 'Date: ';
  const agentLabel = 'Signed by the Agent: ';
  const printLabel = 'Print Name: ';

  page.drawText(playerLabel, { x: MARGIN, y, size: BODY_SIZE, font, color: black });
  const playerSigX = MARGIN + font.widthOfTextAtSize(playerLabel, BODY_SIZE) + 4;
  const playerSigField = form.createTextField('player_signature');
  playerSigField.addToPage(page, {
    x: playerSigX,
    y: y - 2,
    width: sigFieldW,
    height: sigFieldH,
    borderColor: black,
    borderWidth: 1,
    font,
  });
  playerSigField.setFontSize(BODY_SIZE);
  playerSigField.defaultUpdateAppearances(font);
  const dateX = playerSigX + sigFieldW + 12;
  page.drawText(dateLabel, { x: dateX, y, size: BODY_SIZE, font, color: black });
  const playerDateField = form.createTextField('player_date');
  playerDateField.addToPage(page, {
    x: dateX + font.widthOfTextAtSize(dateLabel, BODY_SIZE) + 4,
    y: y - 2,
    width: dateFieldW,
    height: sigFieldH,
    borderColor: black,
    borderWidth: 1,
    font,
  });
  playerDateField.setFontSize(BODY_SIZE);
  playerDateField.defaultUpdateAppearances(font);
  y -= sigFieldH + 12;

  page.drawText(printLabel, { x: MARGIN, y, size: BODY_SIZE, font, color: black });
  const playerPrintField = form.createTextField('player_print_name');
  playerPrintField.addToPage(page, {
    x: MARGIN + font.widthOfTextAtSize(printLabel, BODY_SIZE) + 4,
    y: y - 2,
    width: printFieldW,
    height: sigFieldH,
    borderColor: black,
    borderWidth: 1,
    font,
  });
  playerPrintField.setFontSize(BODY_SIZE);
  playerPrintField.defaultUpdateAppearances(font);
  y -= sigFieldH + 12;

  page.drawText(agentLabel, { x: MARGIN, y, size: BODY_SIZE, font, color: black });
  const agentSigX = MARGIN + font.widthOfTextAtSize(agentLabel, BODY_SIZE) + 4;
  const agentSigField = form.createTextField('agent_signature');
  agentSigField.addToPage(page, {
    x: agentSigX,
    y: y - 2,
    width: sigFieldW,
    height: sigFieldH,
    borderColor: black,
    borderWidth: 1,
    font,
  });
  agentSigField.setFontSize(BODY_SIZE);
  agentSigField.defaultUpdateAppearances(font);
  const agentDateX = agentSigX + sigFieldW + 12;
  page.drawText(dateLabel, { x: agentDateX, y, size: BODY_SIZE, font, color: black });
  const agentDateField = form.createTextField('agent_date');
  agentDateField.addToPage(page, {
    x: agentDateX + font.widthOfTextAtSize(dateLabel, BODY_SIZE) + 4,
    y: y - 2,
    width: dateFieldW,
    height: sigFieldH,
    borderColor: black,
    borderWidth: 1,
    font,
  });
  agentDateField.setFontSize(BODY_SIZE);
  agentDateField.defaultUpdateAppearances(font);
  y -= sigFieldH + 12;

  page.drawText(printLabel, { x: MARGIN, y, size: BODY_SIZE, font, color: black });
  const agentNameField = form.createTextField('agent_print_name');
  agentNameField.addToPage(page, {
    x: MARGIN + font.widthOfTextAtSize(printLabel, BODY_SIZE) + 4,
    y: y - 2,
    width: printFieldW,
    height: sigFieldH,
    borderColor: black,
    borderWidth: 1,
    font,
  });
  agentNameField.setFontSize(BODY_SIZE);
  agentNameField.setText(data.agentName);
  agentNameField.defaultUpdateAppearances(font);
  y -= sigFieldH + 8;

  page.drawText(`-- ${pageNum} --`, {
    x: PAGE_WIDTH / 2 - 25,
    y: 20,
    size: 9,
    font,
    color: black,
  });

  return doc.save();
}

function wrapText(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
