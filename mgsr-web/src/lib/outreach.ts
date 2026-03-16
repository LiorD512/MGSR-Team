const DEFAULT_TEMPLATE =
  "Hey {firstName}, {agentName} here from MGSR Football Agency. Been tracking your recent performances — really like what I see. I think there could be some interesting options for you. Drop me your WhatsApp and let's talk.";

interface TemplateVars {
  playerName?: string;
  agentName?: string;
  playerPosition?: string;
}

export function resolveTemplate(
  vars: TemplateVars,
  template: string = DEFAULT_TEMPLATE,
): string {
  const firstName = vars.playerName?.split(/\s+/)[0] || 'there';
  return template
    .replace(/\{firstName\}/g, firstName)
    .replace(/\{playerName\}/g, vars.playerName || 'there')
    .replace(/\{agentName\}/g, vars.agentName || 'an agent')
    .replace(/\{playerPosition\}/g, vars.playerPosition || '');
}

export function getInstagramDmUrl(handle: string): string {
  return `https://ig.me/m/${handle}`;
}

export function getInstagramProfileUrl(handle: string): string {
  return `https://instagram.com/${handle}`;
}
