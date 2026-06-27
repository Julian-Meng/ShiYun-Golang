package engine

import "math/big"

// ── Babel catalog: base-N rank/unrank ──
// Poem = [c0..c{L-1}] in reading order, ci ∈ [0,N).
// First char is MOST-significant digit: index = Σ ci·N^(L-1-i).

// BabelUnrank converts a Babel index to a sequence of L char-ids in [0,N).
func BabelUnrank(L int, N *big.Int, k *big.Int) []int {
	out := make([]int, L)
	rem := new(big.Int).Set(k)
	n := new(big.Int)
	for i := L - 1; i >= 0; i-- {
		rem.DivMod(rem, N, n)
		out[i] = int(n.Int64())
	}
	return out
}

// BabelRank converts L char-ids to a Babel index.
func BabelRank(N *big.Int, chars []int) *big.Int {
	k := new(big.Int)
	for _, c := range chars {
		k.Mul(k, N)
		k.Add(k, big.NewInt(int64(c)))
	}
	return k
}

// BabelSize returns N^L — the total number of Babel poems of length L.
func BabelSize(L int, N *big.Int) *big.Int {
	return new(big.Int).Exp(N, big.NewInt(int64(L)), nil)
}

// PrefixIndex returns the smallest Babel index sharing a given leading prefix.
func PrefixIndex(L int, N *big.Int, prefix []int) *big.Int {
	padded := make([]int, L)
	copy(padded, prefix)
	return BabelRank(N, padded)
}

// PrefixRange returns N^(L-locked) — the number of poems sharing a prefix.
func PrefixRange(L int, N *big.Int, locked int) *big.Int {
	d := L - locked
	if d < 0 {
		d = 0
	}
	return new(big.Int).Exp(N, big.NewInt(int64(d)), nil)
}
