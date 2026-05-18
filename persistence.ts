// ── Import Category Hint Resolution ──────────────────────────────────────────
// Resolves the best category hint for a merchant using a strict priority order:
//   1. Transaction rule match  → confidence: 'high'
//   2. Category memory lookup  → confidence: 'medium'
//   3. CSV-provided category   → confidence: 'low'
//   4. No match                → null

export type HintResult = {
  categoryId: string
  categoryName: string
  confidence: 'high' | 'medium' | 'low'
  source: 'rule' | 'memory' | 'history' | 'csv'
}

export function resolveHint(
  normalizedMerchant: string,
  csvHint: string,
  rules: { id: string; matchText: string; matchField: string; categoryId: string }[],
  categories: { id: string; name: string }[],
  memory: Record<string, string>,
): HintResult | null {
  const key = normalizedMerchant.toLowerCase()

  // Priority 1: Rule match (High)
  for (const rule of rules) {
    if (rule.matchField === 'merchant') {
      const terms = rule.matchText.split(',').map(t => t.trim().toLowerCase())
      if (terms.some(t => t && key.includes(t))) {
        const cat = categories.find(c => c.id === rule.categoryId)
        if (cat) return { categoryId: cat.id, categoryName: cat.name, confidence: 'high', source: 'rule' }
      }
    }
  }

  // Priority 2: Category memory — previously assigned by the user (Medium)
  if (memory[key]) {
    const cat = categories.find(c => c.id === memory[key])
    if (cat) return { categoryId: cat.id, categoryName: cat.name, confidence: 'medium', source: 'memory' }
  }

  // Priority 3: CSV-provided category that matches a budget category name (Low)
  if (csvHint) {
    const cat = categories.find(c => c.name.toLowerCase() === csvHint.toLowerCase())
    if (cat) return { categoryId: cat.id, categoryName: cat.name, confidence: 'low', source: 'csv' }
  }

  return null
}
