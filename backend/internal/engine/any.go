package engine

import "math/big"

// ── Arbitrary-length 自由 catalog (bijective numeration) ──
// Symbols = 字库 ids 0..N-1 plus a line-break symbol = N, in bijective base-(N+1).
// Every non-empty symbol string ⇄ a unique positive integer; empty ⇄ 0.
// anyUnrank(N, anyRank(N, s)) === s for every s with each symbol in [0,N].

// AnyRank encodes a symbol sequence into a unique positive integer.
// Symbols are in [0,N] where N is the line-break symbol.
func AnyRank(N int, syms []int) *big.Int {
	B := big.NewInt(int64(N + 1))
	k := new(big.Int)
	for _, s := range syms {
		k.Mul(k, B)
		k.Add(k, big.NewInt(int64(s+1))) // digits 1..N+1 (bijective ⇒ no leading-zero clash)
	}
	return k
}

// AnyUnrank decodes an index back to a symbol sequence (most-significant first).
func AnyUnrank(N int, index *big.Int) []int {
	B := big.NewInt(int64(N + 1))
	out := make([]int, 0)
	k := new(big.Int).Set(index)
	one := big.NewInt(1)
	rem := new(big.Int)
	for k.Sign() > 0 {
		k.Sub(k, one)
		k.DivMod(k, B, rem)
		out = append(out, int(rem.Int64()))
	}
	// Reverse to get most-significant first
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

// SplitAny splits a symbol sequence into display lines at break symbols (id == N).
func SplitAny(N int, syms []int) [][]int {
	var lines [][]int
	var cur []int
	for _, id := range syms {
		if id == N {
			if len(cur) > 0 {
				lines = append(lines, cur)
				cur = nil
			}
		} else {
			cur = append(cur, id)
		}
	}
	if len(cur) > 0 {
		lines = append(lines, cur)
	}
	if len(lines) == 0 {
		lines = [][]int{{}}
	}
	return lines
}

// SymsToLines converts symbol sequences to string lines using the charset.
func SymsToLines(charset []string, syms [][]int) []string {
	lines := make([]string, 0, len(syms))
	for _, s := range syms {
		var line string
		for _, id := range s {
			if id >= 0 && id < len(charset) {
				line += charset[id]
			}
		}
		lines = append(lines, line)
	}
	return lines
}
