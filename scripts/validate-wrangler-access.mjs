import fs from 'node:fs';

function stripJsoncComments(source) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const current = source[i];
    const next = source[i + 1];
    if (inString) {
      output += current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }
    if (current === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      output += '\n';
      continue;
    }
    if (current === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    output += current;
  }
  return output;
}

function assertTeamDomain(value, target) {
  let url;
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new Error(`${target}: ACCESS_TEAM_DOMAIN is not a valid URL/domain.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      !(url.hostname.toLowerCase().endsWith('.cloudflareaccess.com') &&
        /^[a-z0-9-]+$/i.test(url.hostname.slice(0, -'.cloudflareaccess.com'.length)))) {
    throw new Error(`${target}: ACCESS_TEAM_DOMAIN must be an HTTPS Cloudflare Access team domain.`);
  }
}

function validateTarget(config, target, requireValues) {
  const vars = config.env?.[target]?.vars;
  if (!vars || vars.ACCESS_ENFORCED !== 'true') {
    throw new Error(`${target}: ACCESS_ENFORCED must be the string "true".`);
  }

  const appBaseUrl = vars.APP_BASE_URL;
  const googleClientId = vars.GOOGLE_CLIENT_ID;
  const appBasePlaceholder = `REPLACE_WITH_${target.toUpperCase()}_APP_BASE_URL`;
  const googleClientPlaceholder = `REPLACE_WITH_${target.toUpperCase()}_GOOGLE_CLIENT_ID`;
  if (typeof appBaseUrl !== 'string' || !appBaseUrl.trim() ||
      typeof googleClientId !== 'string' || !googleClientId.trim()) {
    throw new Error(`${target}: APP_BASE_URL and GOOGLE_CLIENT_ID must be declared in this environment's vars block.`);
  }
  const isAppBasePlaceholder = appBaseUrl === appBasePlaceholder;
  const isGoogleClientPlaceholder = googleClientId === googleClientPlaceholder;
  if (requireValues && (appBaseUrl.startsWith('REPLACE_WITH_') || googleClientId.startsWith('REPLACE_WITH_'))) {
    throw new Error(`${target}: replace APP_BASE_URL and GOOGLE_CLIENT_ID placeholders before deployment.`);
  }
  if (!requireValues && (appBaseUrl.startsWith('REPLACE_WITH_') || googleClientId.startsWith('REPLACE_WITH_'))) {
    if (!isAppBasePlaceholder || !isGoogleClientPlaceholder) {
      throw new Error(`${target}: only exact APP_BASE_URL and GOOGLE_CLIENT_ID placeholders are allowed before deployment.`);
    }
    console.log(`${target}: APP_BASE_URL and Google OAuth client ID placeholders await environment provisioning.`);
  } else {
    let base;
    try { base = new URL(appBaseUrl); }
    catch { throw new Error(`${target}: APP_BASE_URL must be an absolute URL.`); }
    if (base.protocol !== 'https:' || base.username || base.password || base.port ||
        base.pathname !== '/' || base.search || base.hash) {
      throw new Error(`${target}: APP_BASE_URL must be an HTTPS origin without a path, query, or fragment.`);
    }
    if (!/^[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$/.test(googleClientId)) {
      throw new Error(`${target}: GOOGLE_CLIENT_ID must be a Google OAuth Web client ID.`);
    }
  }
  const teamDomain = vars.ACCESS_TEAM_DOMAIN;
  const audience = vars.ACCESS_AUD;
  if (typeof teamDomain !== 'string' || !teamDomain.trim() ||
      typeof audience !== 'string' || !audience.trim() || audience.length > 256) {
    throw new Error(`${target}: ACCESS_TEAM_DOMAIN and ACCESS_AUD are required.`);
  }

  const expectedTeam = `REPLACE_WITH_${target.toUpperCase()}_ACCESS_TEAM_DOMAIN`;
  const expectedAud = `REPLACE_WITH_${target.toUpperCase()}_ACCESS_AUD`;
  const teamPlaceholder = teamDomain === expectedTeam;
  const audPlaceholder = audience === expectedAud;
  if (requireValues && (teamPlaceholder || audPlaceholder || teamDomain.startsWith('REPLACE_WITH_') || audience.startsWith('REPLACE_WITH_'))) {
    throw new Error(`${target}: replace the Access team-domain and AUD placeholders before deployment.`);
  }
  if (!requireValues && (teamDomain.startsWith('REPLACE_WITH_') || audience.startsWith('REPLACE_WITH_'))) {
    if (!teamPlaceholder || !audPlaceholder) {
      throw new Error(`${target}: only that environment's exact Access placeholders are allowed before deployment.`);
    }
    console.log(`${target}: fail-closed Access enforcement enabled; separate team-domain/AUD placeholders are awaiting provisioning.`);
    return;
  }
  assertTeamDomain(teamDomain, target);
  console.log(`${target}: Access enforcement and team-domain/AUD configuration are valid.`);
}

const configPath = new URL('../wrangler.jsonc', import.meta.url);
const config = JSON.parse(stripJsoncComments(fs.readFileSync(configPath, 'utf8')));
const requireValues = process.argv.includes('--require-values');
const target = process.env.TARGET;
const targets = requireValues ? [target] : ['staging', 'production'];
if (targets.some((value) => value !== 'staging' && value !== 'production')) {
  throw new Error('TARGET must be staging or production when --require-values is supplied.');
}
for (const value of targets) validateTarget(config, value, requireValues);
