// Small text helpers shared by the components.

// "1 move", "3 moves". Regular plurals only.
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// What happens to a unit set up where it can't survive (see survivalRisks in
// the store), in words: "No Burrowing: dies on the first move".
const SURVIVAL_WORDS = {
  underground: ['Burrowing', 'dies'],
  underwater: ['Submerge', 'drowns'],
  void: ['Voidwalk', 'is banished'],
}
// Just the reason: "No Burrowing" (for a list under its own heading).
export const survivalReason = (region) => `No ${(SURVIVAL_WORDS[region] || ['the keyword'])[0]}`

export const survivalWarning = (region) => {
  const [keyword, fate] = SURVIVAL_WORDS[region] || ['the keyword', 'dies']
  return `No ${keyword}: ${fate} on the first move`
}
