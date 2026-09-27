// Small text helpers shared by the components.

// "1 move", "3 moves". Regular plurals only.
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
