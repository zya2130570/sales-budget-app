// ── Merchant Normalization ────────────────────────────────────────────────────
// Cleans up raw bank-export merchant strings into friendly display names.
// Strips common bank prefixes (SQ*, TST*), store numbers, and maps well-known
// brand variations to canonical names.

const MERCHANT_ALIASES: Array<[RegExp, string]> = [
  [/^MCDONALDS?(\s|$)/i,                      "McDonald's"],
  [/^CHICK.FIL.A/i,                            'Chick-fil-A'],
  [/^CHIPOTLE/i,                               'Chipotle'],
  [/^AMZN\s*MKTPLACE/i,                       'Amazon'],
  [/^AMAZON\s*(COM|MKTPLACE|PRIME|DIGITAL)?/i, 'Amazon'],
  [/^WHOLEFDS|WHOLE\s*FOODS/i,                'Whole Foods'],
  [/^STARBUCKS|SBUX/i,                        'Starbucks'],
  [/^DUNKIN/i,                                 "Dunkin'"],
  [/^WALMART|WAL.MART/i,                      'Walmart'],
  [/^TARGET(\s|$)/i,                           'Target'],
  [/^COSTCO/i,                                 'Costco'],
  [/^NETFLIX(\s|$|\.)/i,                      'Netflix'],
  [/^SPOTIFY(\s|$)/i,                         'Spotify'],
  [/^APPLE\.?COM\/?BILL?/i,                  'Apple'],
  [/^APPLE(\s|$)/i,                            'Apple'],
  [/^OPENAI/i,                                 'OpenAI'],
  [/^GOOGLE(\s*(ONE|STORAGE|PLAY|LLC))?/i,    'Google'],
  [/^DOORDASH/i,                               'DoorDash'],
  [/^UBER\s*EATS/i,                            'Uber Eats'],
  [/^UBER(\s|$)/i,                             'Uber'],
  [/^GRUBHUB/i,                                'Grubhub'],
  [/^CHEVRON/i,                                'Chevron'],
  [/^EXXON/i,                                  'ExxonMobil'],
  [/^SHELL(\s|$)/i,                            'Shell'],
  [/^VENMO\b/i,                                'Venmo'],
  [/^PAYPAL\b/i,                               'PayPal'],
  [/^HULU(\s|$)/i,                             'Hulu'],
  [/^DISNEY\s*PLUS|DISNEY\+/i,                'Disney+'],
  [/^YOUTUBE\s*PREMIUM/i,                      'YouTube Premium'],
  [/^MICROSOFT(\s|$)/i,                        'Microsoft'],
  [/^AMAZON\s*WEB|AWS/i,                      'AWS'],
  [/^GITHUB(\s|$)/i,                           'GitHub'],
]

export function normalizeMerchant(raw: string): string {
  if (!raw) return raw
  // Strip common bank prefixes (SQ *, TST *, PP *)
  const stripped = raw.replace(/^(SQ|TST|PP)\s*\*/i, '').replace(/\*/g, ' ').replace(/\s+/g, ' ').trim()
  for (const [pattern, name] of MERCHANT_ALIASES) {
    if (pattern.test(stripped)) return name
  }
  // Strip trailing store/location numbers: "TARGET #4821" → "Target"
  const noNum = stripped.replace(/\s+#\d+$/, '').replace(/\s+\d{4,}$/, '').trim()
  // Apply title-case to all-caps strings
  if (noNum === noNum.toUpperCase() && noNum.length > 3) {
    return noNum.replace(/\b\w/g, c => c.toUpperCase()).toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  }
  return noNum || stripped
}
