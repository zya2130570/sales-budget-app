
// ── V35 Bank Templates ─────────────────────────────────────────────────────
export type BankTemplate = {
  id: string
  name: string
  emoji: string
  instructions: string[]
  sampleHeaders?: string  // what the CSV header row looks like
  normalizeHeaders?: (h: string) => string  // map non-standard headers
}

export const BANK_TEMPLATES: BankTemplate[] = [
  {
    id: 'apple-card',
    name: 'Apple Card',
    emoji: '🍎',
    instructions: [
      'Open the Wallet app on your iPhone',
      'Tap Apple Card → tap the "⋯" menu (top right)',
      'Tap "Export Transactions"',
      'Select your date range → tap "Export"',
    ],
    sampleHeaders: 'Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD)',
  },
  {
    id: 'chase-csv',
    name: 'Chase',
    emoji: '🏦',
    instructions: [
      'Log in to chase.com',
      'Go to your account → click "Download" or "Export"',
      'Choose date range → select "CSV" format',
      'Save the file and upload it here',
    ],
    sampleHeaders: 'Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #',
    normalizeHeaders: (h: string) => {
      const map: Record<string, string> = { 'posting date': 'date', 'description': 'merchant' }
      return map[h.toLowerCase()] ?? h
    },
  },
  {
    id: 'bofa',
    name: 'Bank of America',
    emoji: '🏦',
    instructions: [
      'Log in to bankofamerica.com',
      'Go to your account → click "Download" (top right)',
      'Select date range → choose "Comma Separated Values (CSV)"',
      'Download and upload the file here',
    ],
    sampleHeaders: 'Posted Date,Reference Number,Payee,Address,Amount',
    normalizeHeaders: (h: string) => {
      const map: Record<string, string> = { 'posted date': 'date', 'payee': 'merchant' }
      return map[h.toLowerCase()] ?? h
    },
  },
  {
    id: 'wellsfargo',
    name: 'Wells Fargo',
    emoji: '🏦',
    instructions: [
      'Log in to wellsfargo.com',
      'Go to Account Activity → click "Download Account Activity"',
      'Select date range → choose "Comma Delimited"',
      'Download and upload the file here',
    ],
    sampleHeaders: '(No header row — columns: Date, Amount, blank, blank, Description)',
  },
  {
    id: 'capitalone',
    name: 'Capital One',
    emoji: '💳',
    instructions: [
      'Log in to capitalone.com',
      'Go to Account Details → click "Export"',
      'Select date range → choose "CSV"',
      'Download and upload the file here',
    ],
    sampleHeaders: 'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
    normalizeHeaders: (h: string) => {
      const map: Record<string, string> = { 'transaction date': 'date', 'description': 'merchant', 'debit': 'amount' }
      return map[h.toLowerCase()] ?? h
    },
  },
  {
    id: 'citi',
    name: 'Citi',
    emoji: '💳',
    instructions: [
      'Log in to citi.com',
      'Go to your card → click "Download Transactions"',
      'Select date range → choose "CSV"',
      'Download and upload the file here',
    ],
    sampleHeaders: 'Status,Date,Description,Debit,Credit',
    normalizeHeaders: (h: string) => {
      const map: Record<string, string> = { 'description': 'merchant', 'debit': 'amount' }
      return map[h.toLowerCase()] ?? h
    },
  },
  {
    id: 'generic-csv',
    name: 'Generic / Other',
    emoji: '📄',
    instructions: [
      'Export a CSV from your bank or credit card',
      'Make sure it has columns for: Date, Description/Merchant, and Amount',
      'Upload the file — Flow will auto-detect columns',
    ],
  },
]

export function getBankTemplate(id: string): BankTemplate | undefined {
  return BANK_TEMPLATES.find(t => t.id === id)
}

// ── V9.0 CSV Parser ───────────────────────────────────────────────────────────
// Pure, side-effect-free CSV parsing utilities.
// Handles quoted fields, escaped quotes, CRLF, LF, and trailing newlines.

export type CsvRow = Record<string, string>

export type CsvParseResult = {
  headers: string[]
  rows: CsvRow[]
  rawRowCount: number        // total data rows attempted (including skipped)
  skippedCount: number       // rows skipped due to wrong column count
  errorMessage?: string      // set when the file is structurally unusable
}

/**
 * Parse a raw CSV string into structured rows.
 * Returns an error message when the file is empty or has no usable headers.
 */
export function parseCsv(raw: string): CsvParseResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { headers: [], rows: [], rawRowCount: 0, skippedCount: 0, errorMessage: 'The CSV file is empty.' }
  }

  const lines = splitCsvLines(trimmed)
  if (lines.length < 2) {
    return { headers: [], rows: [], rawRowCount: 0, skippedCount: 0, errorMessage: 'The CSV file must have at least a header row and one data row.' }
  }

  const headers = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  if (headers.length === 0 || headers.every(h => h === '')) {
    return { headers: [], rows: [], rawRowCount: 0, skippedCount: 0, errorMessage: 'Could not read CSV headers. Check the file format.' }
  }

  const rows: CsvRow[] = []
  let skippedCount = 0
  const dataLines = lines.slice(1)

  for (const line of dataLines) {
    if (line.trim() === '') continue  // skip blank lines
    const cells = parseCsvLine(line)
    if (cells.length !== headers.length) {
      skippedCount++
      continue
    }
    const row: CsvRow = {}
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (cells[i] ?? '').trim()
    }
    rows.push(row)
  }

  return { headers, rows, rawRowCount: dataLines.filter(l => l.trim() !== '').length, skippedCount }
}

/** Split CSV text into logical lines, respecting quoted fields that may contain newlines. */
function splitCsvLines(text: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
        current += ch
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++  // skip LF after CR
      lines.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) lines.push(current)
  return lines
}

/** Parse a single CSV line into an array of field values (unquoted). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  fields.push(field)
  return fields
}

// ── Column detection ──────────────────────────────────────────────────────────
// Tries to auto-detect which CSV column maps to each required import field.
// Returns the best-guess header name, or '' if no match found.

const DATE_ALIASES     = ['date', 'transaction date', 'txn date', 'posted date', 'post date', 'trans date']
const MERCHANT_ALIASES = ['merchant', 'description', 'payee', 'name', 'memo', 'vendor', 'merchant name', 'transaction description']
const AMOUNT_ALIASES   = ['amount', 'debit', 'credit', 'transaction amount', 'txn amount', 'charge', 'payment']
const ACCOUNT_ALIASES  = ['account', 'account name', 'account number', 'bank']
const NOTES_ALIASES    = ['notes', 'note', 'memo', 'details', 'reference']

function firstMatch(headers: string[], aliases: string[]): string {
  for (const alias of aliases) {
    const hit = headers.find(h => h === alias)
    if (hit) return hit
  }
  // Fuzzy fallback — contains
  for (const alias of aliases) {
    const hit = headers.find(h => h.includes(alias) || alias.includes(h))
    if (hit) return hit
  }
  return ''
}

export type ColumnMapping = {
  date: string
  merchant: string
  amount: string
  account: string
  notes: string
}

export function detectColumns(headers: string[]): ColumnMapping {
  return {
    date:     firstMatch(headers, DATE_ALIASES),
    merchant: firstMatch(headers, MERCHANT_ALIASES),
    amount:   firstMatch(headers, AMOUNT_ALIASES),
    account:  firstMatch(headers, ACCOUNT_ALIASES),
    notes:    firstMatch(headers, NOTES_ALIASES),
  }
}

// ── Sample CSV generator ──────────────────────────────────────────────────────

const SAMPLE_CSV_ROWS: Array<{ date: string; merchant: string; amount: string; type: string; notes: string }> = [
  { date: '',  merchant: 'Starbucks',        amount: '6.50',   type: 'expense', notes: '' },
  { date: '',  merchant: 'Whole Foods',       amount: '84.20',  type: 'expense', notes: 'Groceries' },
  { date: '',  merchant: 'Payroll',           amount: '1850.00',type: 'income',  notes: 'Direct deposit' },
  { date: '',  merchant: 'Shell',             amount: '42.00',  type: 'expense', notes: 'Gas' },
  { date: '',  merchant: "McDonald's",        amount: '11.75',  type: 'expense', notes: '' },
  { date: '',  merchant: 'Amazon',            amount: '34.99',  type: 'expense', notes: 'Order #112' },
  { date: '',  merchant: 'Costco',            amount: '127.60', type: 'expense', notes: 'Groceries + supplies' },
  { date: '',  merchant: 'Uber',              amount: '18.40',  type: 'expense', notes: '' },
  { date: '',  merchant: 'Chase Transfer',    amount: '200.00', type: 'transfer',notes: 'Savings transfer' },
  { date: '',  merchant: 'Target',            amount: '55.30',  type: 'expense', notes: '' },
  { date: '',  merchant: 'Netflix',           amount: '15.99',  type: 'expense', notes: 'Subscription' },
  { date: '',  merchant: 'Lyft',              amount: '22.50',  type: 'expense', notes: '' },
  { date: '',  merchant: 'Chipotle',          amount: '14.80',  type: 'expense', notes: '' },
  { date: '',  merchant: 'Best Buy',          amount: '89.00',  type: 'expense', notes: 'Cable' },
  { date: '',  merchant: 'Venmo Cashout',     amount: '150.00', type: 'income',  notes: '' },
  { date: '',  merchant: 'Chevron',           amount: '38.00',  type: 'expense', notes: '' },
  { date: '',  merchant: 'Credit Card Payment', amount: '300.00', type: 'credit card payment', notes: 'Amex payment' },
  { date: '',  merchant: 'Walmart',           amount: '66.45',  type: 'expense', notes: '' },
  { date: '',  merchant: 'Apple',             amount: '9.99',   type: 'expense', notes: 'iCloud' },
  { date: '',  merchant: 'Payroll',           amount: '1850.00',type: 'income',  notes: 'Bi-weekly paycheck' },
]

/** Generate a sample CSV string with realistic rows dated within the last 30 days. */
export function generateSampleCsvString(): string {
  const today = new Date()
  const rows = SAMPLE_CSV_ROWS.map((r, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (i % 28))
    const date = d.toISOString().slice(0, 10)
    return { ...r, date }
  })

  const header = 'date,merchant,amount,type,notes'
  const lines = rows.map(r =>
    [r.date, `"${r.merchant}"`, r.amount, r.type, r.notes ? `"${r.notes}"` : ''].join(',')
  )
  return [header, ...lines].join('\n')
}

/** Trigger a browser download of the sample CSV. */
export function downloadSampleCsv(): void {
  const content = generateSampleCsvString()
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'flow-sample-import.csv'
  a.click()
  URL.revokeObjectURL(url)
}
